import { Test, TestingModule } from '@nestjs/testing';
import { AuthBlueskyService } from './auth-bluesky.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { ElastiCacheService } from '../elasticache/elasticache.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { UserService } from '../user/user.service';
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';
import { BadRequestException } from '@nestjs/common';

describe('AuthBlueskyService - Error Handling', () => {
  let service: AuthBlueskyService;
  let mockConfigService: { get: jest.Mock };
  let mockElastiCacheService: { set: jest.Mock; get: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MOBILE_CUSTOM_URL_SCHEME') {
          return defaultValue || 'net.openmeet.platform';
        }
        return defaultValue;
      }),
    };

    mockElastiCacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthBlueskyService,
        {
          provide: TenantConnectionService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AuthService,
          useValue: {},
        },
        {
          provide: ElastiCacheService,
          useValue: mockElastiCacheService,
        },
        {
          provide: BlueskyService,
          useValue: {},
        },
        {
          provide: UserService,
          useValue: {},
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthBlueskyService>(AuthBlueskyService);
  });

  describe('createAuthUrl', () => {
    it('should throw BadRequestException when OAuth client initialization fails', async () => {
      // Arrange: Mock initializeClient to throw an error
      jest
        .spyOn(service, 'initializeClient')
        .mockRejectedValue(new Error('OAuth client initialization failed'));

      // Act & Assert
      await expect(
        service.createAuthUrl('test.bsky.social', 'tenant-123'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createAuthUrl('test.bsky.social', 'tenant-123'),
      ).rejects.toThrow(
        'Unable to start Bluesky authentication. Please try again or contact support if the problem persists.',
      );
    });

    it('should throw BadRequestException when client.authorize fails', async () => {
      // Arrange: Mock successful client init but failed authorize
      const mockClient = {
        authorize: jest
          .fn()
          .mockRejectedValue(new Error('Network error during authorize')),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act & Assert
      await expect(
        service.createAuthUrl('test.bsky.social', 'tenant-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when authorize returns null/undefined', async () => {
      // Arrange: Mock authorize returning null
      const mockClient = {
        authorize: jest.fn().mockResolvedValue(null),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act & Assert
      await expect(
        service.createAuthUrl('test.bsky.social', 'tenant-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return URL string when authorization succeeds', async () => {
      // Arrange: Mock successful OAuth flow
      const mockUrl = new URL('https://bsky.social/oauth/authorize?state=xyz');
      const mockClient = {
        authorize: jest.fn().mockResolvedValue(mockUrl),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act
      const result = await service.createAuthUrl(
        'test.bsky.social',
        'tenant-123',
      );

      // Assert
      expect(result).toBe(mockUrl.toString());
      expect(mockClient.authorize).toHaveBeenCalledWith(
        'test.bsky.social',
        expect.objectContaining({
          state: expect.any(String),
        }),
      );
    });

    it('should store platform in Redis when platform is provided', async () => {
      // Arrange: Mock successful OAuth flow with state in URL
      const mockUrl = new URL('https://bsky.social/oauth/authorize?state=test-state-123');
      const mockClient = {
        authorize: jest.fn().mockResolvedValue(mockUrl),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act
      await service.createAuthUrl(
        'test.bsky.social',
        'tenant-123',
        'android',
      );

      // Assert: Redis should be called with the state from the URL
      expect(mockElastiCacheService.set).toHaveBeenCalledWith(
        'auth:bluesky:platform:test-state-123',
        'android',
        600, // 10 minute TTL
      );
    });

    it('should not store platform in Redis when platform is not provided', async () => {
      // Arrange: Mock successful OAuth flow
      const mockUrl = new URL('https://bsky.social/oauth/authorize?state=xyz');
      const mockClient = {
        authorize: jest.fn().mockResolvedValue(mockUrl),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act
      await service.createAuthUrl(
        'test.bsky.social',
        'tenant-123',
      );

      // Assert: Redis should NOT be called for platform storage
      expect(mockElastiCacheService.set).not.toHaveBeenCalled();
    });

    it('should store ios platform in Redis when platform is ios', async () => {
      // Arrange: Mock successful OAuth flow with state in URL
      const mockUrl = new URL('https://bsky.social/oauth/authorize?state=ios-state');
      const mockClient = {
        authorize: jest.fn().mockResolvedValue(mockUrl),
      };
      jest.spyOn(service, 'initializeClient').mockResolvedValue(mockClient);

      // Act
      await service.createAuthUrl(
        'test.bsky.social',
        'tenant-123',
        'ios',
      );

      // Assert
      expect(mockElastiCacheService.set).toHaveBeenCalledWith(
        'auth:bluesky:platform:ios-state',
        'ios',
        600,
      );
    });
  });

  describe('getStoredPlatform', () => {
    it('should return platform from Redis when stored', async () => {
      // Arrange
      mockElastiCacheService.get.mockResolvedValue('android');

      // Act
      const result = await service.getStoredPlatform('test-state');

      // Assert
      expect(result).toBe('android');
      expect(mockElastiCacheService.get).toHaveBeenCalledWith(
        'auth:bluesky:platform:test-state',
      );
    });

    it('should delete platform from Redis after retrieval', async () => {
      // Arrange
      mockElastiCacheService.get.mockResolvedValue('ios');

      // Act
      await service.getStoredPlatform('cleanup-state');

      // Assert
      expect(mockElastiCacheService.del).toHaveBeenCalledWith(
        'auth:bluesky:platform:cleanup-state',
      );
    });

    it('should return undefined when no platform is stored', async () => {
      // Arrange
      mockElastiCacheService.get.mockResolvedValue(undefined);

      // Act
      const result = await service.getStoredPlatform('missing-state');

      // Assert
      expect(result).toBeUndefined();
      expect(mockElastiCacheService.del).not.toHaveBeenCalled();
    });
  });
});

describe('AuthBlueskyService - buildRedirectUrl', () => {
  let service: AuthBlueskyService;
  let mockConfigService: { get: jest.Mock };
  let mockTenantConnectionService: { getTenantConfig: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MOBILE_CUSTOM_URL_SCHEME') {
          return 'net.openmeet.platform';
        }
        return defaultValue;
      }),
    };

    mockTenantConnectionService = {
      getTenantConfig: jest.fn().mockReturnValue({
        frontendDomain: 'https://platform.openmeet.net',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthBlueskyService,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AuthService,
          useValue: {},
        },
        {
          provide: ElastiCacheService,
          useValue: {},
        },
        {
          provide: BlueskyService,
          useValue: {},
        },
        {
          provide: UserService,
          useValue: {},
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthBlueskyService>(AuthBlueskyService);
  });

  describe('buildRedirectUrl with platform parameter', () => {
    const testParams = new URLSearchParams({
      token: 'test-token',
      refreshToken: 'test-refresh',
      tokenExpires: '123456789',
      profile: 'dGVzdA==',
    });

    it('should redirect to frontend domain when platform is web', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'web',
      );

      expect(result).toMatch(/^https:\/\/platform\.openmeet\.net\/auth\/bluesky\/callback\?/);
      expect(result).toContain('token=test-token');
    });

    it('should redirect to frontend domain when platform is undefined (default behavior)', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        undefined,
      );

      expect(result).toMatch(/^https:\/\/platform\.openmeet\.net\/auth\/bluesky\/callback\?/);
    });

    it('should redirect to custom URL scheme when platform is android', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      expect(result).toMatch(/^net\.openmeet\.platform:\/auth\/bluesky\/callback\?/);
      expect(result).toContain('token=test-token');
    });

    it('should redirect to custom URL scheme when platform is ios', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'ios',
      );

      expect(result).toMatch(/^net\.openmeet\.platform:\/auth\/bluesky\/callback\?/);
      expect(result).toContain('token=test-token');
    });

    it('should use configurable custom URL scheme', () => {
      // Override config to return custom scheme
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'MOBILE_CUSTOM_URL_SCHEME') {
          return 'com.custom.app';
        }
        return defaultValue;
      });

      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      expect(result).toMatch(/^com\.custom\.app:\/auth\/bluesky\/callback\?/);
    });

    it('should include all required parameters in mobile redirect URL', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      // Parse URL by replacing custom scheme with http for URL parsing
      const url = new URL(result.replace('net.openmeet.platform:', 'http://localhost'));
      expect(url.searchParams.has('token')).toBe(true);
      expect(url.searchParams.has('refreshToken')).toBe(true);
      expect(url.searchParams.has('tokenExpires')).toBe(true);
      expect(url.searchParams.has('profile')).toBe(true);
    });

    it('should use default scheme when MOBILE_CUSTOM_URL_SCHEME is not set', () => {
      // Clear the mock to return undefined for MOBILE_CUSTOM_URL_SCHEME
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        return defaultValue;
      });

      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      // Should fall back to default scheme
      expect(result).toMatch(/^net\.openmeet\.platform:\/auth\/bluesky\/callback\?/);
    });
  });
});
