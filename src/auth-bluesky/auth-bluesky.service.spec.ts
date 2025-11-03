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
  let configService: ConfigService;
  let elasticacheService: ElastiCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthBlueskyService,
        {
          provide: TenantConnectionService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
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
    configService = module.get<ConfigService>(ConfigService);
    elasticacheService = module.get<ElastiCacheService>(ElastiCacheService);
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
  });
});
