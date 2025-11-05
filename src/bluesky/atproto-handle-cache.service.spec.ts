import { Test, TestingModule } from '@nestjs/testing';
import { AtprotoHandleCacheService } from './atproto-handle-cache.service';
import { BlueskyIdentityService } from './bluesky-identity.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { Counter, Histogram } from 'prom-client';

describe('AtprotoHandleCacheService - Behavior', () => {
  let service: AtprotoHandleCacheService;
  let elastiCache: jest.Mocked<ElastiCacheService>;
  let blueskyIdentity: jest.Mocked<BlueskyIdentityService>;

  beforeEach(async () => {
    // Create real mocks that behave like the actual services
    const cacheStore = new Map<string, string>();

    elastiCache = {
      get: jest.fn(async (key: string) => cacheStore.get(key) || null),
      set: jest.fn(async (key: string, value: string) => {
        cacheStore.set(key, value);
      }),
      del: jest.fn(async (key: string) => {
        cacheStore.delete(key);
      }),
    } as unknown as jest.Mocked<ElastiCacheService>;

    blueskyIdentity = {
      extractHandleFromDid: jest.fn(),
    } as unknown as jest.Mocked<BlueskyIdentityService>;

    const mockTimer = jest.fn();
    const mockCounter = { inc: jest.fn() } as unknown as Counter<string>;
    const mockHistogram = {
      startTimer: jest.fn().mockReturnValue(mockTimer),
    } as unknown as Histogram<string>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoHandleCacheService,
        { provide: ElastiCacheService, useValue: elastiCache },
        { provide: BlueskyIdentityService, useValue: blueskyIdentity },
        { provide: 'PROM_METRIC_ATPROTO_HANDLE_CACHE_HITS_TOTAL', useValue: mockCounter },
        { provide: 'PROM_METRIC_ATPROTO_HANDLE_CACHE_MISSES_TOTAL', useValue: mockCounter },
        { provide: 'PROM_METRIC_ATPROTO_HANDLE_RESOLUTION_ERRORS_TOTAL', useValue: mockCounter },
        { provide: 'PROM_METRIC_ATPROTO_HANDLE_RESOLUTION_DURATION_SECONDS', useValue: mockHistogram },
      ],
    }).compile();

    service = module.get<AtprotoHandleCacheService>(AtprotoHandleCacheService);
  });

  describe('resolveHandle - Caching Behavior', () => {
    it('should resolve DID to handle via ATProto on first call', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      blueskyIdentity.extractHandleFromDid.mockResolvedValue('alice.bsky.social');

      // Act
      const result = await service.resolveHandle(did);

      // Assert
      expect(result).toBe('alice.bsky.social');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledWith(did);
    });

    it('should return cached handle on second call without calling ATProto', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      blueskyIdentity.extractHandleFromDid.mockResolvedValue('alice.bsky.social');

      // Act - First call
      await service.resolveHandle(did);

      // Act - Second call (should use cache)
      const result = await service.resolveHandle(did);

      // Assert - ATProto only called once, but result still correct
      expect(result).toBe('alice.bsky.social');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledTimes(1);
    });

    it('should cache different DIDs independently', async () => {
      // Arrange
      blueskyIdentity.extractHandleFromDid
        .mockResolvedValueOnce('alice.bsky.social')
        .mockResolvedValueOnce('bob.bsky.social');

      // Act
      const result1 = await service.resolveHandle('did:plc:alice123');
      const result2 = await service.resolveHandle('did:plc:bob456');
      const result1Again = await service.resolveHandle('did:plc:alice123');
      const result2Again = await service.resolveHandle('did:plc:bob456');

      // Assert - Each DID resolved once, then cached
      expect(result1).toBe('alice.bsky.social');
      expect(result2).toBe('bob.bsky.social');
      expect(result1Again).toBe('alice.bsky.social');
      expect(result2Again).toBe('bob.bsky.social');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveHandle - Error Handling', () => {
    it('should return DID as fallback when ATProto resolution fails', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      blueskyIdentity.extractHandleFromDid.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.resolveHandle(did);

      // Assert - Should gracefully return DID instead of throwing
      expect(result).toBe(did);
    });

    it('should not cache failed resolutions', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      blueskyIdentity.extractHandleFromDid
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('alice.bsky.social');

      // Act
      const firstResult = await service.resolveHandle(did); // Fails
      const secondResult = await service.resolveHandle(did); // Succeeds

      // Assert - Second call should retry and succeed
      expect(firstResult).toBe(did);
      expect(secondResult).toBe('alice.bsky.social');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveHandle - Pass-through Behavior', () => {
    it('should return handle unchanged if already a handle (not a DID)', async () => {
      // Arrange
      const handle = 'alice.bsky.social';

      // Act
      const result = await service.resolveHandle(handle);

      // Assert - No ATProto call, just pass through
      expect(result).toBe(handle);
      expect(blueskyIdentity.extractHandleFromDid).not.toHaveBeenCalled();
    });

    it('should handle null gracefully', async () => {
      // Act
      const result = await service.resolveHandle(null as any);

      // Assert
      expect(result).toBeNull();
      expect(blueskyIdentity.extractHandleFromDid).not.toHaveBeenCalled();
    });

    it('should handle undefined gracefully', async () => {
      // Act
      const result = await service.resolveHandle(undefined as any);

      // Assert
      expect(result).toBeUndefined();
      expect(blueskyIdentity.extractHandleFromDid).not.toHaveBeenCalled();
    });
  });

  describe('resolveHandles - Batch Resolution', () => {
    it('should resolve multiple DIDs and return all handles', async () => {
      // Arrange
      blueskyIdentity.extractHandleFromDid
        .mockResolvedValueOnce('alice.bsky.social')
        .mockResolvedValueOnce('bob.bsky.social')
        .mockResolvedValueOnce('carol.bsky.social');

      // Act
      const results = await service.resolveHandles([
        'did:plc:alice123',
        'did:plc:bob456',
        'did:plc:carol789',
      ]);

      // Assert
      expect(results.get('did:plc:alice123')).toBe('alice.bsky.social');
      expect(results.get('did:plc:bob456')).toBe('bob.bsky.social');
      expect(results.get('did:plc:carol789')).toBe('carol.bsky.social');
    });

    it('should use cache for already-resolved DIDs in batch', async () => {
      // Arrange
      blueskyIdentity.extractHandleFromDid
        .mockResolvedValueOnce('alice.bsky.social')
        .mockResolvedValueOnce('bob.bsky.social');

      // Act - Pre-cache alice
      await service.resolveHandle('did:plc:alice123');

      // Act - Batch including cached alice and new bob
      const results = await service.resolveHandles([
        'did:plc:alice123', // cached
        'did:plc:bob456',   // new
      ]);

      // Assert - alice uses cache, only bob calls ATProto
      expect(results.get('did:plc:alice123')).toBe('alice.bsky.social');
      expect(results.get('did:plc:bob456')).toBe('bob.bsky.social');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledTimes(2); // once for alice, once for bob
    });

    it('should handle empty array', async () => {
      // Act
      const results = await service.resolveHandles([]);

      // Assert
      expect(results.size).toBe(0);
    });
  });

  describe('invalidate - Cache Invalidation', () => {
    it('should force re-resolution after cache invalidation', async () => {
      // Arrange
      const did = 'did:plc:abc123';
      blueskyIdentity.extractHandleFromDid
        .mockResolvedValueOnce('alice.bsky.social')
        .mockResolvedValueOnce('alice.newdomain.com');

      // Act
      const firstResult = await service.resolveHandle(did);
      await service.invalidate(did);
      const secondResult = await service.resolveHandle(did);

      // Assert - Second call re-resolves due to invalidation
      expect(firstResult).toBe('alice.bsky.social');
      expect(secondResult).toBe('alice.newdomain.com');
      expect(blueskyIdentity.extractHandleFromDid).toHaveBeenCalledTimes(2);
    });
  });
});
