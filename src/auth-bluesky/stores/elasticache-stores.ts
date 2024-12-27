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

  async set(state: string, data: NodeSavedSession) {
    await this.elasticache.set(`bluesky:session:${state}`, data, 600);
  }

  async get(state: string): Promise<NodeSavedSession | undefined> {
    const result = await this.elasticache.get<NodeSavedSession>(
      `bluesky:session:${state}`,
    );
    return result ?? undefined;
  }

  async del(state: string) {
    await this.elasticache.del(`bluesky:session:${state}`);
  }
}
