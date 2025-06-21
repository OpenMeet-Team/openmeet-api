import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { OidcService } from './oidc.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { SessionService } from '../../session/session.service';

describe('OidcService', () => {
  let service: OidcService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockSessionService: jest.Mocked<SessionService>;

  const mockUser = {
    id: 123,
    slug: 'john-smith',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    matrixUserId: '@john.smith:matrix.openmeet.net',
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as any;

    mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    } as any;

    mockUserService = {
      findById: jest.fn(),
    } as any;

    mockTenantConnectionService = {
      getTenantConnection: jest.fn(),
    } as any;

    mockSessionService = {
      findOne: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OidcService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
      ],
    }).compile();

    service = module.get<OidcService>(OidcService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDiscoveryDocument', () => {
    it('should return OIDC discovery document', () => {
      mockConfigService.get.mockReturnValue('https://api.openmeet.net');

      const result = service.getDiscoveryDocument();

      expect(result).toMatchObject({
        issuer: 'https://api.openmeet.net/oidc',
        authorization_endpoint: 'https://api.openmeet.net/api/oidc/auth',
        token_endpoint: 'https://api.openmeet.net/api/oidc/token',
        userinfo_endpoint: 'https://api.openmeet.net/api/oidc/userinfo',
        jwks_uri: 'https://api.openmeet.net/api/oidc/jwks',
        scopes_supported: ['openid', 'profile', 'email'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      });
    });

    it('should use default base URL if not configured', () => {
      mockConfigService.get.mockReturnValue(null);

      const result = service.getDiscoveryDocument();

      expect(result.issuer).toBe('https://localdev.openmeet.net/oidc');
    });
  });

  describe('getJwks', () => {
    it('should return JWKS document', () => {
      const result = service.getJwks();

      expect(result).toMatchObject({
        keys: [
          expect.objectContaining({
            use: 'sig',
            kid: 'openmeet-oidc-rsa-key',
            alg: 'RS256',
            kty: 'RSA',
          }),
        ],
      });
    });
  });

  describe('handleAuthorization', () => {
    const authParams = {
      client_id: 'matrix_synapse',
      redirect_uri:
        'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      response_type: 'code',
      scope: 'openid profile email',
      state: 'test-state',
      nonce: 'test-nonce',
    };

    it('should generate authorization code and redirect URL', () => {
      const result = service.handleAuthorization(authParams, 123, 'tenant123');

      expect(result.authorization_code).toBeDefined();
      expect(result.redirect_url).toContain(
        `code=${result.authorization_code}`,
      );
      expect(result.redirect_url).toContain('state=test-state');
    });

    it('should throw error for invalid client_id', () => {
      const invalidParams = { ...authParams, client_id: 'invalid_client' };

      expect(() =>
        service.handleAuthorization(invalidParams, 123, 'tenant123'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw error for unsupported response_type', () => {
      const invalidParams = { ...authParams, response_type: 'token' };

      expect(() =>
        service.handleAuthorization(invalidParams, 123, 'tenant123'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw error for invalid redirect_uri', () => {
      const invalidParams = {
        ...authParams,
        redirect_uri: 'https://evil.com/callback',
      };

      expect(() =>
        service.handleAuthorization(invalidParams, 123, 'tenant123'),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('exchangeCodeForTokens', () => {
    const tokenParams = {
      grant_type: 'authorization_code',
      code: 'mock-auth-code',
      redirect_uri:
        'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      client_id: 'matrix_synapse',
      client_secret: 'test-secret',
    };

    beforeEach(() => {
      process.env.MATRIX_OIDC_CLIENT_SECRET = 'test-secret';
      mockUserService.findById.mockResolvedValue(mockUser);
    });

    it('should exchange authorization code for tokens', async () => {
      // Generate a real auth code using the service
      const authCode = service['generateAuthCode'](
        {
          client_id: 'matrix_synapse',
          redirect_uri: tokenParams.redirect_uri,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'test-state',
          nonce: 'test-nonce',
        },
        123,
        'tenant123',
      );

      const tokenParamsWithCode = { ...tokenParams, code: authCode };
      const result = await service.exchangeCodeForTokens(tokenParamsWithCode);

      expect(result).toMatchObject({
        access_token: expect.any(String),
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: expect.any(String),
      });

      expect(mockUserService.findById).toHaveBeenCalledWith(123, 'tenant123');
    });

    it('should throw error for invalid grant_type', async () => {
      const invalidParams = { ...tokenParams, grant_type: 'implicit' };

      await expect(
        service.exchangeCodeForTokens(invalidParams),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid client credentials', async () => {
      const invalidParams = { ...tokenParams, client_secret: 'wrong-secret' };

      await expect(
        service.exchangeCodeForTokens(invalidParams),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid authorization code', async () => {
      const invalidTokenParams = { ...tokenParams, code: 'invalid-code' };

      await expect(
        service.exchangeCodeForTokens(invalidTokenParams),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if user not found', async () => {
      // Generate a real auth code with a different user ID
      const authCode = service['generateAuthCode'](
        {
          client_id: 'matrix_synapse',
          redirect_uri: tokenParams.redirect_uri,
          response_type: 'code',
          scope: 'openid profile email',
        },
        999, // Different user ID
        'tenant123',
      );

      const tokenParamsWithCode = { ...tokenParams, code: authCode };
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        service.exchangeCodeForTokens(tokenParamsWithCode),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserInfo', () => {
    it('should return user info from valid access token', async () => {
      // Since getUserInfo uses the injected JwtService, we need to mock it
      const userInfo = {
        sub: 'john-smith',
        name: 'John Smith',
        email: 'john@example.com',
        preferred_username: 'john.smith',
        matrix_handle: 'john.smith',
        tenant_id: 'tenant123',
      };

      mockJwtService.verify.mockReturnValue(userInfo);
      const result = await service.getUserInfo('valid-token');

      expect(result).toEqual(userInfo);
      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('should throw error for invalid access token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.getUserInfo('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('user claim mapping', () => {
    it('should map user with Matrix ID to OIDC claims', () => {
      const userInfo = service['mapUserToOidcClaims'](mockUser, 'tenant123');

      expect(userInfo).toEqual({
        sub: 'john-smith',
        name: 'John Smith',
        email: 'john@example.com',
        preferred_username: 'john.smith',
        matrix_handle: 'john.smith',
        tenant_id: 'tenant123',
      });
    });

    it('should handle user without Matrix ID', () => {
      const userWithoutMatrix = { ...mockUser, matrixUserId: null };

      const userInfo = service['mapUserToOidcClaims'](
        userWithoutMatrix,
        'tenant123',
      );

      expect(userInfo.matrix_handle).toBe('john-smith'); // Uses slug as fallback
      expect(userInfo.preferred_username).toBe('john-smith');
    });

    it('should handle user with only email', () => {
      const userWithOnlyEmail = {
        slug: 'user123',
        firstName: null,
        lastName: null,
        email: 'test@example.com',
        matrixUserId: null,
      };

      const userInfo = service['mapUserToOidcClaims'](
        userWithOnlyEmail,
        'tenant123',
      );

      expect(userInfo.name).toBe('test');
      expect(userInfo.sub).toBe('user123');
    });

    it('should use slug as fallback name', () => {
      const userWithSlugOnly = {
        slug: 'fallback-user',
        firstName: null,
        lastName: null,
        email: null,
        matrixUserId: null,
      };

      const userInfo = service['mapUserToOidcClaims'](
        userWithSlugOnly,
        'tenant123',
      );

      expect(userInfo.name).toBe('fallback-user');
    });
  });
});
