import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { ExternalCalendarService } from './external-calendar.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';

@Injectable()
export class CalendarSyncScheduler {
  private readonly logger = new Logger(CalendarSyncScheduler.name);

  constructor(
    private readonly calendarSourceService: CalendarSourceService,
    private readonly externalCalendarService: ExternalCalendarService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePeriodicSync(): Promise<void> {
    this.logger.log('Starting periodic calendar synchronization');

    try {
      // Get all tenant IDs
      const tenantIds = await this.tenantConnectionService.getAllTenantIds();
      
      if (tenantIds.length === 0) {
        this.logger.debug('No tenants found, skipping sync');
        return;
      }

      let totalSynced = 0;

      // Process each tenant separately
      for (const tenantId of tenantIds) {
        try {
          const syncedCount = await this.syncTenantCalendars(tenantId);
          totalSynced += syncedCount;
        } catch (error) {
          this.logger.error(`Failed to sync calendars for tenant ${tenantId}:`, error.message);
          // Continue with other tenants even if one fails
        }
      }

      this.logger.log(`Periodic sync completed: ${totalSynced} calendar sources synced across ${tenantIds.length} tenants`);
    } catch (error) {
      this.logger.error('Periodic sync failed:', error.message);
    }
  }

  private async syncTenantCalendars(tenantId: string): Promise<number> {
    this.logger.debug(`Syncing calendars for tenant: ${tenantId}`);

    // Get all active calendar sources for this tenant
    const calendarSources = await this.calendarSourceService.findAllActiveSources(tenantId);

    if (calendarSources.length === 0) {
      this.logger.debug(`No calendar sources found for tenant: ${tenantId}`);
      return 0;
    }

    let syncedCount = 0;

    // Check each calendar source to see if it needs syncing
    for (const calendarSource of calendarSources) {
      try {
        if (await this.needsSync(calendarSource)) {
          await this.syncCalendarSource(calendarSource, tenantId);
          syncedCount++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to sync calendar source ${calendarSource.ulid} for tenant ${tenantId}:`,
          error.message
        );
        // Continue with other calendar sources even if one fails
      }
    }

    this.logger.debug(`Synced ${syncedCount}/${calendarSources.length} calendar sources for tenant: ${tenantId}`);
    return syncedCount;
  }

  private async syncCalendarSource(
    calendarSource: CalendarSourceEntity,
    tenantId: string,
  ): Promise<void> {
    this.logger.log(`Syncing calendar source: ${calendarSource.name} (${calendarSource.ulid})`);

    try {
      // Perform the sync
      const syncResult = await this.externalCalendarService.syncCalendarSource(
        calendarSource,
        tenantId,
      );

      // Update the last synced timestamp
      await this.calendarSourceService.updateSyncStatus(
        calendarSource.id,
        syncResult.lastSyncedAt,
        tenantId,
      );

      this.logger.log(
        `Successfully synced calendar source ${calendarSource.ulid}: ${syncResult.eventsCount} events`
      );
    } catch (error) {
      this.logger.error(
        `Sync failed for calendar source ${calendarSource.ulid}:`,
        error.message
      );
      // Re-throw to be handled by the calling method
      throw error;
    }
  }

  async needsSync(calendarSource: CalendarSourceEntity): Promise<boolean> {
    // Inactive sources should not be synced
    if (!calendarSource.isActive) {
      return false;
    }

    // Sources that have never been synced should be synced
    if (!calendarSource.lastSyncedAt) {
      return true;
    }

    // Calculate if the source is overdue for sync based on its sync frequency
    const syncFrequencyMs = calendarSource.syncFrequency * 60 * 1000; // Convert minutes to milliseconds
    const timeSinceLastSync = Date.now() - calendarSource.lastSyncedAt.getTime();

    return timeSinceLastSync >= syncFrequencyMs;
  }
}