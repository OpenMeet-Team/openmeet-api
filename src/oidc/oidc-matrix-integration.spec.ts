import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { default as request } from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';
import { MatrixRoomService } from '../matrix/services/matrix-room.service';
import { SessionService } from '../session/session.service';

describe('OIDC Matrix Integration (E2E)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mockOidcService: jest.Mocked<OidcService>;
  let mockTempAuthCodeService: jest.Mocked<TempAuthCodeService>;
  let mockUserService: jest.Mocked<UserService>;

  beforeAll(async () => {
    // Create mocked services
    mockOidcService = {
      getDiscoveryDocument: jest.fn(),
      getJwks: jest.fn(),
      handleAuthorization: jest.fn(),
      exchangeCodeForTokens: jest.fn(),
      getUserInfo: jest.fn(),
      getUserFromSession: jest.fn().mockResolvedValue(null),
      findUserByEmailAcrossTenants: jest.fn().mockResolvedValue(null),
    } as any;

    mockTempAuthCodeService = {
      generateAuthCode: jest.fn().mockResolvedValue('temp-auth-code-123'),
      validateAndConsumeAuthCode: jest.fn().mockResolvedValue(null),
      getActiveCodeCount: jest.fn().mockResolvedValue(0),
    } as any;

    mockUserService = {
      findById: jest.fn(),
    } as any;

    const mockConfigService = {
      get: jest.fn().mockImplementation((key) => {
        if (key === 'auth.secret') return 'test-secret-key-for-jwt';
        if (key === 'app.oidcIssuerUrl') return 'http://localhost:3000';
        return 'test-value';
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OidcController],
      providers: [
        JwtService,
        {
          provide: OidcService,
          useValue: mockOidcService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TempAuthCodeService,
          useValue: mockTempAuthCodeService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
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
            deleteSession: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Matrix Client Authentication Flow', () => {
    it('should allow seamless Matrix authentication for authenticated users', async () => {
      // Step 1: Create a valid JWT token for a user
      const userPayload = { id: 1, tenantId: 'tenant123' };
      const validJwtToken = await jwtService.signAsync(userPayload, {
        secret: 'test-secret-key-for-jwt',
        expiresIn: '1h',
      });

      // Step 2: Mock user service to return user with matching email
      mockUserService.findById.mockResolvedValue({
        id: 1,
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
      });

      // Step 3: Mock OIDC service for successful authorization
      mockOidcService.handleAuthorization.mockReturnValue({
        redirect_url:
          'https://matrix.openmeet.net/_synapse/client/oidc/callback?code=matrix-auth-code',
      });

      // Step 4: Simulate Matrix client request with user_token and login_hint
      // This simulates the flow from matrixClientService.ts where:
      // 1. User is authenticated in OpenMeet platform (user_token)
      // 2. Matrix client adds login_hint for seamless authentication
      const response = await request(app.getHttpServer())
        .get('/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'matrix-session-state-123',
          user_token: validJwtToken, // Method 2: User authenticated
          login_hint: 'user@example.com', // Method 5: login_hint matches user email
          tenantId: 'tenant123',
        });

      // Step 5: Verify successful authentication and redirect
      expect(response.status).toBe(302); // Redirect response
      expect(response.headers.location).toContain('matrix.openmeet.net');
      expect(response.headers.location).toContain('code='); // Auth code present

      // Step 6: Verify that user was validated against login_hint
      expect(mockUserService.findById).toHaveBeenCalledWith(1, 'tenant123');
      expect(mockOidcService.handleAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: 'matrix_synapse',
          redirect_uri:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback',
        }),
        1, // userId
        'tenant123', // tenantId
      );
    });

    it('should BLOCK Matrix authentication when login_hint does not match authenticated user', async () => {
      // Step 1: Create a valid JWT token for a user
      const userPayload = { id: 1, tenantId: 'tenant123' };
      const validJwtToken = await jwtService.signAsync(userPayload, {
        secret: 'test-secret-key-for-jwt',
        expiresIn: '1h',
      });

      // Step 2: Mock user service to return user with DIFFERENT email
      mockUserService.findById.mockResolvedValue({
        id: 1,
        email: 'legitimate@user.com', // Different from login_hint
        firstName: 'Legitimate',
        lastName: 'User',
      });

      // Step 3: Simulate potential attack where authenticated user tries to use different login_hint
      const response = await request(app.getHttpServer())
        .get('/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'matrix-session-state-123',
          user_token: validJwtToken, // Valid authentication
          login_hint: 'victim@company.com', // Different email - potential attack
          tenantId: 'tenant123',
        });

      // Step 4: Verify that request is redirected to login form (security measure)
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/api/oidc/login');
      expect(response.headers.location).toContain(
        'login_hint=victim%40company.com',
      );

      // Step 5: Verify that user validation was attempted but authorization was blocked
      expect(mockUserService.findById).toHaveBeenCalledWith(1, 'tenant123');
      expect(mockOidcService.handleAuthorization).not.toHaveBeenCalled();
    });

    it('should BLOCK unauthenticated Matrix requests with login_hint (Critical Security Test)', async () => {
      // Step 1: Simulate potential attack with only login_hint, no authentication
      const response = await request(app.getHttpServer())
        .get('/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'matrix-session-state-123',
          login_hint: 'victim@company.com', // Only login_hint, no user_token
        });

      // Step 2: Verify that request is redirected to login form
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/api/oidc/login');
      expect(response.headers.location).toContain(
        'login_hint=victim%40company.com',
      );

      // Step 3: Verify that NO authentication bypass occurred
      expect(mockUserService.findById).not.toHaveBeenCalled();
      expect(mockOidcService.handleAuthorization).not.toHaveBeenCalled();
      expect(
        mockOidcService.findUserByEmailAcrossTenants,
      ).not.toHaveBeenCalled();
    });
  });

  describe('OAuth Callback Flow', () => {
    it('should handle GitHub/Bluesky OAuth callback with user_token', async () => {
      // Step 1: Create valid JWT token (simulates OAuth callback from GitHub/Bluesky)
      const userPayload = { id: 2, tenantId: 'tenant456' };
      const validJwtToken = await jwtService.signAsync(userPayload, {
        secret: 'test-secret-key-for-jwt',
        expiresIn: '1h',
      });

      // Step 2: Mock OIDC service for successful authorization
      mockOidcService.handleAuthorization.mockReturnValue({
        redirect_url:
          'https://matrix.openmeet.net/_synapse/client/oidc/callback?code=oauth-callback-code',
      });

      // Step 3: Simulate OAuth callback request (from GitHub/Bluesky pages)
      const response = await request(app.getHttpServer())
        .get('/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri:
            'https://matrix.openmeet.net/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'oauth-callback-state-456',
          user_token: validJwtToken, // Method 2: From OAuth callback
          tenantId: 'tenant456',
        });

      // Step 4: Verify successful authentication
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('matrix.openmeet.net');
      expect(response.headers.location).toContain('code=');

      expect(mockOidcService.handleAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          client_id: 'matrix_synapse',
        }),
        2, // userId from OAuth callback
        'tenant456', // tenantId from OAuth callback
      );
    });
  });
});
