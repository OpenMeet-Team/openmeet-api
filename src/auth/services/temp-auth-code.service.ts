import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

interface TempAuthData {
  userId: number;
  tenantId: string;
  createdAt: number;
}

@Injectable()
export class TempAuthCodeService {
  private readonly CODE_EXPIRY_SECONDS = 5 * 60; // 5 minutes

  constructor(private readonly elastiCacheService: ElastiCacheService) {}

  /**
   * Generate a temporary auth code for a user
   */
  async generateAuthCode(userId: number, tenantId: string): Promise<string> {
    const code = randomBytes(32).toString('hex');
    const key = this.getRedisKey(code);

    const authData: TempAuthData = {
      userId,
      tenantId,
      createdAt: Date.now(),
    };

    // Store in Redis with TTL
    await this.elastiCacheService.set(key, authData, this.CODE_EXPIRY_SECONDS);

    console.log(
      `🎫 Generated temp auth code for user ${userId}, tenant ${tenantId}: ${code.substring(0, 8)}...`,
    );
    return code;
  }

  /**
   * Validate and consume a temporary auth code
   */
  async validateAndConsumeAuthCode(code: string): Promise<TempAuthData | null> {
    const key = this.getRedisKey(code);

    try {
      const authData = await this.elastiCacheService.get<TempAuthData>(key);

      if (!authData) {
        console.log(`❌ Auth code not found: ${code.substring(0, 8)}...`);
        return null;
      }

      // Check if expired (redundant with Redis TTL, but good for logging)
      if (Date.now() - authData.createdAt > this.CODE_EXPIRY_SECONDS * 1000) {
        console.log(`⏰ Auth code expired: ${code.substring(0, 8)}...`);
        await this.elastiCacheService.del(key);
        return null;
      }

      // Consume the code (delete it after use)
      await this.elastiCacheService.del(key);
      console.log(
        `✅ Auth code validated and consumed for user ${authData.userId}, tenant ${authData.tenantId}`,
      );

      return authData;
    } catch (error) {
      console.error(`🚨 Error validating auth code: ${error.message}`);
      return null;
    }
  }

  /**
   * Get Redis key for auth code
   */
  private getRedisKey(code: string): string {
    return `matrix_auth_code:${code}`;
  }

  /**
   * Get current number of active codes (for debugging)
   * Note: This is less efficient with Redis, so use sparingly
   */
  getActiveCodeCount(): Promise<number> {
    // This would require scanning all keys matching pattern
    // For now, return -1 to indicate it's not efficiently available
    console.log('⚠️  Active code count not available with Redis storage');
    return Promise.resolve(-1);
  }
}
