import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';

describe('OidcController', () => {
  let controller: OidcController;
  let mockOidcService: jest.Mocked<OidcService>;

  beforeEach(async () => {
    mockOidcService = {
      getDiscoveryDocument: jest.fn(),
      getJwks: jest.fn(),
      handleAuthorization: jest.fn(),
      exchangeCodeForTokens: jest.fn(),
      getUserInfo: jest.fn(),
      getUserFromSession: jest.fn().mockResolvedValue(null),
      findUserByEmailAcrossTenants: jest.fn().mockResolvedValue(null),
    } as any;

    const mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'auth.secret') return 'test-secret';
        if (key === 'app.oidcIssuerUrl') return 'http://localhost:3000';
        return 'test-value';
      }),
    };

    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OidcController],
      providers: [
        {
          provide: OidcService,
          useValue: mockOidcService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: TempAuthCodeService,
          useValue: {
            generateAuthCode: jest.fn().mockResolvedValue('mock-auth-code'),
            validateAndConsumeAuthCode: jest.fn().mockResolvedValue(null),
            getActiveCodeCount: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: 1,
              email: 'test@example.com',
              firstName: 'Test',
              lastName: 'User',
            }),
          },
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

      const mockRequest = {
        headers: {
          host: 'api.openmeet.net',
        },
        secure: true,
      } as any;

      const result = controller.getDiscoveryDocument(mockRequest);

      expect(result).toBe(mockDiscovery);
      expect(mockOidcService.getDiscoveryDocument).toHaveBeenCalledWith(
        'https://api.openmeet.net',
      );
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

    it('should redirect to login when user is not authenticated', async () => {
      const mockRequest = {
        query: {},
        headers: {},
      } as any;

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      await controller.authorize(
        mockRequest,
        mockResponse,
        authParams.clientId,
        authParams.redirectUri,
        authParams.responseType,
        authParams.scope,
        authParams.state,
        authParams.nonce,
      );

      expect(mockResponse.redirect).toHaveBeenCalled();
      const redirectUrl = mockResponse.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('/api/oidc/login');
    });

    it('should throw BadRequestException for missing required parameters', async () => {
      const mockRequest = {
        query: {},
        headers: {},
      } as any;

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      await expect(
        controller.authorize(
          mockRequest,
          mockResponse,
          '', // missing client_id
          authParams.redirectUri,
          authParams.responseType,
          authParams.scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle missing optional parameters', async () => {
      const mockRequest = {
        query: {},
        headers: {},
      } as any;

      const mockResponse = {
        redirect: jest.fn(),
      } as any;

      await controller.authorize(
        mockRequest,
        mockResponse,
        authParams.clientId,
        authParams.redirectUri,
        authParams.responseType,
        authParams.scope,
        // no state or nonce
      );

      expect(mockResponse.redirect).toHaveBeenCalled();
    });
  });

  describe('token', () => {
    const tokenParams = {
      grant_type: 'authorization_code',
      code: 'auth-code-123',
      redirect_uri: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      client_id: 'matrix_synapse',
      client_secret: 'secret123',
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
        tokenParams, // pass full body
        tokenParams.grant_type,
        tokenParams.code,
        tokenParams.redirect_uri,
        undefined, // refresh_token
        undefined, // scope  
        tokenParams.client_id,
        tokenParams.client_secret,
      );

      expect(result).toBe(mockTokens);
      expect(mockOidcService.exchangeCodeForTokens).toHaveBeenCalledWith({
        grant_type: tokenParams.grant_type,
        code: tokenParams.code,
        redirect_uri: tokenParams.redirect_uri,
        client_id: tokenParams.client_id,
        client_secret: tokenParams.client_secret,
      });
    });

    it('should throw BadRequestException for missing parameters', async () => {
      const incompleteParams = {
        grant_type: '', // missing grant_type
        code: tokenParams.code,
        redirect_uri: tokenParams.redirect_uri,
      };

      await expect(
        controller.token(
          incompleteParams,
          '', // missing grant_type
          tokenParams.code,
          tokenParams.redirect_uri,
          tokenParams.client_id,
          tokenParams.client_secret,
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

  describe('showLoginForm', () => {
    const loginParams = {
      clientId: 'matrix_synapse',
      redirectUri: 'https://matrix.openmeet.net/_synapse/client/oidc/callback',
      responseType: 'code',
      scope: 'openid profile email',
      state: 'test-state',
      nonce: 'test-nonce',
    };

    it('should show login form for OIDC entry point', async () => {
      const mockRequest = {
        cookies: {},
        headers: {},
        query: {},
      } as any;

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.showLoginForm(
        mockRequest,
        mockResponse,
        loginParams.clientId,
        loginParams.redirectUri,
        loginParams.responseType,
        loginParams.scope,
        loginParams.state,
        loginParams.nonce,
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/html',
      );
      expect(mockResponse.send).toHaveBeenCalled();
      const htmlContent = mockResponse.send.mock.calls[0][0];
      expect(htmlContent).toContain('Sign in to OpenMeet');
      expect(htmlContent).toContain(loginParams.clientId);
    });

    it('should throw BadRequestException for missing required parameters', async () => {
      const mockRequest = {
        cookies: {},
        headers: {},
        query: {},
      } as any;

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await expect(
        controller.showLoginForm(
          mockRequest,
          mockResponse,
          '', // missing client_id
          loginParams.redirectUri,
          loginParams.responseType,
          loginParams.scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle optional state and nonce parameters', async () => {
      const mockRequest = {
        cookies: {},
        headers: {},
        query: {},
      } as any;

      const mockResponse = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as any;

      await controller.showLoginForm(
        mockRequest,
        mockResponse,
        loginParams.clientId,
        loginParams.redirectUri,
        loginParams.responseType,
        loginParams.scope,
        // no state or nonce
      );

      expect(mockResponse.send).toHaveBeenCalled();
      const htmlContent = mockResponse.send.mock.calls[0][0];
      expect(htmlContent).not.toContain('name="state"');
      expect(htmlContent).not.toContain('name="nonce"');
    });
  });
});
