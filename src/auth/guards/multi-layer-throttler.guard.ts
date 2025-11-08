import { Injectable, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerException,
  ThrottlerStorage,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

/**
 * Configuration for additional rate limiting layers beyond IP-based throttling
 */
export interface RateLimitConfig {
  /**
   * Rate limit based on email field in request body
   * Example: { limit: 5, ttl: 3600 } = 5 requests per hour per email
   */
  email?: {
    limit: number;
    ttl: number; // TTL in seconds
    field?: string; // Field name in request body (default: 'email')
  };

  /**
   * Rate limit based on a custom field (e.g., eventSlug, groupSlug)
   * Example: { limit: 100, ttl: 3600, field: 'eventSlug' } = 100 requests per hour per event
   */
  resource?: {
    limit: number;
    ttl: number;
    field: string; // Field name in request body
    keyPrefix: string; // Redis key prefix (e.g., 'event', 'group')
  };

  /**
   * Rate limit based on a combination of fields (e.g., email + eventSlug)
   * Useful for preventing a user from spamming the same resource
   */
  composite?: {
    limit: number;
    ttl: number;
    fields: string[]; // Fields to combine (e.g., ['email', 'eventSlug'])
    keyPrefix: string; // Redis key prefix
  };
}

/**
 * Metadata key for rate limit configuration
 */
export const RATE_LIMIT_CONFIG = 'rate_limit_config';

/**
 * Decorator to configure multi-layer rate limiting for an endpoint
 *
 * @example
 * ```typescript
 * @RateLimit({
 *   email: { limit: 5, ttl: 3600 },  // 5 per hour per email
 *   resource: { limit: 100, ttl: 3600, field: 'eventSlug', keyPrefix: 'event' },
 *   composite: { limit: 3, ttl: 3600, fields: ['email', 'eventSlug'], keyPrefix: 'user_event' }
 * })
 * @Post('quick-rsvp')
 * async quickRsvp(@Body() dto: QuickRsvpDto) {
 *   // ...
 * }
 * ```
 */
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_CONFIG, config);

/**
 * Multi-layer rate limiting guard
 *
 * Extends NestJS ThrottlerGuard to add:
 * 1. Per-IP throttling (inherited from base class)
 * 2. Per-email throttling (prevents email bombing)
 * 3. Per-resource throttling (prevents resource flooding, e.g., event/group)
 * 4. Composite throttling (prevents user from spamming same resource)
 *
 * Uses Redis for distributed rate limiting (works across multiple server instances)
 *
 * @example
 * ```typescript
 * // In your module
 * providers: [
 *   {
 *     provide: APP_GUARD,
 *     useClass: MultiLayerThrottlerGuard,
 *   }
 * ]
 *
 * // In your controller
 * @RateLimit({
 *   email: { limit: 5, ttl: 3600 },
 *   resource: { limit: 100, ttl: 3600, field: 'eventSlug', keyPrefix: 'event' }
 * })
 * @Post('passwordless-login')
 * async login(@Body() dto: LoginDto) { }
 * ```
 */
@Injectable()
export class MultiLayerThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    protected readonly reflector: Reflector,
    private readonly cacheService: ElastiCacheService,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First check IP-based rate limiting (inherited from ThrottlerGuard)
    const ipAllowed = await super.canActivate(context);
    if (!ipAllowed) {
      return false;
    }

    // Get rate limit configuration from decorator
    const config = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_CONFIG,
      context.getHandler(),
    );

    // If no configuration, only IP throttling applies
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Check email-based rate limit
    if (config.email) {
      const emailField = config.email.field || 'email';
      const email = request.body[emailField];

      if (email) {
        const allowed = await this.checkRateLimit(
          `email:${email.toLowerCase()}`,
          config.email.limit,
          config.email.ttl,
        );

        if (!allowed) {
          throw new ThrottlerException(
            `Too many attempts for this email. Please try again in ${this.formatTTL(config.email.ttl)}.`,
          );
        }
      }
    }

    // Check resource-based rate limit
    if (config.resource) {
      const resourceValue = request.body[config.resource.field];

      if (resourceValue) {
        const allowed = await this.checkRateLimit(
          `${config.resource.keyPrefix}:${resourceValue}`,
          config.resource.limit,
          config.resource.ttl,
        );

        if (!allowed) {
          throw new ThrottlerException(
            `This resource is receiving too many requests. Please try again in ${this.formatTTL(config.resource.ttl)}.`,
          );
        }
      }
    }

    // Check composite rate limit (combination of fields)
    if (config.composite) {
      const values = config.composite.fields
        .map((field) => request.body[field])
        .filter(Boolean);

      if (values.length === config.composite.fields.length) {
        // All required fields are present
        const compositeKey = `${config.composite.keyPrefix}:${values.join(':')}`;
        const allowed = await this.checkRateLimit(
          compositeKey,
          config.composite.limit,
          config.composite.ttl,
        );

        if (!allowed) {
          throw new ThrottlerException(
            `Too many attempts for this combination. Please try again in ${this.formatTTL(config.composite.ttl)}.`,
          );
        }
      }
    }

    return true;
  }

  /**
   * Check rate limit for a given key
   * @param key - Redis key (without 'ratelimit:' prefix)
   * @param limit - Maximum number of requests allowed
   * @param ttl - Time window in seconds
   * @returns true if within limit, false if exceeded
   */
  private async checkRateLimit(
    key: string,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const fullKey = `ratelimit:${key}`;

    try {
      const redis = this.cacheService.getRedis();

      // If Redis is not connected, fail open (allow request) to avoid blocking all traffic
      if (!redis) {
        console.warn(
          `Redis not connected, skipping rate limit check for key ${fullKey}`,
        );
        return true;
      }

      // Use atomic INCR to increment counter
      const current = await redis.incr(fullKey);

      if (current === 1) {
        // First request - set expiration
        await redis.expire(fullKey, ttl);
      }

      // Check if limit exceeded
      if (current > limit) {
        return false;
      }

      return true;
    } catch (error) {
      // If Redis is down, fail open (allow request) to avoid blocking all traffic
      // Log error for monitoring
      console.error(`Rate limit check failed for key ${fullKey}:`, error);
      return true;
    }
  }

  /**
   * Format TTL in seconds to human-readable string
   * @param ttl - TTL in seconds
   * @returns Formatted string (e.g., "1 hour", "30 minutes")
   */
  private formatTTL(ttl: number): string {
    if (ttl >= 3600) {
      const hours = Math.floor(ttl / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    if (ttl >= 60) {
      const minutes = Math.floor(ttl / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return `${ttl} second${ttl > 1 ? 's' : ''}`;
  }
}
