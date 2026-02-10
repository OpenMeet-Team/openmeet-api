import { Logger } from '@nestjs/common';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import type {
  NodeSavedStateStore,
  NodeSavedSessionStore,
  NodeSavedSession,
} from '@atproto/oauth-client-node';

export class ElastiCacheStateStore implements NodeSavedStateStore {
  private readonly logger = new Logger(ElastiCacheStateStore.name);

  constructor(private elasticache: ElastiCacheService) {}

  async set(state: string, value: any): Promise<void> {
    const key = `auth:bluesky:state:${state}`;
    this.logger.debug('Setting state in Redis', { key, hasValue: !!value });
    await this.elasticache.set(key, value, 600); // 10 minute TTL
  }

  async get(state: string): Promise<any> {
    const key = `auth:bluesky:state:${state}`;
    this.logger.debug('Getting state from Redis', { key });
    const value = await this.elasticache.get(key);
    this.logger.debug('Retrieved state', { key, hasValue: !!value });
    return value;
  }

  async del(state: string): Promise<void> {
    const key = `auth:bluesky:state:${state}`;
    this.logger.debug('Deleting state from Redis', { key });
    await this.elasticache.del(key);
  }
}

export class ElastiCacheSessionStore implements NodeSavedSessionStore {
  private readonly logger = new Logger(ElastiCacheSessionStore.name);

  constructor(private elasticache: ElastiCacheService) {}

  async set(sub: string, data: NodeSavedSession) {
    const key = `bluesky:session:${sub}`;
    this.logger.debug('Setting session in Redis', { key, sub });
    // No TTL - let AT Protocol's native token expiry be the limit
    await this.elasticache.set(key, data);
  }

  async get(sub: string): Promise<NodeSavedSession | undefined> {
    const key = `bluesky:session:${sub}`;
    this.logger.debug('Getting session from Redis', { key });
    const result = await this.elasticache.get<NodeSavedSession>(key);
    this.logger.debug('Retrieved session', { key, found: !!result });
    return result ?? undefined;
  }

  async del(sub: string) {
    const key = `bluesky:session:${sub}`;
    this.logger.debug('Deleting session from Redis', { key });
    await this.elasticache.del(key);
  }
}
