import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable()
export class MatrixBotRotationService {
  private readonly logger = new Logger(MatrixBotRotationService.name);

  constructor(
    private readonly matrixBotUserService: MatrixBotUserService,
    private readonly configService: ConfigService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Run password rotation for all tenants daily at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async rotatePasswordsForAllTenants(): Promise<void> {
    const isRotationEnabled =
      this.configService.get<boolean>('matrix.bot.passwordRotationEnabled', {
        infer: true,
      }) ?? true;

    if (!isRotationEnabled) {
      this.logger.debug('Bot password rotation is disabled');
      return;
    }

    this.logger.log('Starting bot password rotation check for all tenants');

    try {
      // Get all tenant IDs - this will need to be implemented based on your tenant management
      const tenantIds = await this.getAllTenantIds();

      let rotatedCount = 0;
      let errorCount = 0;

      for (const tenantId of tenantIds) {
        try {
          await this.rotatePasswordIfNeeded(tenantId);
          rotatedCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Failed to rotate password for tenant ${tenantId}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Password rotation completed. Processed: ${tenantIds.length}, Rotated: ${rotatedCount}, Errors: ${errorCount}`,
      );
    } catch (error) {
      this.logger.error(`Failed to run password rotation: ${error.message}`);
    }
  }

  /**
   * Rotate password for a specific tenant if needed
   */
  async rotatePasswordIfNeeded(tenantId: string): Promise<boolean> {
    try {
      const needsRotation =
        await this.matrixBotUserService.needsPasswordRotation(tenantId);

      if (needsRotation) {
        await this.matrixBotUserService.rotateBotPassword(tenantId);
        this.logger.log(`Rotated bot password for tenant: ${tenantId}`);
        return true;
      } else {
        this.logger.debug(
          `Bot password for tenant ${tenantId} does not need rotation`,
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `Error checking/rotating password for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Force rotate password for a specific tenant
   */
  async forceRotatePassword(tenantId: string): Promise<void> {
    this.logger.log(`Force rotating bot password for tenant: ${tenantId}`);

    try {
      await this.matrixBotUserService.rotateBotPassword(tenantId);
      this.logger.log(
        `Successfully force rotated bot password for tenant: ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to force rotate password for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get all tenant IDs from the system
   * This is a placeholder - implement based on your tenant management system
   */
  private getAllTenantIds(): Promise<string[]> {
    try {
      // This needs to be implemented based on how you track tenants
      // For now, return empty array to avoid errors
      this.logger.warn(
        'getAllTenantIds not implemented - no tenants will be processed',
      );
      return Promise.resolve([]);

      // Example implementation might look like:
      // const tenants = await this.tenantService.getAllTenants();
      // return tenants.map(tenant => tenant.id);
    } catch (error) {
      this.logger.error(`Failed to get tenant IDs: ${error.message}`);
      return Promise.resolve([]);
    }
  }

  /**
   * Manual trigger for password rotation (for admin use)
   */
  async triggerManualRotation(tenantIds?: string[]): Promise<void> {
    this.logger.log('Manual password rotation triggered');

    const targetTenants = tenantIds || (await this.getAllTenantIds());

    let successCount = 0;
    let errorCount = 0;

    for (const tenantId of targetTenants) {
      try {
        await this.forceRotatePassword(tenantId);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger.error(
          `Manual rotation failed for tenant ${tenantId}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Manual rotation completed. Success: ${successCount}, Errors: ${errorCount}`,
    );
  }
}
