import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Simple bot user information for AppService authentication
 */
export interface BotUserInfo {
  slug: string;
  email: string;
}

/**
 * Simplified Matrix Bot User Service for AppService authentication
 *
 * With AppServices, we don't need to create/manage bot users in the database
 * or handle password rotation. The AppService handles user creation automatically.
 * This service just provides consistent bot usernames and info.
 */
@Injectable()
export class MatrixBotUserService {
  private readonly logger = new Logger(MatrixBotUserService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

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
   * Get bot user information for a tenant
   *
   * With AppServices, we just need the username - the AppService
   * handles user creation and authentication automatically.
   */
  async getOrCreateBotUser(tenantId: string): Promise<BotUserInfo> {
    const botSlug = this.getBotSlug(tenantId);
    const botEmail = this.getBotEmail(tenantId);

    this.logger.log(
      `Using AppService bot user: ${botSlug} for tenant ${tenantId}`,
    );

    return {
      slug: botSlug,
      email: botEmail,
    };
  }

  /**
   * Get bot user information with fallback compatibility
   *
   * Legacy method for backward compatibility. With AppServices,
   * we always use the same bot user pattern.
   */
  async getBotUserWithFallback(tenantId: string): Promise<BotUserInfo> {
    return this.getOrCreateBotUser(tenantId);
  }
}