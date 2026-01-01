import { Test, TestingModule } from '@nestjs/testing';
import { AuthGithubController } from './auth-github.controller';
import { AuthGithubService } from './auth-github.service';
import { AuthService } from '../auth/auth.service';
import { Response } from 'express';
import { OAuthStateData } from '../auth/types/oauth.types';

describe('AuthGithubController', () => {
  let controller: AuthGithubController;
  let mockAuthGithubService: {
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
    mockAuthGithubService = {
      handleCallback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthGithubController],
      providers: [
        {
          provide: AuthGithubService,
          useValue: mockAuthGithubService,
        },
        {
          provide: AuthService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<AuthGithubController>(AuthGithubController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('callback (GET)', () => {
    it('should exchange code and redirect to frontend for web platform', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'web' });
      mockAuthGithubService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/github/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGithubService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        state,
        'tenant-123',
        'web',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://platform.openmeet.net/auth/github/callback?token=jwt-token',
      );
    });

    it('should redirect to custom scheme for android platform', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'android' });
      mockAuthGithubService.handleCallback.mockResolvedValue({
        redirectUrl:
          'net.openmeet.platform:/auth/github/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGithubService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        state,
        'tenant-123',
        'android',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'net.openmeet.platform:/auth/github/callback?token=jwt-token',
      );
    });

    it('should redirect to custom scheme for ios platform', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'ios' });
      mockAuthGithubService.handleCallback.mockResolvedValue({
        redirectUrl:
          'net.openmeet.platform:/auth/github/callback?token=jwt-token',
        sessionId: 'session-123',
      });

      await controller.callback('auth-code-123', state, res);

      expect(mockAuthGithubService.handleCallback).toHaveBeenCalledWith(
        'auth-code-123',
        state,
        'tenant-123',
        'ios',
      );
    });

    it('should set cookies when sessionId exists', async () => {
      const res = mockResponse();
      const state = createState({ tenantId: 'tenant-123', platform: 'web' });
      mockAuthGithubService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/github/callback?token=jwt-token',
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
      mockAuthGithubService.handleCallback.mockResolvedValue({
        redirectUrl:
          'https://platform.openmeet.net/auth/github/callback?token=jwt-token',
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

      expect(mockAuthGithubService.handleCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        '/auth/error?message=Missing+tenant+information',
      );
    });
  });
});
