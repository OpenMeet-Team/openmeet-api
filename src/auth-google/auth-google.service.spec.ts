import { Test, TestingModule } from '@nestjs/testing';
import { AuthGoogleService } from './auth-google.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { OAuthPlatform } from '../auth/types/oauth.types';

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
    getToken: jest.fn(),
  })),
}));

describe('AuthGoogleService', () => {
  let service: AuthGoogleService;
  let mockConfigService: { get: jest.Mock };
  let mockTenantConnectionService: { getTenantConfig: jest.Mock };

  const mockTenantConfig = {
    googleClientId: 'test-google-client-id',
    googleClientSecret: 'test-google-client-secret',
    frontendDomain: 'https://platform.openmeet.net',
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MOBILE_CUSTOM_URL_SCHEME') {
          return 'net.openmeet.platform';
        }
        if (key === 'BACKEND_DOMAIN') {
          return 'https://api.openmeet.net';
        }
        return defaultValue;
      }),
    };

    mockTenantConnectionService = {
      getTenantConfig: jest.fn().mockReturnValue(mockTenantConfig),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGoogleService,
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
          provide: REQUEST,
          useValue: {
            headers: {
              'x-tenant-id': 'tenant-123',
            },
          },
        },
      ],
    }).compile();

    service = await module.resolve<AuthGoogleService>(AuthGoogleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildRedirectUrl', () => {
    const testParams = new URLSearchParams({
      token: 'test-token',
      refreshToken: 'test-refresh',
      tokenExpires: '123456789',
    });

    it('should redirect to frontend domain when platform is web', () => {
      const result = service.buildRedirectUrl('tenant-123', testParams, 'web');

      expect(result).toMatch(
        /^https:\/\/platform\.openmeet\.net\/auth\/google\/callback\?/,
      );
      expect(result).toContain('token=test-token');
    });

    it('should redirect to frontend domain when platform is undefined (default behavior)', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        undefined,
      );

      expect(result).toMatch(
        /^https:\/\/platform\.openmeet\.net\/auth\/google\/callback\?/,
      );
    });

    it('should redirect to custom URL scheme when platform is android', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      expect(result).toMatch(
        /^net\.openmeet\.platform:\/auth\/google\/callback\?/,
      );
      expect(result).toContain('token=test-token');
    });

    it('should redirect to custom URL scheme when platform is ios', () => {
      const result = service.buildRedirectUrl('tenant-123', testParams, 'ios');

      expect(result).toMatch(
        /^net\.openmeet\.platform:\/auth\/google\/callback\?/,
      );
      expect(result).toContain('token=test-token');
    });

    it('should use configurable custom URL scheme', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'MOBILE_CUSTOM_URL_SCHEME') {
            return 'com.custom.app';
          }
          return defaultValue;
        },
      );

      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      expect(result).toMatch(/^com\.custom\.app:\/auth\/google\/callback\?/);
    });

    it('should include all required parameters in mobile redirect URL', () => {
      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      // Parse URL by replacing custom scheme with http for URL parsing
      const url = new URL(
        result.replace('net.openmeet.platform:', 'http://localhost'),
      );
      expect(url.searchParams.has('token')).toBe(true);
      expect(url.searchParams.has('refreshToken')).toBe(true);
      expect(url.searchParams.has('tokenExpires')).toBe(true);
    });

    it('should use default scheme when MOBILE_CUSTOM_URL_SCHEME is not set', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          return defaultValue;
        },
      );

      const result = service.buildRedirectUrl(
        'tenant-123',
        testParams,
        'android',
      );

      expect(result).toMatch(
        /^net\.openmeet\.platform:\/auth\/google\/callback\?/,
      );
    });
  });

  describe('getCallbackRedirectUri', () => {
    it('should build the correct redirect URI for callback endpoint without query params', () => {
      const result = service.getCallbackRedirectUri();

      expect(result).toBe(
        'https://api.openmeet.net/api/v1/auth/google/callback',
      );
    });

    it('should use BACKEND_DOMAIN from config', () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'BACKEND_DOMAIN') {
            return 'https://api-dev.openmeet.net';
          }
          return defaultValue;
        },
      );

      const result = service.getCallbackRedirectUri();

      expect(result).toBe(
        'https://api-dev.openmeet.net/api/v1/auth/google/callback',
      );
    });
  });

  describe('handleCallback', () => {
    let mockAuthService: {
      validateSocialLogin: jest.Mock;
    };

    beforeEach(async () => {
      mockAuthService = {
        validateSocialLogin: jest.fn().mockResolvedValue({
          token: 'jwt-token-123',
          refreshToken: 'refresh-token-123',
          tokenExpires: 1234567890,
          sessionId: 'session-id-123',
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthGoogleService,
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
            useValue: mockAuthService,
          },
          {
            provide: REQUEST,
            useValue: {
              headers: {
                'x-tenant-id': 'tenant-123',
              },
            },
          },
        ],
      }).compile();

      service = await module.resolve<AuthGoogleService>(AuthGoogleService);

      // Mock getProfileByOAuth2Code to return test profile
      jest.spyOn(service, 'getProfileByOAuth2Code').mockResolvedValue({
        id: 'google-user-123',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('should exchange code and return redirect URL for web platform', async () => {
      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'web',
      );

      expect(result.redirectUrl).toMatch(
        /^https:\/\/platform\.openmeet\.net\/auth\/google\/callback\?/,
      );
      expect(result.redirectUrl).toContain('token=');
      expect(result.sessionId).toBe('session-id-123');
    });

    it('should exchange code and return custom scheme URL for android', async () => {
      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'android',
      );

      expect(result.redirectUrl).toMatch(
        /^net\.openmeet\.platform:\/auth\/google\/callback\?/,
      );
      expect(result.redirectUrl).toContain('token=');
    });

    it('should exchange code and return custom scheme URL for ios', async () => {
      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'ios',
      );

      expect(result.redirectUrl).toMatch(
        /^net\.openmeet\.platform:\/auth\/google\/callback\?/,
      );
    });

    it('should include token and refreshToken in redirect params', async () => {
      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'web',
      );

      expect(result.redirectUrl).toContain('token=jwt-token-123');
      expect(result.redirectUrl).toContain('refreshToken=refresh-token-123');
      expect(result.redirectUrl).toContain('tokenExpires=');
    });

    it('should call validateSocialLogin with correct parameters', async () => {
      await service.handleCallback('auth-code-123', 'tenant-123', 'web');

      expect(mockAuthService.validateSocialLogin).toHaveBeenCalledWith(
        'google',
        {
          id: 'google-user-123',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
        },
        'tenant-123',
      );
    });

    it('should return sessionId from login response', async () => {
      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'web',
      );

      expect(result.sessionId).toBe('session-id-123');
    });

    it('should handle undefined sessionId from login response', async () => {
      mockAuthService.validateSocialLogin.mockResolvedValue({
        token: 'jwt-token-123',
        refreshToken: 'refresh-token-123',
        tokenExpires: 1234567890,
        sessionId: undefined,
      });

      const result = await service.handleCallback(
        'auth-code-123',
        'tenant-123',
        'web',
      );

      expect(result.sessionId).toBeUndefined();
    });
  });
});
