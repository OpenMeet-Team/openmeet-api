import { Injectable, Logger } from '@nestjs/common';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class TenantBotSetupService {
  private readonly logger = new Logger(TenantBotSetupService.name);

  constructor(private readonly matrixBotUserService: MatrixBotUserService) {}

  /**
   * Initialize bot user for a new tenant
   * Should be called during tenant setup process
   */
  async initializeBotForTenant(tenantId: string): Promise<UserEntity> {
    this.logger.log(`Initializing bot user for new tenant: ${tenantId}`);

    try {
      const botUser = await this.matrixBotUserService.createBotUser(tenantId);

      this.logger.log(
        `Successfully initialized bot user for tenant ${tenantId}: ${botUser.slug}`,
      );
      return botUser;
    } catch (error) {
      this.logger.error(
        `Failed to initialize bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Cleanup bot user when tenant is deleted
   */
  async cleanupBotForTenant(tenantId: string): Promise<void> {
    this.logger.log(`Cleaning up bot user for tenant: ${tenantId}`);

    try {
      await this.matrixBotUserService.deleteBotUser(tenantId);
      this.logger.log(
        `Successfully cleaned up bot user for tenant: ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cleanup bot user for tenant ${tenantId}: ${error.message}`,
      );
      // Don't throw - cleanup should be best effort
    }
  }

  /**
   * Ensure bot user exists for existing tenant (migration helper)
   */
  async ensureBotForExistingTenant(tenantId: string): Promise<UserEntity> {
    this.logger.log(`Ensuring bot user exists for tenant: ${tenantId}`);

    try {
      // This will create if doesn't exist, or return existing
      const botUser =
        await this.matrixBotUserService.getOrCreateBotUser(tenantId);

      this.logger.log(
        `Bot user ensured for tenant ${tenantId}: ${botUser.slug}`,
      );
      return botUser;
    } catch (error) {
      this.logger.error(
        `Failed to ensure bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Verify bot user health for a tenant
   */
  async verifyBotHealth(tenantId: string): Promise<{
    exists: boolean;
    userSlug?: string;
    needsPasswordRotation?: boolean;
    error?: string;
  }> {
    try {
      const botUser = await this.matrixBotUserService.findBotUser(tenantId);

      if (!botUser) {
        return { exists: false };
      }

      const needsRotation =
        await this.matrixBotUserService.needsPasswordRotation(tenantId);

      return {
        exists: true,
        userSlug: botUser.slug,
        needsPasswordRotation: needsRotation,
      };
    } catch (error) {
      this.logger.error(
        `Error verifying bot health for tenant ${tenantId}: ${error.message}`,
      );
      return {
        exists: false,
        error: error.message,
      };
    }
  }
}
