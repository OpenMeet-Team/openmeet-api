import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { OidcService } from './oidc.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { SessionService } from '../../session/session.service';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import * as jwt from 'jsonwebtoken';

describe('OidcService', () => {
  let service: OidcService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockJwtService: jest.Mocked<JwtService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockSessionService: jest.Mocked<SessionService>;
  let mockGlobalMatrixValidationService: jest.Mocked<GlobalMatrixValidationService>;

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

    mockGlobalMatrixValidationService = {
      getMatrixHandleForUser: jest.fn(),
      isMatrixHandleUnique: jest.fn(),
      registerMatrixHandle: jest.fn(),
      suggestAvailableHandles: jest.fn(),
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
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalMatrixValidationService,
        },
        {
          provide: ElastiCacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
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

  describe('Matrix State Preservation', () => {
    const matrixState = 'woRNVZWvJAa8v11ZIbPjWpa2iN3mEy'; // Real Matrix session state
    const authParams = {
      client_id: 'matrix_synapse',
      redirect_uri:
        'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
      response_type: 'code',
      scope: 'openid profile email',
      state: matrixState,
      nonce: 'wPO1q3JlqmsYxeIK3fansuzHAeC7q9yB',
    };

    it('should preserve Matrix state parameter in authorization code JWT', () => {
      const result = service.handleAuthorization(
        authParams,
        22,
        'lsdfaopkljdfs',
      );

      // Verify the authorization code is a JWT
      expect(result.authorization_code).toBeDefined();
      expect(typeof result.authorization_code).toBe('string');

      // Verify it's a valid JWT by decoding it
      const decoded = jwt.decode(result.authorization_code, { complete: true });
      expect(decoded).toBeTruthy();
      expect(decoded.payload).toBeDefined();

      // Verify Matrix state is preserved in the JWT payload
      const payload = decoded.payload as any;
      expect(payload.state).toBe(matrixState);
      expect(payload.matrix_original_state).toBe(matrixState);
      expect(payload.type).toBe('auth_code');
      expect(payload.client_id).toBe('matrix_synapse');
      expect(payload.userId).toBe(22);
      expect(payload.tenantId).toBe('lsdfaopkljdfs');
    });

    it('should preserve Matrix state in redirect URL', () => {
      const result = service.handleAuthorization(
        authParams,
        22,
        'lsdfaopkljdfs',
      );

      // Verify the redirect URL contains the exact Matrix state
      expect(result.redirect_url).toContain(`state=${matrixState}`);

      // Parse the URL to verify the state parameter
      const url = new URL(result.redirect_url);
      expect(url.searchParams.get('state')).toBe(matrixState);
      expect(url.searchParams.get('code')).toBeDefined();
    });

    it('should handle undefined Matrix state gracefully', () => {
      const authParamsNoState = { ...authParams, state: undefined };

      const result = service.handleAuthorization(
        authParamsNoState,
        22,
        'lsdfaopkljdfs',
      );

      // Verify the authorization code is still generated
      expect(result.authorization_code).toBeDefined();

      // Verify the redirect URL doesn't contain state parameter
      expect(result.redirect_url).not.toContain('state=');

      // Verify JWT payload handles undefined state
      const decoded = jwt.decode(result.authorization_code, { complete: true });
      const payload = decoded.payload as any;
      expect(payload.state).toBeUndefined();
      expect(payload.matrix_original_state).toBeUndefined();
    });

    it('should preserve empty Matrix state', () => {
      const authParamsEmptyState = { ...authParams, state: '' };

      const result = service.handleAuthorization(
        authParamsEmptyState,
        22,
        'lsdfaopkljdfs',
      );

      // Verify empty state is preserved
      const decoded = jwt.decode(result.authorization_code, { complete: true });
      const payload = decoded.payload as any;
      expect(payload.state).toBe('');
      expect(payload.matrix_original_state).toBe('');

      // Verify redirect URL contains empty state
      expect(result.redirect_url).toContain('state=');
      const url = new URL(result.redirect_url);
      expect(url.searchParams.get('state')).toBe('');
    });

    it('should preserve Matrix state through full authorization code exchange flow', async () => {
      // Setup mocks
      process.env.MATRIX_OIDC_CLIENT_SECRET = 'test-secret';
      mockUserService.findById.mockResolvedValue(mockUser);
      mockGlobalMatrixValidationService.getMatrixHandleForUser.mockResolvedValue(
        'john.smith',
      );

      // Generate authorization code with Matrix state
      const authResult = service.handleAuthorization(
        authParams,
        22,
        'lsdfaopkljdfs',
      );

      // Exchange the code for tokens
      const tokenParams = {
        grant_type: 'authorization_code',
        code: authResult.authorization_code,
        redirect_uri: authParams.redirect_uri,
        client_id: 'matrix_synapse',
        client_secret: 'test-secret',
      };

      const tokenResult = await service.exchangeCodeForTokens(tokenParams);

      // Verify tokens are generated successfully
      expect(tokenResult.access_token).toBeDefined();
      expect(tokenResult.id_token).toBeDefined();
      expect(tokenResult.token_type).toBe('Bearer');

      // The original Matrix state should have been preserved through the flow
      // (This test verifies the JWT validation works with our Matrix state preservation)
      expect(mockUserService.findById).toHaveBeenCalledWith(
        22,
        'lsdfaopkljdfs',
      );
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
      const userInfo = {
        sub: 'john-smith',
        name: 'John Smith',
        email: 'john@example.com',
        preferred_username: 'john.smith',
        tenant_id: 'tenant123',
      };

      // Create a real JWT token using the RSA key pair
      const validToken = jwt.sign(userInfo, service['rsaKeyPair'].privateKey, {
        algorithm: 'RS256',
        expiresIn: '1h',
      });

      const result = await service.getUserInfo(validToken);

      expect(result).toEqual(expect.objectContaining(userInfo));
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
    it('should map user with Matrix ID to OIDC claims', async () => {
      // Mock registry to return handle for existing Matrix user
      mockGlobalMatrixValidationService.getMatrixHandleForUser.mockResolvedValue(
        {
          id: 1,
          handle: 'john.smith_tenant123',
          tenantId: 'tenant123',
          userId: 123,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      const userInfo = await service['mapUserToOidcClaims'](
        mockUser,
        'tenant123',
      );

      expect(userInfo).toEqual({
        sub: 'john-smith',
        name: 'John Smith',
        email: 'john@example.com',
        preferred_username: 'john.smith_tenant123',
        tenant_id: 'tenant123',
      });
    });

    it('should handle user without Matrix ID', async () => {
      const userWithoutMatrix = { ...mockUser, matrixUserId: null };

      // Mock registry to return null (no Matrix handle found)
      mockGlobalMatrixValidationService.getMatrixHandleForUser.mockResolvedValue(
        null,
      );

      const userInfo = await service['mapUserToOidcClaims'](
        userWithoutMatrix,
        'tenant123',
      );

      expect(userInfo.preferred_username).toBe('john-smith_tenant123'); // Uses registry lookup, falls back to slug_tenant format
    });

    it('should handle user with only email', async () => {
      const userWithOnlyEmail = {
        id: 456,
        slug: 'user123',
        firstName: null,
        lastName: null,
        email: 'test@example.com',
        matrixUserId: null,
      };

      // Mock registry to return null (no Matrix handle found)
      mockGlobalMatrixValidationService.getMatrixHandleForUser.mockResolvedValue(
        null,
      );

      const userInfo = await service['mapUserToOidcClaims'](
        userWithOnlyEmail,
        'tenant123',
      );

      expect(userInfo.name).toBe('test');
      expect(userInfo.sub).toBe('user123');
    });

    it('should use slug as fallback name', async () => {
      const userWithSlugOnly = {
        id: 789,
        slug: 'fallback-user',
        firstName: null,
        lastName: null,
        email: null,
        matrixUserId: null,
      };

      // Mock registry to return null (no Matrix handle found)
      mockGlobalMatrixValidationService.getMatrixHandleForUser.mockResolvedValue(
        null,
      );

      const userInfo = await service['mapUserToOidcClaims'](
        userWithSlugOnly,
        'tenant123',
      );

      expect(userInfo.name).toBe('fallback-user');
    });
  });
});
