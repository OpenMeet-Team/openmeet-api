import { Test, TestingModule } from '@nestjs/testing';
import { AuthGoogleController } from './auth-google.controller';
import { AuthGoogleService } from './auth-google.service';
import { AuthService } from '../auth/auth.service';
import { Response } from 'express';
import { OAuthStateData } from '../auth/types/oauth.types';

describe('AuthGoogleController', () => {
  let controller: AuthGoogleController;
  let mockAuthGoogleService: {
    handleCallback: jest.Mock;
  };

  const mockResponse = () => {
    const res: Partial<Response> = {};
    res.cookie = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    return res as Response;
  };

  /**
   * Create a base64-encoded OAuth state parameter
   */
  const createState = (data: Partial<OAuthStateData>): string => {
    const stateData: OAuthStateData = {
      tenantId: data.tenantId || 'tenant-123',
      platform: data.platform || 'web',
      nonce: data.nonce || 'test-nonce',
    };
    return Buffer.from(JSON.stringify(stateData)).toString('base64');
  };

  beforeEach(async () => {
    mockAuthGoogleService = {
      handleCallback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthGoogleController],
      providers: [
        {
          provide: AuthGoogleService,
          useValue: mockAuthGoogleService,
        },
        {
          provide: AuthService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuthGoogleController>(AuthGoogleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('callback (GET)', () => {
    it('should exchange code and redirect to frontend for web platform', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'web' });
      mockAuthGoogleService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/google/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGoogleService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        'tenant-123',
        'web',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://platform.openmeet.net/auth/google/callback?token=jwt-token',
      );
    });

    it('should redirect to custom scheme for android platform', async () => {
      const res = mockResponse();
      const state = createState({
        tenantId: 'tenant-123',
        platform: 'android',
      });
      mockAuthGoogleService.handleCallback.mockResolvedValue({
        redirectUrl:
          'net.openmeet.platform:/auth/google/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGoogleService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        'tenant-123',
        'android',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'net.openmeet.platform:/auth/google/callback?token=jwt-token',
      );
    });

    it('should redirect to custom scheme for ios platform', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'ios' });
      mockAuthGoogleService.handleCallback.mockResolvedValue({
        redirectUrl:
          'net.openmeet.platform:/auth/google/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGoogleService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        'tenant-123',
        'ios',
      );
    });

    it('should set cookies when sessionId exists', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'web' });
      mockAuthGoogleService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/google/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'oidc_session',
        'session-123',
        expect.any(Object),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'oidc_tenant',
        'tenant-123',
        expect.any(Object),
      );
    });

    it('should not set cookies when sessionId is undefined', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'web' });
      mockAuthGoogleService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/google/callback?token=jwt-token',
        sessionId: undefined,
      });

      await controller.callback('auth-code-123', state, res);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalled();
    });

    it('should redirect to error page when state is missing tenantId', async () => {
      const res = mockResponse();
      // Invalid state - missing tenantId
      const state = 'invalid-state';

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGoogleService.handleCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/error?message=Missing+tenant+information',
      );
    });
  });
});
