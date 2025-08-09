import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAS_URL,
  TESTING_MAS_CLIENT_SECRET,
} from '../utils/constants';
import { createTestUser } from '../utils/functions';

const TEST_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
if (!TEST_CLIENT_ID) {
  throw new Error(
    'OAUTH_CLIENT_ID environment variable is required for E2E tests',
  );
}

/**
 * MAS Userinfo Endpoint User Isolation E2E Tests
 *
 * This test specifically targets the issue where MAS's /oauth2/userinfo endpoint
 * was returning the wrong user data ("the-admin-vothhz") for all authenticated users.
 *
 * The test simulates the exact scenario where:
 * 1. Frontend sends login_hint=user@domain.com to MAS
 * 2. MAS processes OIDC authentication flow
 * 3. MAS userinfo endpoint should return the correct user data
 *
 * Root Cause Identified:
 * - MAS was reusing active sessions instead of creating proper per-user sessions
 * - Multiple concurrent user sessions caused session isolation issues
 * - MAS userinfo endpoint returned data for wrong active session
 *
 * This test verifies the fix by ensuring each user gets their own userinfo data.
 */
jest.setTimeout(120000);

describe('MAS Userinfo Endpoint User Isolation', () => {
  let testUserA: any;
  let testUserB: any;
  let testUserAToken: string;
  let testUserBToken: string;
  let testUserAEmail: string;
  let testUserBEmail: string;

  beforeAll(async () => {
    jest.setTimeout(180000);

    const timestamp = Date.now();

    // Create test users with very distinct identities to catch crossover
    testUserAEmail = `mas-userinfo-test-alpha-${timestamp}@openmeet.net`;
    testUserBEmail = `mas-userinfo-test-beta-${timestamp}@openmeet.net`;

    try {
      // Create users with distinct names to detect any mixing
      testUserA = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testUserAEmail,
        'Alpha',
        'UserA',
        'password123',
      );

      testUserB = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testUserBEmail,
        'Beta',
        'UserB',
        'password123',
      );

      // Login both users
      const userALoginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .send({
          email: testUserAEmail,
          password: 'password123',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const userBLoginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .send({
          email: testUserBEmail,
          password: 'password123',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      testUserAToken = userALoginResponse.body.token;
      testUserBToken = userBLoginResponse.body.token;

      console.log(`🔐 Test users created for MAS userinfo isolation test:
        User A: ${testUserA.slug} (${testUserAEmail})
        User B: ${testUserB.slug} (${testUserBEmail})`);
    } catch (error) {
      console.error('Error in MAS userinfo test setup:', error.message);
      throw error;
    }
  });

  afterAll(() => {
    jest.setTimeout(5000);
  });

  describe('MAS Userinfo Endpoint Session Isolation', () => {
    it('should return correct userinfo for User A after full MAS authentication flow', async () => {
      // Simulate exact MAS authentication flow as it happens in practice

      // Step 1: Generate auth code for User A
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUserAToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      console.log(`Generated auth code for User A: ${testUserA.slug}`);

      // Step 2: Complete OIDC authorization (this creates the session in MAS)
      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'mas_userinfo_test_userA',
          auth_code: authCode,
          tenantId: TESTING_TENANT_ID,
          // Simulate login_hint that frontend would send
          login_hint: testUserAEmail,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect([302, 303]).toContain(authResponse.status);
      expect(authResponse.headers.location).toContain('code=');

      // Step 3: Extract authorization code from MAS redirect
      const masRedirectUrl = new URL(authResponse.headers.location);
      const masAuthCode = masRedirectUrl.searchParams.get('code');
      expect(masAuthCode).toBeTruthy();

      // Step 4: Exchange authorization code for access token
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: masAuthCode,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          client_id: TEST_CLIENT_ID,
          client_secret: TESTING_MAS_CLIENT_SECRET,
        })
        .expect(200);

      const accessToken = tokenResponse.body.access_token;
      expect(accessToken).toBeTruthy();

      // Step 5: CRITICAL TEST - Call userinfo endpoint
      // This is where the bug was occurring - MAS was returning wrong user data
      const userinfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // VERIFY: Must return User A's data, not admin or any other user
      expect(userinfoResponse.body).toHaveProperty('sub');
      expect(userinfoResponse.body).toHaveProperty('email', testUserAEmail);
      expect(userinfoResponse.body).toHaveProperty(
        'preferred_username',
        `${testUserA.slug}_${TESTING_TENANT_ID}`.toLowerCase(),
      );
      expect(userinfoResponse.body).toHaveProperty('name', 'Alpha UserA');

      // CRITICAL ASSERTIONS: Should NOT return data for other users
      expect(userinfoResponse.body.preferred_username).not.toBe(
        'the-admin-vothhz',
      );
      expect(userinfoResponse.body.email).not.toBe('admin@openmeet.net');
      expect(userinfoResponse.body.preferred_username).not.toBe(testUserB.slug);
      expect(userinfoResponse.body.email).not.toBe(testUserBEmail);

      console.log(
        `✅ MAS userinfo correctly returned User A data: ${userinfoResponse.body.preferred_username}`,
      );
    });

    it('should return different userinfo for User B after separate authentication flow', async () => {
      // Step 1: Generate auth code for User B (different user)
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUserBToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      console.log(`Generated auth code for User B: ${testUserB.slug}`);

      // Step 2: Complete OIDC authorization for User B
      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'mas_userinfo_test_userB',
          auth_code: authCode,
          tenantId: TESTING_TENANT_ID,
          login_hint: testUserBEmail,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect([302, 303]).toContain(authResponse.status);

      // Step 3: Extract and exchange authorization code
      const masRedirectUrl = new URL(authResponse.headers.location);
      const masAuthCode = masRedirectUrl.searchParams.get('code');

      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: masAuthCode,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          client_id: TEST_CLIENT_ID,
          client_secret: TESTING_MAS_CLIENT_SECRET,
        })
        .expect(200);

      const accessToken = tokenResponse.body.access_token;

      // Step 4: CRITICAL TEST - Call userinfo endpoint for User B
      const userinfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // VERIFY: Must return User B's data, not User A or admin
      expect(userinfoResponse.body).toHaveProperty('sub');
      expect(userinfoResponse.body).toHaveProperty('email', testUserBEmail);
      expect(userinfoResponse.body).toHaveProperty(
        'preferred_username',
        `${testUserB.slug}_${TESTING_TENANT_ID}`.toLowerCase(),
      );
      expect(userinfoResponse.body).toHaveProperty('name', 'Beta UserB');

      // CRITICAL ASSERTIONS: Should NOT return data for other users
      expect(userinfoResponse.body.preferred_username).not.toBe(
        'the-admin-vothhz',
      );
      expect(userinfoResponse.body.email).not.toBe('admin@openmeet.net');
      expect(userinfoResponse.body.preferred_username).not.toBe(testUserA.slug);
      expect(userinfoResponse.body.email).not.toBe(testUserAEmail);

      console.log(
        `✅ MAS userinfo correctly returned User B data: ${userinfoResponse.body.preferred_username}`,
      );
    });

    it('should maintain session isolation under rapid user switching scenarios', async () => {
      // This test simulates the exact scenario that was failing:
      // Multiple users authenticating in sequence, with MAS potentially
      // reusing sessions incorrectly.

      const results = [];

      // Rapid sequence: A -> B -> A -> B
      const sequence = [
        {
          user: testUserA,
          token: testUserAToken,
          email: testUserAEmail,
          label: 'A1',
        },
        {
          user: testUserB,
          token: testUserBToken,
          email: testUserBEmail,
          label: 'B1',
        },
        {
          user: testUserA,
          token: testUserAToken,
          email: testUserAEmail,
          label: 'A2',
        },
        {
          user: testUserB,
          token: testUserBToken,
          email: testUserBEmail,
          label: 'B2',
        },
      ];

      for (const step of sequence) {
        // Generate auth code
        const authCodeResponse = await request(TESTING_APP_URL)
          .post('/api/matrix/generate-auth-code')
          .set('Authorization', `Bearer ${step.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .expect(200);

        // Complete auth flow
        const authResponse = await request(TESTING_APP_URL)
          .get('/api/oidc/auth')
          .query({
            client_id: TEST_CLIENT_ID,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            response_type: 'code',
            scope: 'openid profile email',
            state: `rapid_switch_${step.label}`,
            auth_code: authCodeResponse.body.authCode,
            tenantId: TESTING_TENANT_ID,
            login_hint: step.email,
          })
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Exchange code for token
        const masUrl = new URL(authResponse.headers.location);
        const masCode = masUrl.searchParams.get('code');

        const tokenResponse = await request(TESTING_APP_URL)
          .post('/api/oidc/token')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            grant_type: 'authorization_code',
            code: masCode,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            client_id: TEST_CLIENT_ID,
            client_secret: TESTING_MAS_CLIENT_SECRET,
          })
          .expect(200);

        // Get userinfo - this is where the bug was occurring
        const userinfoResponse = await request(TESTING_APP_URL)
          .get('/api/oidc/userinfo')
          .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .expect(200);

        results.push({
          label: step.label,
          expected: step.user.slug,
          actual: userinfoResponse.body.preferred_username,
          email: userinfoResponse.body.email,
        });

        // Verify correct user data
        expect(userinfoResponse.body.preferred_username).toBe(
          `${step.user.slug}_${TESTING_TENANT_ID}`.toLowerCase(),
        );
        expect(userinfoResponse.body.email).toBe(step.email);

        console.log(
          `✅ Step ${step.label}: Expected ${step.user.slug}, got ${userinfoResponse.body.preferred_username}`,
        );
      }

      // Verify no crossover occurred
      const userASteps = results.filter((r) => r.label.startsWith('A'));
      const userBSteps = results.filter((r) => r.label.startsWith('B'));

      userASteps.forEach((step) => {
        expect(step.actual).toBe(
          `${testUserA.slug}_${TESTING_TENANT_ID}`.toLowerCase(),
        );
        expect(step.email).toBe(testUserAEmail);
      });

      userBSteps.forEach((step) => {
        expect(step.actual).toBe(
          `${testUserB.slug}_${TESTING_TENANT_ID}`.toLowerCase(),
        );
        expect(step.email).toBe(testUserBEmail);
      });

      console.log(
        '✅ Rapid user switching maintained correct session isolation',
      );
      console.table(results);
    });
  });

  describe('MAS Session State Verification', () => {
    it('should create separate MAS sessions for different users', async () => {
      // This test helps verify that the underlying MAS session management
      // is working correctly by checking that different users have different sessions

      const userAAuthCode = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUserAToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const userBAuthCode = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUserBToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Auth codes should be different for different users
      expect(userAAuthCode.body.authCode).not.toBe(userBAuthCode.body.authCode);

      // Complete parallel auth flows
      const [userAAuth, userBAuth] = await Promise.all([
        request(TESTING_APP_URL)
          .get('/api/oidc/auth')
          .query({
            client_id: TEST_CLIENT_ID,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            response_type: 'code',
            scope: 'openid profile email',
            state: 'parallel_session_userA',
            auth_code: userAAuthCode.body.authCode,
            tenantId: TESTING_TENANT_ID,
          })
          .set('x-tenant-id', TESTING_TENANT_ID),
        request(TESTING_APP_URL)
          .get('/api/oidc/auth')
          .query({
            client_id: TEST_CLIENT_ID,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            response_type: 'code',
            scope: 'openid profile email',
            state: 'parallel_session_userB',
            auth_code: userBAuthCode.body.authCode,
            tenantId: TESTING_TENANT_ID,
          })
          .set('x-tenant-id', TESTING_TENANT_ID),
      ]);

      // Should get different authorization codes from MAS
      const userAMasCode = new URL(userAAuth.headers.location).searchParams.get(
        'code',
      );
      const userBMasCode = new URL(userBAuth.headers.location).searchParams.get(
        'code',
      );

      expect(userAMasCode).not.toBe(userBMasCode);
      expect(userAMasCode).toBeTruthy();
      expect(userBMasCode).toBeTruthy();

      console.log('✅ MAS created separate sessions for different users');
    });
  });
});
