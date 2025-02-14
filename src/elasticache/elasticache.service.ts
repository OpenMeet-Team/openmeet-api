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

  getRedis(): RedisClientType {
    if (!this.redis?.isOpen) {
      throw new Error('Redis client is not connected');
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
    if (!this.redis?.isOpen) {
      throw new Error('Redis client is not connected');
    }

    if (ttl) {
      await this.redis.set(key, JSON.stringify(value), { EX: ttl });
    } else {
      await this.redis.set(key, JSON.stringify(value));
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis?.isOpen) {
      throw new Error('Redis client is not connected');
    }

    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key: string): Promise<void> {
    if (!this.redis?.isOpen) {
      throw new Error('Redis client is not connected');
    }

    await this.redis.del(key);
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
}
