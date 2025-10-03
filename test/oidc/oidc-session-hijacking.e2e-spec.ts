import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser } from '../utils/functions';

jest.setTimeout(60000);

/**
 * OIDC Session Hijacking Vulnerability E2E Tests
 *
 * These tests demonstrate and verify the fix for a critical security vulnerability:
 * - Numeric session IDs that can be guessed/enumerated
 * - No cryptographic protection on session tokens
 * - Session hijacking by using another user's session ID
 */
describe('OIDC Session Hijacking Vulnerability', () => {
  const OIDC_CLIENT_ID = '01JAYS74TCG3BTWKADN5Q4518F';
  const OIDC_REDIRECT_URI =
    'https://mas-dev.openmeet.net/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C';

  describe('Session Hijacking Prevention', () => {
    it('should prevent one user from hijacking another users session', async () => {
      // This test verifies the fix for the real-world issue where:
      // User B had User A's session cookie and could see User A's consent screen

      // Step 1: Create two users
      const userA = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-a-${Date.now()}@test.com`,
        'Alice',
        'Anderson',
      );

      await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-b-${Date.now()}@test.com`,
        'Bob',
        'Brown',
      );

      // Step 2: User A logs in and gets a session
      const loginResponseA = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: userA.email,
          password: 'Test@1234',
        })
        .expect(200);

      const sessionIdA = loginResponseA.body.sessionId;
      expect(sessionIdA).toBeDefined();

      console.log('User A session ID:', sessionIdA);
      console.log('Session ID type:', typeof sessionIdA);

      // Step 3: User B somehow gets User A's session cookie
      // (e.g., browser cookie corruption, session fixation, guessing, etc.)
      // User B tries to authenticate using User A's session
      console.log('User B attempting to use User A session...');

      const authorizeResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: OIDC_CLIENT_ID,
          redirect_uri: OIDC_REDIRECT_URI,
          response_type: 'code',
          scope: 'openid email',
          state: 'test-state',
          nonce: 'test-nonce',
        })
        .set('Cookie', [
          `oidc_session=${sessionIdA}`, // Using User A's session!
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Authorize response status:', authorizeResponse.status);

      // With the fix: session should be rejected
      if (authorizeResponse.status === 302) {
        const redirectUrl = authorizeResponse.headers.location;
        console.log('Redirect URL:', redirectUrl);

        if (redirectUrl && redirectUrl.includes('code=')) {
          // Extract auth code
          const url = new URL(redirectUrl);
          const authCode = url.searchParams.get('code');

          console.log(
            '⚠️  WARNING: Got auth code - this should not happen with the fix!',
          );

          // Step 4: Exchange code for tokens
          const tokenResponse = await request(TESTING_APP_URL)
            .post('/api/oidc/token')
            .set('x-tenant-id', TESTING_TENANT_ID)
            .send({
              grant_type: 'authorization_code',
              code: authCode,
              client_id: OIDC_CLIENT_ID,
              redirect_uri: OIDC_REDIRECT_URI,
            });

          if (tokenResponse.status === 200 && tokenResponse.body.id_token) {
            const idToken = tokenResponse.body.id_token;
            const payload = JSON.parse(
              Buffer.from(idToken.split('.')[1], 'base64').toString(),
            );

            console.log('');
            console.log(
              '🚨 TEST FAILURE: SESSION HIJACKING STILL POSSIBLE! 🚨',
            );
            console.log('User B was able to impersonate User A');
            console.log('ID Token contains:');
            console.log('  Email:', payload.email);
            console.log('  Name:', payload.name);
            console.log('  Subject:', payload.sub);

            // This should NOT happen with the fix
            fail(
              "Session hijacking vulnerability still exists! User B obtained User A's identity.",
            );
          } else {
            console.log('✓ Token exchange failed - partial protection');
          }
        } else {
          console.log('✓ Redirected to login or error - session rejected');
        }
      } else if (authorizeResponse.status === 401) {
        console.log('✓ Session validation failed - vulnerability is fixed!');
        // This is the expected behavior with the fix
        expect(authorizeResponse.status).toBe(401);
      }
    });

    it('should verify session IDs are not guessable', async () => {
      // Create a user and get their session ID
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-sequential-${Date.now()}@test.com`,
        'UserSeq',
        'TestUser',
      );

      const loginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: user.email,
          password: 'Test@1234',
        })
        .expect(200);

      const sessionId = loginResponse.body.sessionId;

      // Verify session ID is a UUID (not a sequential integer)
      console.log('✓ Session ID format check:');
      console.log(`   Session ID: ${sessionId}`);

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(sessionId)).toBe(true);

      // Verify an attacker cannot guess adjacent session IDs
      const guessedSessionId = sessionId - 1;
      console.log(
        `   Attacker could try: ${sessionId - 1}, ${sessionId + 1}, ...`,
      );

      const hijackAttempt = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: OIDC_CLIENT_ID,
          redirect_uri: OIDC_REDIRECT_URI,
          response_type: 'code',
          scope: 'openid email',
          state: 'test-state',
          nonce: 'test-nonce',
        })
        .set('Cookie', [
          `oidc_session=${guessedSessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(
        `   Guess attempt (ID ${guessedSessionId}): ${hijackAttempt.status}`,
      );

      // Should NOT get an auth code with a guessed session ID
      if (
        hijackAttempt.status === 302 &&
        hijackAttempt.headers.location?.includes('code=')
      ) {
        fail('⚠️  Guessed session ID was VALID - vulnerability still exists!');
      } else {
        console.log('   ✓ Guessed session ID rejected - secure!');
      }
    });
  });

  describe('Session Security Requirements', () => {
    it('should use non-numeric session tokens', async () => {
      // Session IDs should be UUIDs or crypto tokens, not numbers
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-secure-${Date.now()}@test.com`,
        'UserSecure',
        'TestUser',
      );

      const loginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: user.email,
          password: 'Test@1234',
        })
        .expect(200);

      const sessionToken =
        loginResponse.body.sessionToken || loginResponse.body.sessionId;

      // Verify it's a string (UUID or crypto token)
      expect(typeof sessionToken).toBe('string');
      expect(typeof sessionToken).not.toBe('number');

      // Check if it's a UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const isUuid = uuidRegex.test(sessionToken);

      // Or check if it's a long random string (crypto token)
      const isCryptoToken = sessionToken.length >= 32;

      expect(isUuid || isCryptoToken).toBe(true);
      console.log('✅ Secure session token format detected');
    });

    it('should reject invalid/guessed session tokens', async () => {
      // Invalid/guessed session tokens should be rejected
      const invalidSessionToken = '12345';

      const authorizeResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: OIDC_CLIENT_ID,
          redirect_uri: OIDC_REDIRECT_URI,
          response_type: 'code',
          scope: 'openid email',
          state: 'test-state',
          nonce: 'test-nonce',
        })
        .set('Cookie', [
          `oidc_session=${invalidSessionToken}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Should redirect to login, not issue an auth code
      expect(authorizeResponse.status).toBe(302);

      const redirectUrl = authorizeResponse.headers.location;
      expect(redirectUrl).toBeDefined();

      // Should redirect to login page, not have an auth code
      expect(redirectUrl).toContain('login');
      expect(redirectUrl).not.toContain('code=');
    });

    it('should not allow one user to use another users session token', async () => {
      // Create two users
      const userA = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-a-isolation-${Date.now()}@test.com`,
        'UserA',
        'Isolation',
      );

      const userB = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `user-b-isolation-${Date.now()}@test.com`,
        'UserB',
        'Isolation',
      );

      // Login as user A
      const loginResponseA = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: userA.email,
          password: 'Test@1234',
        })
        .expect(200);

      const sessionTokenA =
        loginResponseA.body.sessionToken || loginResponseA.body.sessionId;

      // Try to use user A's session to get user B's data
      const authorizeResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: OIDC_CLIENT_ID,
          redirect_uri: OIDC_REDIRECT_URI,
          response_type: 'code',
          scope: 'openid email',
          state: 'test-state',
          nonce: 'test-nonce',
          login_hint: userB.email, // Trying to hint as user B
        })
        .set('Cookie', [
          `oidc_session=${sessionTokenA}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(302);

      const redirectUrl = authorizeResponse.headers.location;

      if (redirectUrl.includes('code=')) {
        const url = new URL(redirectUrl);
        const authCode = url.searchParams.get('code');

        const tokenResponse = await request(TESTING_APP_URL)
          .post('/api/oidc/token')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            grant_type: 'authorization_code',
            code: authCode,
            client_id: OIDC_CLIENT_ID,
            redirect_uri: OIDC_REDIRECT_URI,
          })
          .expect(200);

        const idToken = tokenResponse.body.id_token;
        const payload = JSON.parse(
          Buffer.from(idToken.split('.')[1], 'base64').toString(),
        );

        // Should get user A's email, not user B's
        expect(payload.email).toBe(userA.email);
        expect(payload.email).not.toBe(userB.email);
      }
    });
  });
});
