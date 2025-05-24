import { Test, TestingModule } from '@nestjs/testing';
import { MessagePauseService } from './message-pause.service';
import { ElastiCacheService } from '../../elasticache/elasticache.service';

describe('MessagePauseService', () => {
  let service: MessagePauseService;
  let mockRedis: any;
  let mockElastiCacheService: Partial<ElastiCacheService>;

  beforeEach(async () => {
    mockRedis = {
      setEx: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      ttl: jest.fn().mockResolvedValue(-1),
      expire: jest.fn().mockResolvedValue(1),
    };

    mockElastiCacheService = {
      getRedis: jest.fn().mockReturnValue(mockRedis),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagePauseService,
        {
          provide: ElastiCacheService,
          useValue: mockElastiCacheService,
        },
      ],
    }).compile();

    service = module.get<MessagePauseService>(MessagePauseService);
    jest.clearAllMocks();
  });

  describe('pauseMessaging', () => {
    it('should pause messaging with default TTL', async () => {
      await service.pauseMessaging();

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'messaging:pause:global',
        86400, // 24 hours default
        expect.stringContaining('"paused":true'),
      );
    });

    it('should pause messaging with custom reason and TTL', async () => {
      const reason = 'System maintenance';
      const ttl = 3600; // 1 hour

      await service.pauseMessaging(reason, ttl);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'messaging:pause:global',
        ttl,
        expect.stringContaining(reason),
      );
    });

    it('should include timestamp in pause data', async () => {
      await service.pauseMessaging();

      const [[, , data]] = (mockRedis.setEx as jest.Mock).mock.calls;
      const pauseData = JSON.parse(data);

      expect(pauseData).toHaveProperty('pausedAt');
      expect(new Date(pauseData.pausedAt).getTime()).toBeCloseTo(
        Date.now(),
        -3,
      );
    });
  });

  describe('resumeMessaging', () => {
    it('should delete the pause key', async () => {
      await service.resumeMessaging();

      expect(mockRedis.del).toHaveBeenCalledWith('messaging:pause:global');
    });
  });

  describe('isMessagingPaused', () => {
    it('should return paused false when no pause data exists', async () => {
      mockRedis.get = jest.fn().mockResolvedValue(null);

      const result = await service.isMessagingPaused();

      expect(result).toEqual({ paused: false });
    });

    it('should return pause data when paused', async () => {
      const pauseData = {
        paused: true,
        reason: 'Test pause',
        pausedAt: new Date().toISOString(),
        pausedBy: 'system',
      };
      mockRedis.get = jest.fn().mockResolvedValue(JSON.stringify(pauseData));

      const result = await service.isMessagingPaused();

      expect(result).toEqual(pauseData);
    });

    it('should handle invalid JSON gracefully', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('invalid json');

      const result = await service.isMessagingPaused();

      expect(result).toEqual({ paused: false });
    });
  });

  describe('getPauseTTL', () => {
    it('should return TTL from Redis', async () => {
      mockRedis.ttl = jest.fn().mockResolvedValue(3600);

      const result = await service.getPauseTTL();

      expect(result).toBe(3600);
      expect(mockRedis.ttl).toHaveBeenCalledWith('messaging:pause:global');
    });

    it('should return -1 when key does not exist', async () => {
      mockRedis.ttl = jest.fn().mockResolvedValue(-1);

      const result = await service.getPauseTTL();

      expect(result).toBe(-1);
    });
  });

  describe('extendPause', () => {
    it('should extend pause when TTL is positive', async () => {
      mockRedis.ttl = jest.fn().mockResolvedValue(3600); // Current TTL: 1 hour
      mockRedis.expire = jest.fn().mockResolvedValue(1);

      await service.extendPause(1800); // Extend by 30 minutes

      expect(mockRedis.expire).toHaveBeenCalledWith(
        'messaging:pause:global',
        5400, // 3600 + 1800
      );
    });

    it('should not extend pause when TTL is -1', async () => {
      mockRedis.ttl = jest.fn().mockResolvedValue(-1);

      await service.extendPause(1800);

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should not extend pause when TTL is 0', async () => {
      mockRedis.ttl = jest.fn().mockResolvedValue(0);

      await service.extendPause(1800);

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });
});
