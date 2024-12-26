import { ElastiCacheService } from '../../elasticache/elasticache.service';
import type {
  NodeSavedStateStore,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedSession,
} from '@atproto/oauth-client-node';

export class ElastiCacheStateStore implements NodeSavedStateStore {
  constructor(private elasticache: ElastiCacheService) {}

  async set(state: string, data: NodeSavedState) {
    await this.elasticache.set(`bluesky:state:${state}`, data, 600);
  }

  async get(state: string): Promise<NodeSavedState | undefined> {
    const result = await this.elasticache.get<NodeSavedState>(
      `bluesky:state:${state}`,
    );
    return result ?? undefined;
  }

  async del(state: string) {
    await this.elasticache.del(`bluesky:state:${state}`);
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
