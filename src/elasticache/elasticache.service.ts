import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class ElastiCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ElastiCacheService.name);
  private redis: RedisClientType;

  getRedis(): RedisClientType | null {
    if (!this.redis?.isOpen) {
      this.logger.warn('Redis client is not connected');
      return null; // Return null instead of throwing
    }
    return this.redis;
  }
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY = 5000;
  private readonly CONNECTION_TIMEOUT = 10000;

  constructor(private configService: ConfigService) {}

  private createRedisClient(): RedisClientType {
    return createClient({
      socket: {
        host: this.configService.get('ELASTICACHE_HOST', { infer: true }),
        port: this.configService.get('ELASTICACHE_PORT', { infer: true }),
        tls:
          this.configService.get('ELASTICACHE_TLS', { infer: true }) === 'true',
        rejectUnauthorized:
          this.configService.get('ELASTICACHE_REJECT_UNAUTHORIZED', {
            infer: true,
          }) === 'true',
        connectTimeout: this.CONNECTION_TIMEOUT,
      },
      // ElastiCache uses AUTH token instead of username/password, if set to true
      ...(this.configService.get('ELASTICACHE_AUTH', { infer: true }) ===
        'true' && {
        password: this.configService.get('ELASTICACHE_TOKEN', { infer: true }),
      }),
    });
  }

  private async connectWithTimeout(client: RedisClientType): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, this.CONNECTION_TIMEOUT);

      try {
        await client.connect();
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  private async connectWithRetry(attempt = 1): Promise<void> {
    try {
      this.logger.log(
        `Attempting to connect to Redis [${this.configService.get('ELASTICACHE_HOST', { infer: true })}:${this.configService.get('ELASTICACHE_PORT', { infer: true })}] (attempt ${attempt}/${this.MAX_RETRIES})`,
      );

      if (this.redis) {
        await this.redis
          .quit()
          .catch((err) =>
            this.logger.error('Error closing previous connection:', err),
          );
      }
      this.redis = this.createRedisClient();

      this.redis.on('error', (error) => {
        this.logger.error('Redis client error:', error);
      });

      await this.connectWithTimeout(this.redis);
      this.logger.log('Redis client connected successfully');

      const pingResult = await this.redis.ping();
      this.logger.debug('Redis PING result:', pingResult);
    } catch (error) {
      this.logger.error(
        `Failed to connect to Redis (attempt ${attempt}):`,
        error.stack,
      );

      if (attempt < this.MAX_RETRIES) {
        this.logger.log(`Retrying in ${this.RETRY_DELAY / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
        return this.connectWithRetry(attempt + 1);
      }

      throw new Error(
        `Failed to connect to Redis after ${this.MAX_RETRIES} attempts`,
      );
    }
  }

  async onModuleInit() {
    this.logger.log('Initializing Redis connection...');
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis client disconnected');
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      if (!this.redis?.isOpen) {
        this.logger.warn('Redis client is not connected, skipping cache set');
        return; // Gracefully skip caching instead of throwing
      }

      // Add timeout to prevent hanging when Redis is down/slow
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.logger.warn(`Redis set operation timeout for key: ${key}`);
          resolve(); // Resolve instead of reject
        }, 5000);
      });

      const operation = (async () => {
        try {
          if (ttl) {
            await this.redis.set(key, JSON.stringify(value), { EX: ttl });
          } else {
            await this.redis.set(key, JSON.stringify(value));
          }
        } catch (err) {
          this.logger.error(`Redis set error for key ${key}: ${err.message}`);
        }
      })();

      await Promise.race([operation, timeout]);
    } catch (error) {
      // Swallow all errors to ensure graceful degradation
      this.logger.error(`Failed to set cache key ${key}: ${error.message}`);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.redis?.isOpen) {
        this.logger.warn('Redis client is not connected, returning null');
        return null; // Return null instead of throwing
      }

      // Add timeout to prevent hanging when Redis is down/slow
      const timeout = new Promise<null>((resolve) => {
        setTimeout(() => {
          this.logger.warn(`Redis get operation timeout for key: ${key}`);
          resolve(null); // Resolve with null instead of reject
        }, 5000);
      });

      const operation = this.redis.get(key).catch((err) => {
        this.logger.error(`Redis get error for key ${key}: ${err.message}`);
        return null; // Return null on error
      });

      const value = await Promise.race([operation, timeout]);
      return value ? JSON.parse(value as string) : null;
    } catch (error) {
      // Swallow all errors and return null for graceful degradation
      this.logger.error(`Failed to get cache key ${key}: ${error.message}`);
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.redis?.isOpen) {
        this.logger.warn(
          'Redis client is not connected, skipping cache delete',
        );
        return; // Gracefully skip instead of throwing
      }

      await this.redis.del(key);
    } catch (error) {
      // Swallow all errors to ensure graceful degradation
      this.logger.error(`Failed to delete cache key ${key}: ${error.message}`);
    }
  }

  // Helper method to check connection status
  isConnected(): boolean {
    return this.redis?.isOpen ?? false;
  }

  getRedisConfig() {
    return {
      host: this.configService.get('ELASTICACHE_HOST', { infer: true }),
      port: this.configService.get('ELASTICACHE_PORT', { infer: true }),
      tls:
        this.configService.get('ELASTICACHE_TLS', { infer: true }) === 'true',
      ...(this.configService.get('ELASTICACHE_AUTH', { infer: true }) ===
        'true' && {
        password: this.configService.get('ELASTICACHE_TOKEN', { infer: true }),
      }),
    };
  }

  /**
   * Acquire a distributed lock using Redis
   * @param lockKey The key to lock on
   * @param ttl The time-to-live for the lock in milliseconds
   * @returns true if lock was acquired, false otherwise
   */
  async acquireLock(lockKey: string, ttl: number = 30000): Promise<boolean> {
    try {
      if (!this.redis?.isOpen) {
        this.logger.warn('Redis client is not connected, cannot acquire lock');
        return false; // Return false instead of throwing
      }

      // Generate a unique value for this lock instance
      const lockValue = `${Date.now()}-${Math.random()}`;

      // Try to set the key with NX option (only if it doesn't exist)
      const result = await this.redis.set(lockKey, lockValue, {
        NX: true,
        PX: ttl,
      });

      // If result is OK, we acquired the lock
      return result === 'OK';
    } catch (error) {
      this.logger.error(
        `Error acquiring lock for ${lockKey}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Release a distributed lock
   * @param lockKey The key to release
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      if (!this.redis?.isOpen) {
        this.logger.warn(
          'Redis client is not connected, skipping lock release',
        );
        return; // Gracefully skip instead of throwing
      }

      await this.redis.del(lockKey);
    } catch (error) {
      this.logger.error(
        `Error releasing lock for ${lockKey}: ${error.message}`,
      );
    }
  }

  /**
   * Execute a function with a distributed lock
   * @param lockKey The key to lock on
   * @param fn The function to execute while holding the lock
   * @param ttl The time-to-live for the lock in milliseconds
   * @returns The result of the function execution, or null if lock couldn't be acquired
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttl: number = 30000,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, ttl);

    if (!acquired) {
      this.logger.warn(`Failed to acquire lock for ${lockKey}`);
      return null;
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}
