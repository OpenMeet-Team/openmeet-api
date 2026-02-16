import { Injectable, Logger } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantConnectionService } from '../tenant/tenant.service';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

@Injectable()
export class AtprotoSyncScheduler {
  private readonly logger = new Logger(AtprotoSyncScheduler.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handlePendingSyncRetry(): Promise<void> {
    this.logger.debug('Starting ATProto pending sync retry');

    const tenantIds = await this.tenantConnectionService.getAllTenantIds();

    for (const tenantId of tenantIds) {
      try {
        await this.syncTenant(tenantId);
      } catch (error) {
        this.logger.error(
          `Failed ATProto sync retry for tenant ${tenantId}: ${error.message}`,
        );
      }
    }
  }

  private async syncTenant(tenantId: string): Promise<void> {
    const connection =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const eventRepository = connection.getRepository(EventEntity);

    const staleEvents = await eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .where('event.atprotoUri IS NOT NULL')
      .andWhere('event.sourceType IS NULL')
      .andWhere('event.updatedAt > event.atprotoSyncedAt')
      .getMany();

    if (staleEvents.length === 0) return;

    this.logger.log(
      `Found ${staleEvents.length} events pending ATProto sync for tenant ${tenantId}`,
    );

    // Resolve request-scoped AtprotoPublisherService with a tenant-aware context.
    // Durable providers (PdsSessionService, AtprotoIdentityService) inject REQUEST
    // and read request.tenantId — provide a synthetic request for cron context.
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { tenantId, headers: { 'x-tenant-id': tenantId } },
      contextId,
    );
    const publisherService = await this.moduleRef.resolve(
      AtprotoPublisherService,
      contextId,
    );

    for (const event of staleEvents) {
      try {
        const result = await publisherService.publishEvent(
          event,
          tenantId,
        );

        if (result.action === 'updated' || result.action === 'published') {
          await eventRepository.update(
            { id: event.id },
            {
              atprotoUri: result.atprotoUri,
              atprotoRkey: result.atprotoRkey,
              atprotoCid: result.atprotoCid,
              atprotoSyncedAt: new Date(),
            },
          );
          this.logger.log(`Retry-synced event ${event.slug} to ATProto`);
        }

        if (result.action === 'conflict') {
          this.logger.warn(
            `Conflict retrying event ${event.slug} — PDS record was modified externally`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to retry-sync event ${event.slug}: ${error.message}`,
        );
      }
    }
  }
}
