import { Logger } from '@nestjs/common';
import {
  ElastiCacheStateStore,
  ElastiCacheSessionStore,
} from './elasticache-stores';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

describe('ElastiCacheStateStore', () => {
  let store: ElastiCacheStateStore;
  let mockElasticache: jest.Mocked<
    Pick<ElastiCacheService, 'set' | 'get' | 'del'>
  >;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    mockElasticache = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };
    store = new ElastiCacheStateStore(mockElasticache as any);

    // Spy on Logger.prototype.debug to verify logger usage
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('set', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await store.set('test-state', { foo: 'bar' });

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should not log actual values (only key and hasValue)', async () => {
      const secretValue = { tokenSecret: 'super-secret-123' };

      await store.set('test-state', secretValue);

      // Logger.debug should have been called
      expect(debugSpy).toHaveBeenCalled();

      // The logged arguments should NOT contain the actual value
      const allCalls = debugSpy.mock.calls;
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain('super-secret-123');
      expect(serialized).not.toContain('tokenSecret');
    });

    it('should delegate to elasticache.set with correct key and TTL', async () => {
      await store.set('test-state', { foo: 'bar' });

      expect(mockElasticache.set).toHaveBeenCalledWith(
        'auth:bluesky:state:test-state',
        { foo: 'bar' },
        600,
      );
    });
  });

  describe('get', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      mockElasticache.get.mockResolvedValue({ foo: 'bar' });

      await store.get('test-state');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should not log actual retrieved values', async () => {
      const secretValue = { tokenSecret: 'super-secret-456' };
      mockElasticache.get.mockResolvedValue(secretValue as any);

      await store.get('test-state');

      const allCalls = debugSpy.mock.calls;
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain('super-secret-456');
      expect(serialized).not.toContain('tokenSecret');
    });

    it('should log whether value was found (hasValue)', async () => {
      mockElasticache.get.mockResolvedValue({ foo: 'bar' });

      await store.get('test-state');

      const allCalls = debugSpy.mock.calls;
      const serialized = JSON.stringify(allCalls);
      expect(serialized).toContain('hasValue');
    });

    it('should delegate to elasticache.get with correct key', async () => {
      await store.get('test-state');

      expect(mockElasticache.get).toHaveBeenCalledWith(
        'auth:bluesky:state:test-state',
      );
    });
  });

  describe('del', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await store.del('test-state');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should delegate to elasticache.del with correct key', async () => {
      await store.del('test-state');

      expect(mockElasticache.del).toHaveBeenCalledWith(
        'auth:bluesky:state:test-state',
      );
    });
  });
});

describe('ElastiCacheSessionStore', () => {
  let store: ElastiCacheSessionStore;
  let mockElasticache: jest.Mocked<
    Pick<ElastiCacheService, 'set' | 'get' | 'del'>
  >;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    mockElasticache = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
    };
    store = new ElastiCacheSessionStore(mockElasticache as any);

    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('set', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await store.set('did:plc:test123', { tokenSet: {} } as any);

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should not log actual session data', async () => {
      const sessionData = { tokenSet: { access_token: 'secret-token' } } as any;

      await store.set('did:plc:test123', sessionData);

      const allCalls = debugSpy.mock.calls;
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain('secret-token');
      expect(serialized).not.toContain('access_token');
    });

    it('should delegate to elasticache.set with correct key and no TTL', async () => {
      const sessionData = { tokenSet: {} } as any;

      await store.set('did:plc:test123', sessionData);

      expect(mockElasticache.set).toHaveBeenCalledWith(
        'bluesky:session:did:plc:test123',
        sessionData,
      );
    });
  });

  describe('get', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await store.get('did:plc:test123');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should log found status without actual session data', async () => {
      mockElasticache.get.mockResolvedValue({
        tokenSet: { access_token: 'secret' },
      } as any);

      await store.get('did:plc:test123');

      const allCalls = debugSpy.mock.calls;
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain('secret');
      expect(serialized).toContain('found');
    });

    it('should return undefined when elasticache returns null', async () => {
      mockElasticache.get.mockResolvedValue(null);

      const result = await store.get('did:plc:test123');

      expect(result).toBeUndefined();
    });

    it('should return the session when found', async () => {
      const session = { tokenSet: {} } as any;
      mockElasticache.get.mockResolvedValue(session);

      const result = await store.get('did:plc:test123');

      expect(result).toBe(session);
    });
  });

  describe('del', () => {
    it('should use Logger.debug instead of console.log', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await store.del('did:plc:test123');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(debugSpy).toHaveBeenCalled();
    });

    it('should delegate to elasticache.del with correct key', async () => {
      await store.del('did:plc:test123');

      expect(mockElasticache.del).toHaveBeenCalledWith(
        'bluesky:session:did:plc:test123',
      );
    });
  });
});
