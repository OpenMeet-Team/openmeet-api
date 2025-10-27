import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import { AllConfigType } from '../../config/config.type';

interface EmailVerificationData {
  userId: number;
  tenantId: string;
  email: string;
  createdAt: number;
}

@Injectable()
export class EmailVerificationCodeService {
  private readonly logger = new Logger(EmailVerificationCodeService.name);
  private readonly codeExpirySeconds: number;
  private readonly codeLength: number;
  private readonly maxCollisionRetries: number;

  constructor(
    private readonly elastiCacheService: ElastiCacheService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    const config = this.configService.get('auth.emailVerification', {
      infer: true,
    });

    // Get values from config (which handles env vars and defaults)
    this.codeExpirySeconds = config?.expirySeconds ?? 15 * 60; // Default 15 minutes
    this.codeLength = config?.codeLength ?? 6; // Default 6 digits
    this.maxCollisionRetries = config?.maxCollisionRetries ?? 5; // Default 5 retries

    this.logger.log(
      `Email verification configured: ${this.codeLength}-digit codes, ${this.codeExpirySeconds}s expiry (${Math.floor(this.codeExpirySeconds / 60)} minutes), ${this.maxCollisionRetries} max retries`,
    );
  }

  /**
   * Generate a 6-digit email verification code
   * @param userId - User ID to associate with the code
   * @param tenantId - Tenant ID
   * @param email - Email address (security: code only works with this email)
   */
  async generateCode(
    userId: number,
    tenantId: string,
    email: string,
  ): Promise<string> {
    let attempts = 0;

    while (attempts < this.maxCollisionRetries) {
      const code = this.generateNumericCode(this.codeLength);
      const key = this.getRedisKey(code);

      // Check for collision
      const existing = await this.elastiCacheService.get(key);

      if (!existing) {
        const data: EmailVerificationData = {
          userId,
          tenantId,
          email: email.toLowerCase(),
          createdAt: Date.now(),
        };

        await this.elastiCacheService.set(key, data, this.codeExpirySeconds);

        this.logger.log(
          `Generated email verification code for user ${userId} (${email}), tenant ${tenantId}`,
        );
        return code;
      }

      attempts++;
      this.logger.warn(
        `Email code collision detected (attempt ${attempts}/${this.maxCollisionRetries})`,
      );
    }

    throw new Error(
      'Failed to generate unique email verification code after maximum retries',
    );
  }

  /**
   * Validate and consume an email verification code
   * @param code - The 6-digit code
   * @param email - Email address for security validation (must match stored email)
   * @returns Email verification data if valid, null otherwise
   */
  async validateCode(
    code: string,
    email: string,
  ): Promise<EmailVerificationData | null> {
    // Validate code format (must match configured length)
    const codeRegex = new RegExp(`^\\d{${this.codeLength}}$`);
    if (!codeRegex.test(code)) {
      this.logger.debug(`Invalid email verification code format: ${code}`);
      return null;
    }

    const key = this.getRedisKey(code);

    try {
      const data =
        await this.elastiCacheService.get<EmailVerificationData>(key);

      if (!data) {
        this.logger.debug(`Email verification code not found or expired`);
        return null;
      }

      // Security check: email must match
      if (data.email.toLowerCase() !== email.toLowerCase()) {
        this.logger.warn(
          `Email verification code email mismatch. Expected: ${data.email}, Got: ${email}`,
        );
        return null;
      }

      // Check if expired (redundant with Redis TTL, but good for logging)
      if (Date.now() - data.createdAt > this.codeExpirySeconds * 1000) {
        this.logger.warn(
          `Email verification code expired for user ${data.userId}`,
        );
        await this.elastiCacheService.del(key);
        return null;
      }

      // Consume the code (one-time use)
      await this.elastiCacheService.del(key);
      this.logger.log(
        `Email verification code validated and consumed for user ${data.userId} (${email})`,
      );

      return data;
    } catch (error) {
      this.logger.error(
        `Error validating email verification code: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get expiry time in minutes
   */
  getExpiryMinutes(): number {
    return Math.floor(this.codeExpirySeconds / 60);
  }

  /**
   * Get Redis key for email verification code
   */
  private getRedisKey(code: string): string {
    return `email_verification:${code}`;
  }

  /**
   * Generate a random numeric code of specified length
   */
  private generateNumericCode(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const code = Math.floor(Math.random() * (max - min + 1)) + min;
    return code.toString().padStart(length, '0');
  }
}
