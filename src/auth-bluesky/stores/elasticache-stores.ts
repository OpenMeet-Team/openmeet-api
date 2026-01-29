import { ElastiCacheService } from '../../elasticache/elasticache.service';
import type {
  NodeSavedStateStore,
  NodeSavedSessionStore,
  NodeSavedSession,
} from '@atproto/oauth-client-node';

export class ElastiCacheStateStore implements NodeSavedStateStore {
  constructor(private elasticache: ElastiCacheService) {}

  async set(state: string, value: any): Promise<void> {
    const key = `auth:bluesky:state:${state}`;
    console.log('Setting state in Redis:', { key, value });
    await this.elasticache.set(key, value, 600); // 10 minute TTL
  }

  async get(state: string): Promise<any> {
    const key = `auth:bluesky:state:${state}`;
    console.log('Getting state from Redis:', key);
    const value = await this.elasticache.get(key);
    console.log('Retrieved state value:', value);
    return value;
  }

  async del(state: string): Promise<void> {
    const key = `auth:bluesky:state:${state}`;
    console.log('Deleting state from Redis:', key);
    await this.elasticache.del(key);
  }
}

export class ElastiCacheSessionStore implements NodeSavedSessionStore {
  constructor(private elasticache: ElastiCacheService) {}

  async set(sub: string, data: NodeSavedSession) {
    const key = `bluesky:session:${sub}`;
    console.log('Setting session in Redis:', { key, sub });
    // No TTL - let AT Protocol's native token expiry be the limit
    await this.elasticache.set(key, data);
  }

  async get(sub: string): Promise<NodeSavedSession | undefined> {
    const key = `bluesky:session:${sub}`;
    console.log('Getting session from Redis:', key);
    const result = await this.elasticache.get<NodeSavedSession>(key);
    console.log('Retrieved session:', { key, found: !!result });
    return result ?? undefined;
  }

  async del(sub: string) {
    const key = `bluesky:session:${sub}`;
    console.log('Deleting session from Redis:', key);
    await this.elasticache.del(key);
  }
}
