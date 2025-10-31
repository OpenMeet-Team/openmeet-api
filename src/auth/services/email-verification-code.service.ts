import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
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
    // Invalidate any existing codes for this user before generating a new one
    await this.invalidateExistingCodes(userId, tenantId);

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

        // Store reverse mapping for invalidation
        await this.storeUserCodeMapping(userId, tenantId, code);

        this.logger.log(
          `Generated email verification code for user ${userId}, tenant ${tenantId}`,
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

      // Security check: email must match (using constant-time comparison to prevent timing attacks)
      const expectedEmail = Buffer.from(data.email.toLowerCase(), 'utf8');
      const providedEmail = Buffer.from(email.toLowerCase(), 'utf8');

      // Ensure same length to prevent length-based timing attacks
      if (expectedEmail.length !== providedEmail.length) {
        this.logger.debug('Email verification code validation failed');
        return null;
      }

      try {
        const emailsMatch = crypto.timingSafeEqual(
          expectedEmail,
          providedEmail,
        );
        if (!emailsMatch) {
          this.logger.debug('Email verification code validation failed');
          return null;
        }
      } catch {
        this.logger.debug('Email verification code validation failed');
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
        `Email verification code validated and consumed for user ${data.userId}`,
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
   * Generate a cryptographically secure random numeric code of specified length
   */
  private generateNumericCode(length: number): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const range = max - min + 1;

    // Use cryptographically secure random number generation
    const randomValue = crypto.randomInt(range);
    const code = min + randomValue;

    return code.toString().padStart(length, '0');
  }

  /**
   * Store reverse mapping from userId to code for invalidation
   */
  private async storeUserCodeMapping(
    userId: number,
    tenantId: string,
    code: string,
  ): Promise<void> {
    const mappingKey = `email_verification_user:${tenantId}:${userId}`;
    await this.elastiCacheService.set(mappingKey, code, this.codeExpirySeconds);
  }

  /**
   * Invalidate any existing codes for this user
   */
  private async invalidateExistingCodes(
    userId: number,
    tenantId: string,
  ): Promise<void> {
    const mappingKey = `email_verification_user:${tenantId}:${userId}`;
    const existingCode = await this.elastiCacheService.get<string>(mappingKey);

    if (existingCode) {
      const codeKey = this.getRedisKey(existingCode);
      await this.elastiCacheService.del(codeKey);
      this.logger.log(
        `Invalidated previous verification code for user ${userId}, tenant ${tenantId}`,
      );
    }
  }
}
