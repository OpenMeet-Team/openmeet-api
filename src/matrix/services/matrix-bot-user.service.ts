import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class MatrixBotUserService {
  private readonly logger = new Logger(MatrixBotUserService.name);

  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a secure random password for bot users
   */
  private generateSecurePassword(): string {
    // Generate 32 random bytes and convert to base64
    const buffer = randomBytes(32);
    return buffer.toString('base64').replace(/[+/=]/g, '').substring(0, 24);
  }

  /**
   * Get bot email for a tenant
   */
  private getBotEmail(tenantId: string): string {
    const botEmailDomain =
      this.configService.get<string>('BOT_EMAIL_DOMAIN', { infer: true }) ??
      'openmeet.net';
    return `bot-${tenantId}@${botEmailDomain}`;
  }

  /**
   * Get bot slug for a tenant
   */
  private getBotSlug(tenantId: string): string {
    return `openmeet-bot-${tenantId}`;
  }

  /**
   * Find existing bot user for tenant
   */
  async findBotUser(tenantId: string): Promise<UserEntity | null> {
    try {
      const botEmail = this.getBotEmail(tenantId);
      return await this.userService.findByEmail(botEmail, tenantId);
    } catch (error) {
      this.logger.debug(
        `Bot user not found for tenant ${tenantId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get bot password from tenant configuration
   */
  private getBotPasswordFromConfig(tenantId: string): string | null {
    try {
      // Get tenant configuration
      const tenantsB64 = this.configService.get<string>('TENANTS_B64', {
        infer: true,
      });
      if (!tenantsB64) {
        return null;
      }

      const tenants = JSON.parse(Buffer.from(tenantsB64, 'base64').toString());
      const tenant = tenants.find((t: any) => t.id === tenantId);

      return tenant?.matrixConfig?.botUser?.password || null;
    } catch (error) {
      this.logger.warn(
        `Failed to get bot password from config for tenant ${tenantId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Create a dedicated bot user for a tenant
   */
  async createBotUser(tenantId: string): Promise<UserEntity> {
    this.logger.log(`Creating dedicated bot user for tenant: ${tenantId}`);

    const botEmail = this.getBotEmail(tenantId);
    const botSlug = this.getBotSlug(tenantId);

    // Try to get password from tenant config, fallback to generated password
    const configPassword = this.getBotPasswordFromConfig(tenantId);
    const botPassword = configPassword || this.generateSecurePassword();

    if (configPassword) {
      this.logger.log(
        `Using configured password for bot user in tenant: ${tenantId}`,
      );
    } else {
      this.logger.warn(
        `No configured password found for bot user in tenant ${tenantId}, using generated password`,
      );
    }

    try {
      // Check if bot user already exists
      const existingBot = await this.findBotUser(tenantId);
      if (existingBot) {
        this.logger.log(
          `Bot user already exists for tenant ${tenantId}: ${existingBot.slug}`,
        );
        return existingBot;
      }

      // Create the bot user
      const botUser = await this.userService.create(
        {
          email: botEmail,
          firstName: 'OpenMeet',
          lastName: 'Bot',
          password: botPassword,
          role: 2, // User role ID
          // Bot users should be verified by default
          status: { id: 1 }, // Assuming 1 is active status
        },
        tenantId,
      );

      // Update the slug to our desired format after creation
      await this.userService.update(botUser.id, { slug: botSlug }, tenantId);

      this.logger.log(
        `Successfully created bot user for tenant ${tenantId}: ${botUser.slug}`,
      );

      // Store the initial password creation timestamp
      await this.recordPasswordRotation(tenantId, botUser.id);

      return botUser as UserEntity;
    } catch (error) {
      this.logger.error(
        `Failed to create bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get or create bot user for a tenant
   */
  async getOrCreateBotUser(tenantId: string): Promise<UserEntity> {
    let botUser = await this.findBotUser(tenantId);

    if (!botUser) {
      botUser = await this.createBotUser(tenantId);
    }

    return botUser;
  }

  /**
   * Rotate bot user password
   */
  async rotateBotPassword(tenantId: string): Promise<void> {
    this.logger.log(`Rotating bot password for tenant: ${tenantId}`);

    const botUser = await this.findBotUser(tenantId);
    if (!botUser) {
      throw new Error(`Bot user not found for tenant ${tenantId}`);
    }

    const newPassword = this.generateSecurePassword();

    try {
      // Update the bot user's password directly
      await this.userService.update(
        botUser.id,
        { password: newPassword },
        tenantId,
      );

      // Record the rotation
      await this.recordPasswordRotation(tenantId, botUser.id);

      this.logger.log(
        `Successfully rotated bot password for tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to rotate bot password for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if bot password needs rotation based on configured interval
   */
  async needsPasswordRotation(tenantId: string): Promise<boolean> {
    const rotationIntervalDays =
      this.configService.get<number>('matrix.bot.passwordRotationDays', {
        infer: true,
      }) ?? 30;
    const lastRotation = await this.getLastPasswordRotation(tenantId);

    if (!lastRotation) {
      return true; // No rotation recorded, should rotate
    }

    const daysSinceRotation = Math.floor(
      (Date.now() - lastRotation.getTime()) / (1000 * 60 * 60 * 24),
    );

    return daysSinceRotation >= rotationIntervalDays;
  }

  /**
   * Get bot user with fallback to admin user for backward compatibility
   */
  async getBotUserWithFallback(tenantId: string): Promise<UserEntity> {
    // Try to get dedicated bot user first
    let botUser = await this.findBotUser(tenantId);

    if (botUser) {
      this.logger.debug(
        `Using dedicated bot user for tenant ${tenantId}: ${botUser.slug}`,
      );
      return botUser;
    }

    // Fall back to admin user for existing tenants
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL', {
      infer: true,
    });
    if (!adminEmail) {
      throw new Error('No admin email configured and no bot user found');
    }

    botUser = await this.userService.findByEmail(adminEmail, tenantId);
    if (!botUser) {
      throw new Error(`No bot or admin user found for tenant ${tenantId}`);
    }

    this.logger.warn(
      `Using admin user as bot for tenant ${tenantId}. Consider creating dedicated bot user.`,
    );
    return botUser;
  }

  /**
   * Record password rotation timestamp
   */
  private recordPasswordRotation(
    tenantId: string,
    userId: number,
  ): Promise<void> {
    // This could be stored in a dedicated table or as user metadata
    // For now, we'll use a simple approach with user metadata or configuration
    const timestamp = new Date().toISOString();

    // Store in a way that can be retrieved later
    // This might need to be adapted based on your configuration storage approach
    try {
      // Example: store as user metadata or in a dedicated audit table
      this.logger.debug(
        `Recording password rotation for tenant ${tenantId}, user ${userId} at ${timestamp}`,
      );
      // Implementation depends on your preferred storage mechanism
      return Promise.resolve();
    } catch (error) {
      this.logger.warn(
        `Failed to record password rotation timestamp: ${error.message}`,
      );
      return Promise.resolve();
    }
  }

  /**
   * Get last password rotation timestamp
   */
  private getLastPasswordRotation(_tenantId: string): Promise<Date | null> {
    try {
      // Retrieve stored timestamp
      // Implementation depends on your storage mechanism
      // For now, return null to trigger rotation on first check
      return Promise.resolve(null);
    } catch (error) {
      this.logger.warn(
        `Failed to get last password rotation: ${error.message}`,
      );
      return Promise.resolve(null);
    }
  }

  /**
   * Delete bot user for a tenant (cleanup)
   */
  async deleteBotUser(tenantId: string): Promise<void> {
    this.logger.log(`Deleting bot user for tenant: ${tenantId}`);

    const botUser = await this.findBotUser(tenantId);
    if (!botUser) {
      this.logger.warn(`No bot user found to delete for tenant ${tenantId}`);
      return;
    }

    try {
      await this.userService.remove(botUser.id);
      this.logger.log(
        `Successfully deleted bot user for tenant ${tenantId}: ${botUser.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete bot user for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Update bot user password to a known value for authentication
   */
  async updateBotPassword(
    tenantId: string,
    newPassword: string,
  ): Promise<void> {
    this.logger.log(`Updating bot password for tenant: ${tenantId}`);

    const botUser = await this.findBotUser(tenantId);
    if (!botUser) {
      throw new Error(`Bot user not found for tenant ${tenantId}`);
    }

    try {
      await this.userService.update(
        botUser.id,
        { password: newPassword },
        tenantId,
      );

      this.logger.log(
        `Successfully updated bot password for tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update bot password for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * List all bot users across tenants (for admin purposes)
   */
  listAllBotUsers(): Promise<Array<{ tenantId: string; botUser: UserEntity }>> {
    // This would require cross-tenant queries which might not be straightforward
    // Implementation depends on your tenant architecture
    this.logger.warn(
      'listAllBotUsers not implemented - requires cross-tenant query support',
    );
    return Promise.resolve([]);
  }
}
