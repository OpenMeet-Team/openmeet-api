import { Injectable, Logger } from '@nestjs/common';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyIdentityService } from './bluesky-identity.service';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

/**
 * Service for caching ATProto handle resolutions using ElastiCache (Redis)
 * Shared across all API nodes for consistent handle resolution
 *
 * Handles:
 * - DID to handle resolution with ElastiCache caching
 * - Batch resolution for performance
 * - Cache invalidation when handles change
 * - Prometheus metrics for monitoring
 */
@Injectable()
export class AtprotoHandleCacheService {
  private readonly logger = new Logger(AtprotoHandleCacheService.name);
  private readonly CACHE_PREFIX = 'atproto:handle:';
  private readonly CACHE_TTL = 900; // 15 minutes (in seconds)

  constructor(
    private readonly cache: ElastiCacheService,
    private readonly blueskyIdentity: BlueskyIdentityService,
    @InjectMetric('atproto_handle_cache_hits_total')
    private readonly cacheHits: Counter<string>,
    @InjectMetric('atproto_handle_cache_misses_total')
    private readonly cacheMisses: Counter<string>,
    @InjectMetric('atproto_handle_resolution_errors_total')
    private readonly resolutionErrors: Counter<string>,
    @InjectMetric('atproto_handle_resolution_duration_seconds')
    private readonly resolutionDuration: Histogram<string>,
  ) {}

  /**
   * Resolve DID to handle with ElastiCache caching
   * Shared across all API nodes
   *
   * @param did The DID to resolve
   * @returns The resolved handle or DID as fallback
   */
  async resolveHandle(did: string): Promise<string> {
    const timer = this.resolutionDuration.startTimer();

    try {
      // Return as-is if it doesn't look like a DID
      if (!did?.startsWith('did:')) {
        return did;
      }

      const cacheKey = `${this.CACHE_PREFIX}${did}`;

      // Try ElastiCache first (shared across pods)
      const cached = await this.cache.get<string>(cacheKey);
      if (cached) {
        this.cacheHits.inc();
        timer({ cache_status: 'hit' });
        this.logger.debug(`Cache hit for ${did}: ${cached}`);
        return cached;
      }

      // Cache miss - resolve from ATProto
      this.cacheMisses.inc();
      this.logger.debug(`Cache miss for ${did}, resolving via ATProto...`);

      const handle = await this.blueskyIdentity.extractHandleFromDid(did);

      // Store in ElastiCache (shared across all API nodes)
      await this.cache.set(cacheKey, handle, this.CACHE_TTL);
      timer({ cache_status: 'miss' });
      this.logger.log(`Cached handle for ${did}: ${handle} (TTL: ${this.CACHE_TTL}s)`);

      return handle;
    } catch (error) {
      this.resolutionErrors.inc({
        error_type: error.name || 'unknown',
      });
      timer({ cache_status: 'error' });
      this.logger.warn(`Failed to resolve handle for ${did}: ${error.message}`);
      // Graceful degradation: return DID if resolution fails
      return did;
    }
  }

  /**
   * Batch resolve multiple DIDs (more efficient for activity feeds)
   *
   * @param dids Array of DIDs to resolve
   * @returns Map of DID to resolved handle
   */
  async resolveHandles(dids: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    // Resolve all in parallel (each checks cache independently)
    await Promise.all(
      dids.map(async (did) => {
        const handle = await this.resolveHandle(did);
        results.set(did, handle);
      })
    );

    return results;
  }

  /**
   * Invalidate cache for a specific DID
   * Useful if you know a handle changed (rare)
   *
   * @param did The DID to invalidate cache for
   */
  async invalidate(did: string): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${did}`;
    await this.cache.del(cacheKey);
    this.logger.log(`Invalidated cache for ${did}`);
  }
}
