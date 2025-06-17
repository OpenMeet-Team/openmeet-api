import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { OidcService } from './oidc.service';
import { UserService } from '../../user/user.service';

describe('OidcService', () => {
  let service: OidcService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockUserService: jest.Mocked<UserService>;

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
        authorization_endpoint: 'https://api.openmeet.net/oidc/auth',
        token_endpoint: 'https://api.openmeet.net/oidc/token',
        userinfo_endpoint: 'https://api.openmeet.net/oidc/userinfo',
        jwks_uri: 'https://api.openmeet.net/oidc/jwks',
        scopes_supported: ['openid', 'profile', 'email'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
      });
    });

    it('should use default base URL if not configured', () => {
      mockConfigService.get.mockReturnValue(null);

      const result = service.getDiscoveryDocument();

      expect(result.issuer).toBe('http://localhost:3000/oidc');
    });
  });

  describe('getJwks', () => {
    it('should return JWKS document', () => {
      const result = service.getJwks();

      expect(result).toEqual({
        keys: [
          {
            kty: 'oct',
            use: 'sig',
            kid: 'openmeet-oidc-key',
            alg: 'HS256',
          },
        ],
      });
    });
  });

  describe('handleAuthorization', () => {
    const authParams = {
      client_id: 'matrix_synapse',
      redirect_uri: 'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      response_type: 'code',
      scope: 'openid profile email',
      state: 'test-state',
      nonce: 'test-nonce',
    };

    it('should generate authorization code and redirect URL', async () => {
      mockJwtService.sign.mockReturnValue('mock-auth-code');

      const result = await service.handleAuthorization(authParams, 123, 'tenant123');

      expect(result.authorization_code).toBe('mock-auth-code');
      expect(result.redirect_url).toContain('code=mock-auth-code');
      expect(result.redirect_url).toContain('state=test-state');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth_code',
          client_id: 'matrix_synapse',
          userId: 123,
          tenantId: 'tenant123',
        }),
        { expiresIn: '10m' }
      );
    });

    it('should throw error for invalid client_id', async () => {
      const invalidParams = { ...authParams, client_id: 'invalid_client' };

      await expect(
        service.handleAuthorization(invalidParams, 123, 'tenant123')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for unsupported response_type', async () => {
      const invalidParams = { ...authParams, response_type: 'token' };

      await expect(
        service.handleAuthorization(invalidParams, 123, 'tenant123')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid redirect_uri', async () => {
      const invalidParams = { ...authParams, redirect_uri: 'https://evil.com/callback' };

      await expect(
        service.handleAuthorization(invalidParams, 123, 'tenant123')
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('exchangeCodeForTokens', () => {
    const tokenParams = {
      grant_type: 'authorization_code',
      code: 'mock-auth-code',
      redirect_uri: 'http://matrix-local.openmeet.test:8448/_synapse/client/oidc/callback',
      client_id: 'matrix_synapse',
      client_secret: 'test-secret',
    };

    beforeEach(() => {
      process.env.MATRIX_OIDC_CLIENT_SECRET = 'test-secret';
      mockUserService.findById.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock-token');
    });

    it('should exchange authorization code for tokens', async () => {
      mockJwtService.verify.mockReturnValue({
        type: 'auth_code',
        client_id: 'matrix_synapse',
        userId: 123,
        tenantId: 'tenant123',
        nonce: 'test-nonce',
      });

      const result = await service.exchangeCodeForTokens(tokenParams);

      expect(result).toMatchObject({
        access_token: 'mock-token',
        token_type: 'Bearer',
        expires_in: 3600,
        id_token: 'mock-token',
      });

      expect(mockUserService.findById).toHaveBeenCalledWith(123, 'tenant123');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2); // access token + id token
    });

    it('should throw error for invalid grant_type', async () => {
      const invalidParams = { ...tokenParams, grant_type: 'implicit' };

      await expect(
        service.exchangeCodeForTokens(invalidParams)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid client credentials', async () => {
      const invalidParams = { ...tokenParams, client_secret: 'wrong-secret' };

      await expect(
        service.exchangeCodeForTokens(invalidParams)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid authorization code', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.exchangeCodeForTokens(tokenParams)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if user not found', async () => {
      mockJwtService.verify.mockReturnValue({
        type: 'auth_code',
        userId: 999,
        tenantId: 'tenant123',
      });
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        service.exchangeCodeForTokens(tokenParams)
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserInfo', () => {
    it('should return user info from valid access token', async () => {
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

      await expect(
        service.getUserInfo('invalid-token')
      ).rejects.toThrow(UnauthorizedException);
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
      
      const userInfo = service['mapUserToOidcClaims'](userWithoutMatrix, 'tenant123');

      expect(userInfo.matrix_handle).toBe('unknown');
      expect(userInfo.preferred_username).toBe('unknown');
    });

    it('should handle user with only email', () => {
      const userWithOnlyEmail = {
        slug: 'user123',
        firstName: null,
        lastName: null,
        email: 'test@example.com',
        matrixUserId: null,
      };

      const userInfo = service['mapUserToOidcClaims'](userWithOnlyEmail, 'tenant123');

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

      const userInfo = service['mapUserToOidcClaims'](userWithSlugOnly, 'tenant123');

      expect(userInfo.name).toBe('fallback-user');
    });
  });
});