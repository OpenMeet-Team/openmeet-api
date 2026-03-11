import { Test, TestingModule } from '@nestjs/testing';
import { AuthBlueskyController } from './auth-bluesky.controller';
import { AuthBlueskyService } from './auth-bluesky.service';
import { ModuleRef } from '@nestjs/core';

describe('AuthBlueskyController', () => {
  let controller: AuthBlueskyController;
  let mockAuthBlueskyService: {
    createAuthUrl: jest.Mock;
  };

  beforeEach(async () => {
    mockAuthBlueskyService = {
      createAuthUrl: jest.fn().mockResolvedValue('https://bsky.social/oauth'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthBlueskyController],
      providers: [
        {
          provide: AuthBlueskyService,
          useValue: mockAuthBlueskyService,
        },
        {
          provide: ModuleRef,
          useValue: { resolve: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AuthBlueskyController>(AuthBlueskyController);
  });

  describe('getAuthUrl', () => {
    it('should use tenantId from request object (set by TenantGuard)', async () => {
      const mockRequest = { tenantId: 'test-tenant-id' };

      const result = await controller.getAuthUrl(
        'user.bsky.social',
        undefined,
        undefined,
        mockRequest,
      );

      expect(result).toBe('https://bsky.social/oauth');
      expect(mockAuthBlueskyService.createAuthUrl).toHaveBeenCalledWith(
        'user.bsky.social',
        'test-tenant-id',
        undefined,
        undefined,
      );
    });

    it('should pass platform and redirect_uri to service', async () => {
      const mockRequest = { tenantId: 'test-tenant-id' };

      await controller.getAuthUrl(
        'user.bsky.social',
        'mobile',
        'myapp://callback',
        mockRequest,
      );

      expect(mockAuthBlueskyService.createAuthUrl).toHaveBeenCalledWith(
        'user.bsky.social',
        'test-tenant-id',
        'mobile',
        'myapp://callback',
      );
    });
  });
});
