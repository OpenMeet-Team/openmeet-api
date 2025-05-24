import { Injectable, Logger } from '@nestjs/common';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

@Injectable()
export class MessagePauseService {
  private readonly logger = new Logger(MessagePauseService.name);
  private readonly PAUSE_KEY = 'messaging:pause:global';
  private readonly PAUSE_TTL = 86400; // 24 hours default TTL

  constructor(private readonly elastiCacheService: ElastiCacheService) {}

  /**
   * Pause all message sending globally across all nodes
   * @param reason Optional reason for pausing
   * @param ttlSeconds Optional TTL in seconds (default: 24 hours)
   */
  async pauseMessaging(reason?: string, ttlSeconds?: number): Promise<void> {
    const pauseData = {
      paused: true,
      reason: reason || 'Manual pause activated',
      pausedAt: new Date().toISOString(),
      pausedBy: 'system', // Could be extended to track who paused it
    };

    const ttl = ttlSeconds || this.PAUSE_TTL;
    const redis = this.elastiCacheService.getRedis();
    await redis.setEx(this.PAUSE_KEY, ttl, JSON.stringify(pauseData));

    this.logger.warn(
      `Message sending paused globally. Reason: ${pauseData.reason}. TTL: ${ttl}s`,
    );
  }

  /**
   * Resume message sending across all nodes
   */
  async resumeMessaging(): Promise<void> {
    const redis = this.elastiCacheService.getRedis();
    await redis.del(this.PAUSE_KEY);
    this.logger.log('Message sending resumed globally');
  }

  /**
   * Check if messaging is currently paused
   */
  async isMessagingPaused(): Promise<{
    paused: boolean;
    reason?: string;
    pausedAt?: string;
    pausedBy?: string;
  }> {
    const redis = this.elastiCacheService.getRedis();
    const pauseData = await redis.get(this.PAUSE_KEY);

    if (!pauseData) {
      return { paused: false };
    }

    try {
      return JSON.parse(pauseData);
    } catch (error) {
      this.logger.error('Failed to parse pause data', error);
      return { paused: false };
    }
  }

  /**
   * Get remaining TTL for the pause
   */
  async getPauseTTL(): Promise<number> {
    const redis = this.elastiCacheService.getRedis();
    return await redis.ttl(this.PAUSE_KEY);
  }

  /**
   * Extend the pause duration
   */
  async extendPause(additionalSeconds: number): Promise<void> {
    const currentTTL = await this.getPauseTTL();
    if (currentTTL > 0) {
      const redis = this.elastiCacheService.getRedis();
      await redis.expire(this.PAUSE_KEY, currentTTL + additionalSeconds);
      this.logger.log(`Extended pause by ${additionalSeconds} seconds`);
    }
  }
}
