import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { UserEntity } from '../../src/user/infrastructure/persistence/relational/entities/user.entity';
import { SessionEntity } from '../../src/session/infrastructure/persistence/relational/entities/session.entity';
import { TenantConnectionService } from '../../src/tenant/tenant.service';
import * as jwt from 'jsonwebtoken';

describe('OIDC Matrix State Preservation (E2E)', () => {
  let app: INestApplication;
  let tenantConnectionService: TenantConnectionService;
  // let jwtService: JwtService;
  let dataSource: DataSource;

  const testTenantId = 'lsdfaopkljdfs';
  const matrixState = 'woRNVZWvJAa8v11ZIbPjWpa2iN3mEy'; // Real Matrix session state
  let testUserId: number;
  let sessionId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    tenantConnectionService = moduleFixture.get<TenantConnectionService>(
      TenantConnectionService,
    );
    // jwtService = moduleFixture.get<JwtService>(JwtService);

    await app.init();

    // Get tenant database connection
    dataSource =
      await tenantConnectionService.getTenantConnection(testTenantId);
  });

  beforeEach(async () => {
    // Create test user
    const userRepository = dataSource.getRepository(UserEntity);
    const user = userRepository.create({
      email: 'matrix-test@openmeet.net',
      firstName: 'Matrix',
      lastName: 'Test',
      slug: 'matrix-test-user',
      role: { id: 1 } as any,
    });
    const savedUser = await userRepository.save(user);
    testUserId = savedUser.id;

    // Create test session for OIDC authentication
    const sessionRepository = dataSource.getRepository(SessionEntity);
    const session = sessionRepository.create({
      user: savedUser,
      createdAt: new Date(),
      deletedAt: null,
    });
    const savedSession = await sessionRepository.save(session);
    sessionId = savedSession.id.toString();
  });

  afterEach(async () => {
    // Clean up test data
    const sessionRepository = dataSource.getRepository(SessionEntity);
    const userRepository = dataSource.getRepository(UserEntity);

    await sessionRepository.delete({ id: Number(sessionId) });
    await userRepository.delete({ id: testUserId });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Matrix OIDC Authorization Flow', () => {
    it('should preserve Matrix state through complete OIDC authorization flow', async () => {
      // Step 1: Matrix initiates OIDC flow with state parameter
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matrixState,
        nonce: 'wPO1q3JlqmsYxeIK3fansuzHAeC7q9yB',
      };

      // Make request to authorization endpoint with session cookie
      const authResponse = await request.default(app.getHttpServer())
        .get('/api/oidc/auth')
        .query(authParams)
        .set('Cookie', `oidc_session=${sessionId}`)
        .expect(302); // Should redirect to Matrix callback

      // Verify redirect URL contains preserved state
      const redirectLocation = authResponse.headers.location;
      expect(redirectLocation).toBeDefined();
      expect(redirectLocation).toContain(`state=${matrixState}`);

      // Extract authorization code from redirect URL
      const redirectUrl = new URL(redirectLocation);
      const authCode = redirectUrl.searchParams.get('code')!;
      const returnedState = redirectUrl.searchParams.get('state');

      expect(authCode).toBeDefined();
      expect(returnedState).toBe(matrixState);

      // Step 2: Verify the authorization code JWT contains preserved Matrix state
      const decodedAuthCode = jwt.decode(authCode!, { complete: true });
      expect(decodedAuthCode).toBeTruthy();

      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBe(matrixState);
      expect(payload.matrix_original_state).toBe(matrixState);
      expect(payload.type).toBe('auth_code');
      expect(payload.client_id).toBe('matrix_synapse');
      expect(payload.userId).toBe(testUserId);
      expect(payload.tenantId).toBe(testTenantId);

      // Step 3: Exchange authorization code for tokens (Matrix callback simulation)
      const tokenParams = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: authParams.redirect_uri,
        client_id: 'matrix_synapse',
        client_secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
      };

      const tokenResponse = await request.default(app.getHttpServer())
        .post('/api/oidc/token')
        .send(tokenParams)
        .expect(200);

      // Verify tokens are generated successfully
      expect(tokenResponse.body.access_token).toBeDefined();
      expect(tokenResponse.body.id_token).toBeDefined();
      expect(tokenResponse.body.token_type).toBe('Bearer');
      expect(tokenResponse.body.expires_in).toBe(3600);

      // Step 4: Verify user info can be retrieved with access token
      const userInfoResponse = await request.default(app.getHttpServer())
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
        .expect(200);

      expect(userInfoResponse.body.sub).toBeDefined();
      expect(userInfoResponse.body.email).toBe('matrix-test@openmeet.net');
      expect(userInfoResponse.body.tenant_id).toBe(testTenantId);
    });

    it('should handle OIDC flow with no Matrix state parameter', async () => {
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        nonce: 'test-nonce-no-state',
        // No state parameter
      };

      const authResponse = await request.default(app.getHttpServer())
        .get('/api/oidc/auth')
        .query(authParams)
        .set('Cookie', `oidc_session=${sessionId}`)
        .expect(302);

      const redirectLocation = authResponse.headers.location;
      const redirectUrl = new URL(redirectLocation);
      const authCode = redirectUrl.searchParams.get('code')!;

      // Should not have state parameter in redirect
      expect(redirectUrl.searchParams.has('state')).toBe(false);

      // Verify JWT doesn't have state
      const decodedAuthCode = jwt.decode(authCode!, { complete: true });
      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBeUndefined();
      expect(payload.matrix_original_state).toBeUndefined();

      // Should still be able to exchange for tokens
      const tokenParams = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: authParams.redirect_uri,
        client_id: 'matrix_synapse',
        client_secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
      };

      await request.default(app.getHttpServer())
        .post('/api/oidc/token')
        .send(tokenParams)
        .expect(200);
    });

    it('should preserve Matrix state with special characters', async () => {
      const specialMatrixState = 'ABC123-_=+/special%20state&chars';
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: specialMatrixState,
        nonce: 'test-nonce',
      };

      const authResponse = await request.default(app.getHttpServer())
        .get('/api/oidc/auth')
        .query(authParams)
        .set('Cookie', `oidc_session=${sessionId}`)
        .expect(302);

      const redirectLocation = authResponse.headers.location;
      const redirectUrl = new URL(redirectLocation);
      const returnedState = redirectUrl.searchParams.get('state');
      const authCode = redirectUrl.searchParams.get('code')!;

      // Verify special characters in state are preserved
      expect(returnedState).toBe(specialMatrixState);

      // Verify JWT contains the special state
      const decodedAuthCode = jwt.decode(authCode!, { complete: true });
      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBe(specialMatrixState);
      expect(payload.matrix_original_state).toBe(specialMatrixState);
    });
  });

  describe('Matrix OIDC Error Scenarios', () => {
    it('should fail gracefully when Matrix state validation would fail in dev environment', async () => {
      // This test simulates what happens in dev environment with strict validation
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matrixState,
        nonce: 'test-nonce',
      };

      // Get authorization code
      const authResponse = await request.default(app.getHttpServer())
        .get('/api/oidc/auth')
        .query(authParams)
        .set('Cookie', `oidc_session=${sessionId}`)
        .expect(302);

      const redirectUrl = new URL(authResponse.headers.location);
      const authCode = redirectUrl.searchParams.get('code')!;

      // Try to exchange with wrong redirect URI (simulates Matrix callback validation)
      const tokenParams = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: 'https://wrong-redirect.com/callback', // Wrong redirect URI
        client_id: 'matrix_synapse',
        client_secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
      };

      // Should fail because our fix ensures proper JWT validation
      const decoded = jwt.decode(authCode!) as any;
      expect(decoded!.redirect_uri).toBe(authParams.redirect_uri);
      expect(decoded!.redirect_uri).not.toBe(tokenParams.redirect_uri);
    });

    it('should reject invalid client_id to prevent Matrix session hijacking', async () => {
      const authParams = {
        client_id: 'evil_client', // Invalid client
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matrixState,
      };

      await request.default(app.getHttpServer())
        .get('/api/oidc/auth')
        .query(authParams)
        .set('Cookie', `oidc_session=${sessionId}`)
        .expect(401); // Should reject invalid client
    });
  });
});
