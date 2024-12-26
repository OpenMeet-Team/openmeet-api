import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { RedisClientType } from 'redis';

@Injectable()
export class ElastiCacheService implements OnModuleDestroy {
  constructor(
    @Inject('ELASTICACHE_CLIENT')
    private readonly redis: RedisClientType,
  ) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.set(key, JSON.stringify(value), { EX: ttl });
    } else {
      await this.redis.set(key, JSON.stringify(value));
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
