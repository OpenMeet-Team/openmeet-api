import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class ElastiCacheService implements OnModuleInit, OnModuleDestroy {
  private redis: RedisClientType;
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY = 5000; // 5 seconds
  private readonly CONNECTION_TIMEOUT = 10000; // 10 seconds

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
      console.log(
        `Attempting to connect to Redis [${this.configService.get('ELASTICACHE_HOST', { infer: true })}:${this.configService.get('ELASTICACHE_PORT', { infer: true })}] (attempt ${attempt}/${this.MAX_RETRIES})...`,
      );

      // Create a new client instance for each attempt
      if (this.redis) {
        await this.redis
          .quit()
          .catch((err) =>
            console.error('Error closing previous connection:', err),
          );
      }
      this.redis = this.createRedisClient();

      // Set up error handler
      this.redis.on('error', (error) => {
        console.error('Redis client error:', error);
      });

      await this.connectWithTimeout(this.redis);
      console.log('Redis client connected successfully');

      // Test the connection
      const pingResult = await this.redis.ping();
      console.log('Redis PING result:', pingResult);
    } catch (error) {
      console.error(`Failed to connect to Redis (attempt ${attempt}):`, error);

      if (attempt < this.MAX_RETRIES) {
        console.log(`Retrying in ${this.RETRY_DELAY / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
        return this.connectWithRetry(attempt + 1);
      }

      throw new Error(
        `Failed to connect to Redis after ${this.MAX_RETRIES} attempts`,
      );
    }
  }

  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      console.log('Redis client disconnected');
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
}
