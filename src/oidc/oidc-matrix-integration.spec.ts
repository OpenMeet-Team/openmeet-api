import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { default as request } from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OidcController } from './oidc.controller';
import { OidcService } from './services/oidc.service';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { UserService } from '../user/user.service';
import { MatrixRoomService } from '../matrix/services/matrix-room.service';
import { SessionService } from '../session/session.service';

describe('OIDC Matrix Integration (E2E)', () => {
  let app: INestApplication;
  let mockOidcService: jest.Mocked<OidcService>;
  let mockTempAuthCodeService: jest.Mocked<TempAuthCodeService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockSessionService: jest.Mocked<SessionService>;

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

    mockSessionService = {
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
      }),
      deleteSession: jest.fn().mockResolvedValue(undefined),
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
          useValue: mockSessionService,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({
        canActivate: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default state
    mockSessionService.findById.mockResolvedValue({
      user: { id: 1 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Matrix Client Authentication Flow', () => {
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
});
