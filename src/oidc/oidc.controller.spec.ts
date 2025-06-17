import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';

describe('OidcController', () => {
  let controller: OidcController;
  let mockOidcService: jest.Mocked<OidcService>;

  const mockRequest = {
    tenantId: 'tenant123',
  };

  const mockUser = {
    id: 123,
    slug: 'john-smith',
  };

  beforeEach(async () => {
    mockOidcService = {
      getDiscoveryDocument: jest.fn(),
      getJwks: jest.fn(),
      handleAuthorization: jest.fn(),
      exchangeCodeForTokens: jest.fn(),
      getUserInfo: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OidcController],
      providers: [
        {
          provide: OidcService,
          useValue: mockOidcService,
        },
      ],
    }).compile();

    controller = module.get<OidcController>(OidcController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDiscoveryDocument', () => {
    it('should return OIDC discovery document', () => {
      const mockDiscovery = {
        issuer: 'https://api.openmeet.net/oidc',
        authorization_endpoint: 'https://api.openmeet.net/oidc/auth',
      };
      mockOidcService.getDiscoveryDocument.mockReturnValue(mockDiscovery);

      const result = controller.getDiscoveryDocument();

      expect(result).toBe(mockDiscovery);
      expect(mockOidcService.getDiscoveryDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('getJwks', () => {
    it('should return JWKS document', () => {
      const mockJwks = {
        keys: [{ kty: 'oct', use: 'sig', kid: 'test', alg: 'HS256' }],
      };
      mockOidcService.getJwks.mockReturnValue(mockJwks);

      const result = controller.getJwks();

      expect(result).toBe(mockJwks);
      expect(mockOidcService.getJwks).toHaveBeenCalledTimes(1);
    });
  });

  describe('authorize', () => {
    const authParams = {
      clientId: 'matrix_synapse',
      redirectUri: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      responseType: 'code',
      scope: 'openid profile email',
      state: 'test-state',
      nonce: 'test-nonce',
    };

    it('should handle authorization request for authenticated user', async () => {
      const mockResult = {
        redirect_url:
          'https://matrix.openmeet.net/_synapse/client/oidc/callback?code=abc123&state=test-state',
        authorization_code: 'abc123',
      };
      mockOidcService.handleAuthorization.mockReturnValue(mockResult);

      const result = await controller.authorize(
        mockUser,
        mockRequest as any,
        authParams.clientId,
        authParams.redirectUri,
        authParams.responseType,
        authParams.scope,
        authParams.state,
        authParams.nonce,
      );

      expect(result).toEqual({ url: mockResult.redirect_url });
      expect(mockOidcService.handleAuthorization).toHaveBeenCalledWith(
        {
          client_id: authParams.clientId,
          redirect_uri: authParams.redirectUri,
          response_type: authParams.responseType,
          scope: authParams.scope,
          state: authParams.state,
          nonce: authParams.nonce,
        },
        mockUser.id,
        mockRequest.tenantId,
      );
    });

    it('should throw BadRequestException for missing required parameters', async () => {
      await expect(
        controller.authorize(
          mockUser,
          mockRequest as any,
          '', // missing client_id
          authParams.redirectUri,
          authParams.responseType,
          authParams.scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if tenant ID is missing', async () => {
      const requestWithoutTenant = {};

      await expect(
        controller.authorize(
          mockUser,
          requestWithoutTenant as any,
          authParams.clientId,
          authParams.redirectUri,
          authParams.responseType,
          authParams.scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('token', () => {
    const tokenParams = {
      grantType: 'authorization_code',
      code: 'auth-code-123',
      redirectUri: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      clientId: 'matrix_synapse',
      clientSecret: 'secret123',
    };

    it('should exchange authorization code for tokens', async () => {
      const mockTokens = {
        access_token: 'access-123',
        token_type: 'Bearer' as const,
        expires_in: 3600,
        id_token: 'id-123',
      };
      mockOidcService.exchangeCodeForTokens.mockResolvedValue(mockTokens);

      const result = await controller.token(
        tokenParams.grantType,
        tokenParams.code,
        tokenParams.redirectUri,
        tokenParams.clientId,
        tokenParams.clientSecret,
      );

      expect(result).toBe(mockTokens);
      expect(mockOidcService.exchangeCodeForTokens).toHaveBeenCalledWith({
        grant_type: tokenParams.grantType,
        code: tokenParams.code,
        redirect_uri: tokenParams.redirectUri,
        client_id: tokenParams.clientId,
        client_secret: tokenParams.clientSecret,
      });
    });

    it('should throw BadRequestException for missing parameters', async () => {
      await expect(
        controller.token(
          '', // missing grant_type
          tokenParams.code,
          tokenParams.redirectUri,
          tokenParams.clientId,
          tokenParams.clientSecret,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('userInfo', () => {
    it('should return user info for valid Bearer token', async () => {
      const mockUserInfo = {
        sub: 'john-smith',
        name: 'John Smith',
        email: 'john@example.com',
        preferred_username: 'john.smith',
        matrix_handle: 'john.smith',
        tenant_id: 'tenant123',
      };
      mockOidcService.getUserInfo.mockResolvedValue(mockUserInfo);

      const result = await controller.userInfo('Bearer access-token-123');

      expect(result).toBe(mockUserInfo);
      expect(mockOidcService.getUserInfo).toHaveBeenCalledWith(
        'access-token-123',
      );
    });

    it('should throw UnauthorizedException for missing Authorization header', async () => {
      await expect(controller.userInfo('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-Bearer token', async () => {
      await expect(controller.userInfo('Basic dXNlcjpwYXNz')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginEntry', () => {
    const loginParams = {
      clientId: 'matrix_synapse',
      redirectUri: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      responseType: 'code',
      scope: 'openid profile email',
      state: 'test-state',
      nonce: 'test-nonce',
    };

    it('should return login URL for OIDC entry point', async () => {
      const result = await controller.loginEntry(
        loginParams.clientId,
        loginParams.redirectUri,
        loginParams.responseType,
        loginParams.scope,
        loginParams.state,
        loginParams.nonce,
      );

      expect(result.login_url).toContain('/auth/login');
      expect(result.login_url).toContain('return_url=');
      expect(result.login_url).toContain(encodeURIComponent('/oidc/auth'));
      expect(result.message).toContain('Redirect to OpenMeet login');
    });

    it('should throw BadRequestException for missing required parameters', async () => {
      await expect(
        controller.loginEntry(
          '', // missing client_id
          loginParams.redirectUri,
          loginParams.responseType,
          loginParams.scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle optional state and nonce parameters', async () => {
      const result = await controller.loginEntry(
        loginParams.clientId,
        loginParams.redirectUri,
        loginParams.responseType,
        loginParams.scope,
        // no state or nonce
      );

      expect(result.login_url).toContain('/auth/login');
      expect(result.login_url).not.toContain('state=');
      expect(result.login_url).not.toContain('nonce=');
    });
  });
});
