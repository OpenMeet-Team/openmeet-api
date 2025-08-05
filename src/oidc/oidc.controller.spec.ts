import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';
import { MatrixRoomService } from '../matrix/services/matrix-room.service';
import { SessionService } from '../session/session.service';

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
        {
          provide: MatrixRoomService,
          useValue: {
            createRoom: jest
              .fn()
              .mockResolvedValue('!room:matrix.openmeet.net'),
            inviteUserToRoom: jest.fn().mockResolvedValue(undefined),
            getRoomAlias: jest
              .fn()
              .mockResolvedValue('#room-alias:matrix.openmeet.net'),
          },
        },
        {
          provide: SessionService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({
              sessionId: 'test-session-id',
              userId: 1,
              tenantId: 'tenant123',
            }),
            validateSession: jest.fn().mockResolvedValue({
              userId: 1,
              tenantId: 'tenant123',
            }),
            findById: jest.fn().mockResolvedValue({
              user: { id: 1 },
              tenantId: 'tenant123',
            }),
            deleteSession: jest.fn().mockResolvedValue(undefined),
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

    describe('Method 1: auth_code authentication', () => {
      it('should authenticate user with valid auth_code', async () => {
        const mockTempAuthData = {
          userId: 1,
          tenantId: 'tenant123',
        };
        const mockTempAuthCodeService = controller[
          'tempAuthCodeService'
        ] as jest.Mocked<any>;
        mockTempAuthCodeService.validateAndConsumeAuthCode.mockResolvedValue(
          mockTempAuthData,
        );
        mockOidcService.handleAuthorization.mockReturnValue({
          redirect_url:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback?code=auth123',
        });

        const mockRequest = {
          query: { auth_code: 'valid-auth-code-123' },
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
          'valid-auth-code-123',
        );

        expect(
          mockTempAuthCodeService.validateAndConsumeAuthCode,
        ).toHaveBeenCalledWith('valid-auth-code-123');
        expect(mockOidcService.handleAuthorization).toHaveBeenCalledWith(
          expect.objectContaining({
            client_id: authParams.clientId,
            redirect_uri: authParams.redirectUri,
          }),
          1, // userId
          'tenant123', // tenantId
        );
        expect(mockResponse.redirect).toHaveBeenCalled();
      });

      it('should redirect to login for invalid auth_code', async () => {
        const mockTempAuthCodeService = controller[
          'tempAuthCodeService'
        ] as jest.Mocked<any>;
        mockTempAuthCodeService.validateAndConsumeAuthCode.mockResolvedValue(
          null,
        );

        const mockRequest = {
          query: { auth_code: 'invalid-auth-code' },
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
          'invalid-auth-code',
        );

        expect(mockResponse.redirect).toHaveBeenCalled();
        const redirectUrl = mockResponse.redirect.mock.calls[0][0];
        expect(redirectUrl).toContain('/api/oidc/login');
      });
    });

    describe('login_hint with session validation (SECURITY CRITICAL)', () => {
      const mockJwtService = { verifyAsync: jest.fn() };
      const mockUserService = { findById: jest.fn() };
      const mockTempAuthCodeService = { generateAuthCode: jest.fn() };

      beforeEach(() => {
        (controller as any).jwtService = mockJwtService;
        (controller as any).userService = mockUserService;
        (controller as any).tempAuthCodeService = mockTempAuthCodeService;
      });

      it('should allow login_hint for authenticated user with matching email', async () => {
        // Setup: User is authenticated via session cookies
        const mockSessionService = { findById: jest.fn() };
        (controller as any).sessionService = mockSessionService;
        
        mockSessionService.findById.mockResolvedValue({
          user: { id: 1 },
        });

        // User entity matches login_hint email
        mockUserService.findById.mockResolvedValue({
          id: 1,
          email: 'user@example.com',
          firstName: 'Test',
          lastName: 'User',
        });

        mockTempAuthCodeService.generateAuthCode.mockResolvedValue(
          'generated-auth-code',
        );
        mockOidcService.handleAuthorization.mockReturnValue({
          redirect_url:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback?code=auth123',
        });

        const mockRequest = {
          query: {
            login_hint: 'user@example.com',
          },
          headers: {},
          cookies: {
            oidc_session: 'session123',
            oidc_tenant: 'tenant123',
          },
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

        expect(mockUserService.findById).toHaveBeenCalledWith(1, 'tenant123');
        expect(mockOidcService.handleAuthorization).toHaveBeenCalled();
        expect(mockResponse.redirect).toHaveBeenCalled();
      });

      it('should REJECT login_hint for unauthenticated user (SECURITY TEST)', async () => {
        // SECURITY: This is the critical test - login_hint alone should NOT work
        mockOidcService.findUserByEmailAcrossTenants.mockResolvedValue({
          user: { id: 999, email: 'victim@company.com' },
          tenantId: 'victim-tenant',
        });

        const mockRequest = {
          query: {
            login_hint: 'victim@company.com', // Only login_hint, no authentication
          },
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

        // Should redirect to login form, NOT auto-authenticate
        expect(mockResponse.redirect).toHaveBeenCalled();
        const redirectUrl = mockResponse.redirect.mock.calls[0][0];
        expect(redirectUrl).toContain('/api/oidc/login');
        expect(redirectUrl).toContain('login_hint=victim%40company.com'); // Email pre-fill only

        // Should NOT call findUserByEmailAcrossTenants or generateAuthCode
        expect(
          mockOidcService.findUserByEmailAcrossTenants,
        ).not.toHaveBeenCalled();
        expect(mockTempAuthCodeService.generateAuthCode).not.toHaveBeenCalled();
      });

      it('should REJECT login_hint when session user email does not match hint', async () => {
        // Setup: User is authenticated but login_hint is for different user
        const mockSessionService = { findById: jest.fn() };
        (controller as any).sessionService = mockSessionService;
        
        mockSessionService.findById.mockResolvedValue({
          user: { id: 1 },
        });

        // Session user has different email than login_hint
        mockUserService.findById.mockResolvedValue({
          id: 1,
          email: 'legitimate@user.com',
          firstName: 'Legitimate',
          lastName: 'User',
        });

        const mockRequest = {
          query: {
            login_hint: 'victim@company.com', // Different from session user
          },
          headers: {},
          cookies: {
            oidc_session: 'session123',
            oidc_tenant: 'tenant123',
          },
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

        // Should redirect to login form due to email mismatch
        expect(mockUserService.findById).toHaveBeenCalledWith(1, 'tenant123');
        expect(mockResponse.redirect).toHaveBeenCalled();
        const redirectUrl = mockResponse.redirect.mock.calls[0][0];
        expect(redirectUrl).toContain('/api/oidc/login');

        // Should NOT generate auth code for mismatched user
        expect(mockTempAuthCodeService.generateAuthCode).not.toHaveBeenCalled();
      });
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
