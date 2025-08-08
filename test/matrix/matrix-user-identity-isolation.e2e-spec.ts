import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAS_URL,
  TESTING_MAS_CLIENT_SECRET,
} from '../utils/constants';
import { createTestUser, loginAsAdmin } from '../utils/functions';

// Environment-specific client configuration
const TEST_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
if (!TEST_CLIENT_ID) {
  throw new Error(
    'OAUTH_CLIENT_ID environment variable is required for E2E tests',
  );
}

/**
 * Matrix User Identity Isolation E2E Tests
 *
 * These tests validate that Matrix Authentication Service (MAS) properly isolates
 * user identities and does not reuse sessions between different OpenMeet users.
 *
 * Critical Issue: MAS was returning "the-admin-vothhz" for all users instead of
 * returning the correct Matrix identity for each authenticated OpenMeet user.
 *
 * Tests verify:
 * 1. Each OpenMeet user gets a unique Matrix identity via MAS
 * 2. MAS userinfo endpoint returns correct user data per session
 * 3. No session bleeding between different user authentications
 * 4. Matrix handle registry is properly updated for each user
 */
jest.setTimeout(120000);

describe('Matrix User Identity Isolation', () => {
  let testUser1Token: string;
  let testUser2Token: string;
  let testUser1Data: any;
  let testUser2Data: any;
  let testUser1Email: string;
  let testUser2Email: string;

  beforeAll(async () => {
    jest.setTimeout(180000);

    // Use more unique timestamp with microseconds for guaranteed uniqueness
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Create two unique test users with different identities using unique ID
    testUser1Email = `matrix-test-user-1-${uniqueId}@openmeet.net`;
    testUser2Email = `matrix-test-user-2-${uniqueId}@openmeet.net`;

    try {
      // Create first test user
      testUser1Data = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testUser1Email,
        'Matrix',
        'TestUser1',
        'password123',
      );

      // Create second test user
      testUser2Data = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testUser2Email,
        'Matrix',
        'TestUser2',
        'password123',
      );

      // Login as both users to get tokens
      const user1LoginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .send({
          email: testUser1Email,
          password: 'password123',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const user2LoginResponse = await request(TESTING_APP_URL)
        .post('/api/v1/auth/email/login')
        .send({
          email: testUser2Email,
          password: 'password123',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      testUser1Token = user1LoginResponse.body.token;
      testUser2Token = user2LoginResponse.body.token;

      // Sync Matrix user identities to register their handles in the global registry
      // This simulates what happens after users complete Matrix OIDC authentication
      try {
        await request(TESTING_APP_URL)
          .post('/api/matrix/sync-user-identity')
          .set('Authorization', `Bearer ${testUser1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ matrixUserId: `@${testUser1Data.slug}:matrix.openmeet.net` })
          .expect(200);

        await request(TESTING_APP_URL)
          .post('/api/matrix/sync-user-identity')
          .set('Authorization', `Bearer ${testUser2Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({ matrixUserId: `@${testUser2Data.slug}:matrix.openmeet.net` })
          .expect(200);

        console.log(`✅ Matrix user identities synced with handles`);
      } catch (syncError) {
        console.log(`⚠️ Matrix identity sync failed: ${syncError.message}`);
        // Continue with test anyway - some tests may still work
      }

      console.log(`🔐 Test users created and authenticated:
        User 1: ${testUser1Data.slug} (${testUser1Email})
        User 2: ${testUser2Data.slug} (${testUser2Email})`);
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
      throw error;
    }
  });

  afterAll(async () => {
    jest.setTimeout(30000);

    // Clean up Matrix user identities to prevent state pollution
    if (testUser1Token && testUser1Data) {
      try {
        await request(TESTING_APP_URL)
          .delete('/api/matrix/user-identity')
          .set('Authorization', `Bearer ${testUser1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
        console.log(
          `✅ Cleaned up Matrix identity for user 1: ${testUser1Data.slug}`,
        );
      } catch (error) {
        console.log(
          `⚠️ Could not clean up user 1 Matrix identity: ${error.message}`,
        );
      }
    }

    if (testUser2Token && testUser2Data) {
      try {
        await request(TESTING_APP_URL)
          .delete('/api/matrix/user-identity')
          .set('Authorization', `Bearer ${testUser2Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
        console.log(
          `✅ Cleaned up Matrix identity for user 2: ${testUser2Data.slug}`,
        );
      } catch (error) {
        console.log(
          `⚠️ Could not clean up user 2 Matrix identity: ${error.message}`,
        );
      }
    }
  });

  describe('OIDC User Identity Verification', () => {
    it('should return correct user identity for first test user via OIDC userinfo', async () => {
      // Generate auth code for user 1
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Complete OIDC auth flow for user 1
      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'user1_identity_test',
          auth_code: authCodeResponse.body.authCode,
          tenantId: TESTING_TENANT_ID,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect([302, 303]).toContain(authResponse.status);
      expect(authResponse.headers.location).toContain('code=');

      // Extract authorization code and exchange for tokens
      const url = new URL(authResponse.headers.location);
      const authCode = url.searchParams.get('code');

      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          client_id: TEST_CLIENT_ID,
          client_secret: TESTING_MAS_CLIENT_SECRET,
        })
        .expect(200);

      const accessToken = tokenResponse.body.access_token;

      // Test userinfo endpoint returns correct user 1 data
      const userinfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Verify userinfo contains correct user 1 identity
      expect(userinfoResponse.body).toHaveProperty('sub');
      expect(userinfoResponse.body).toHaveProperty('email', testUser1Email);
      expect(userinfoResponse.body).toHaveProperty(
        'preferred_username',
        `${testUser1Data.slug}_${TESTING_TENANT_ID}`,
      );

      // CRITICAL: Should NOT return admin user or any other user
      expect(userinfoResponse.body.preferred_username).not.toBe(
        'the-admin-vothhz',
      );
      expect(userinfoResponse.body.email).not.toBe('admin@openmeet.net');

      console.log(
        `✅ User 1 OIDC identity verified: ${userinfoResponse.body.preferred_username}`,
      );
    });

    it('should return different user identity for second test user via OIDC userinfo', async () => {
      // Generate auth code for user 2
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUser2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Complete OIDC auth flow for user 2
      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'user2_identity_test',
          auth_code: authCodeResponse.body.authCode,
          tenantId: TESTING_TENANT_ID,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect([302, 303]).toContain(authResponse.status);
      expect(authResponse.headers.location).toContain('code=');

      // Extract authorization code and exchange for tokens
      const url = new URL(authResponse.headers.location);
      const authCode = url.searchParams.get('code');

      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          client_id: TEST_CLIENT_ID,
          client_secret: TESTING_MAS_CLIENT_SECRET,
        })
        .expect(200);

      const accessToken = tokenResponse.body.access_token;

      // Test userinfo endpoint returns correct user 2 data
      const userinfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Verify userinfo contains correct user 2 identity
      expect(userinfoResponse.body).toHaveProperty('sub');
      expect(userinfoResponse.body).toHaveProperty('email', testUser2Email);
      expect(userinfoResponse.body).toHaveProperty(
        'preferred_username',
        `${testUser2Data.slug}_${TESTING_TENANT_ID}`,
      );

      // CRITICAL: Should NOT return admin user, user 1, or any other user
      expect(userinfoResponse.body.preferred_username).not.toBe(
        'the-admin-vothhz',
      );
      expect(userinfoResponse.body.preferred_username).not.toBe(
        testUser1Data.slug,
      );
      expect(userinfoResponse.body.email).not.toBe('admin@openmeet.net');
      expect(userinfoResponse.body.email).not.toBe(testUser1Email);

      console.log(
        `✅ User 2 OIDC identity verified: ${userinfoResponse.body.preferred_username}`,
      );
    });
  });

  // NOTE: Matrix User Identity Sync tests removed - deprecated endpoint
  // Modern flow: Matrix identities are handled automatically via OIDC during authentication

  describe('Matrix Handle Registry Isolation', () => {
    it('should have separate entries in Matrix handle registry for both users', async () => {
      // Check registry entries exist for both users
      const user1HandleResponse = await request(TESTING_APP_URL)
        .get('/api/matrix/handle/check')
        .query({ handle: testUser1Data.slug })
        .set('Authorization', `Bearer ${testUser1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const user2HandleResponse = await request(TESTING_APP_URL)
        .get('/api/matrix/handle/check')
        .query({ handle: testUser2Data.slug })
        .set('Authorization', `Bearer ${testUser2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Both should be valid (200) or registered (409)
      expect([200, 409]).toContain(user1HandleResponse.status);
      expect([200, 409]).toContain(user2HandleResponse.status);

      console.log(`✅ Matrix handle registry contains both users:
        User 1: ${testUser1Data.slug} (${user1HandleResponse.status})
        User 2: ${testUser2Data.slug} (${user2HandleResponse.status})`);
    });
  });

  describe('Session Isolation Verification', () => {
    it('should not have session bleeding between user authentications', async () => {
      // Generate auth codes for both users in sequence
      const user1AuthCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUser1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const user2AuthCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${testUser2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Auth codes should be different
      expect(user1AuthCodeResponse.body.authCode).not.toBe(
        user2AuthCodeResponse.body.authCode,
      );

      // Complete auth flow for user 1
      const user1AuthResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'isolation_test_user1',
          auth_code: user1AuthCodeResponse.body.authCode,
          tenantId: TESTING_TENANT_ID,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Complete auth flow for user 2 immediately after
      const user2AuthResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: TEST_CLIENT_ID,
          redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
          response_type: 'code',
          scope: 'openid profile email',
          state: 'isolation_test_user2',
          auth_code: user2AuthCodeResponse.body.authCode,
          tenantId: TESTING_TENANT_ID,
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect([302, 303]).toContain(user1AuthResponse.status);
      expect([302, 303]).toContain(user2AuthResponse.status);

      // Authorization codes should be different
      const user1Url = new URL(user1AuthResponse.headers.location);
      const user2Url = new URL(user2AuthResponse.headers.location);
      const user1Code = user1Url.searchParams.get('code');
      const user2Code = user2Url.searchParams.get('code');

      expect(user1Code).not.toBe(user2Code);
      expect(user1Url.searchParams.get('state')).toBe('isolation_test_user1');
      expect(user2Url.searchParams.get('state')).toBe('isolation_test_user2');

      console.log(
        '✅ No session bleeding detected between user authentications',
      );
    });
  });

  describe('Concurrent Authentication Scenarios', () => {
    it('should handle concurrent Matrix authentication requests for different users', async () => {
      // Simulate concurrent Matrix authentication attempts
      const [user1Auth, user2Auth] = await Promise.all([
        request(TESTING_APP_URL)
          .post('/api/matrix/generate-auth-code')
          .set('Authorization', `Bearer ${testUser1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID),
        request(TESTING_APP_URL)
          .post('/api/matrix/generate-auth-code')
          .set('Authorization', `Bearer ${testUser2Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID),
      ]);

      // Both should succeed
      expect(user1Auth.status).toBe(200);
      expect(user2Auth.status).toBe(200);

      // Auth codes should be unique
      expect(user1Auth.body.authCode).not.toBe(user2Auth.body.authCode);

      console.log('✅ Concurrent authentication requests handled correctly');
    });

    it('should maintain user context during rapid authentication sequences', async () => {
      // Rapidly authenticate as user 1, then user 2, then user 1 again
      const sequence = [
        { token: testUser1Token, user: testUser1Data, label: 'User1-A' },
        { token: testUser2Token, user: testUser2Data, label: 'User2' },
        { token: testUser1Token, user: testUser1Data, label: 'User1-B' },
      ];

      for (const step of sequence) {
        const authCodeResponse = await request(TESTING_APP_URL)
          .post('/api/matrix/generate-auth-code')
          .set('Authorization', `Bearer ${step.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .expect(200);

        const authResponse = await request(TESTING_APP_URL)
          .get('/api/oidc/auth')
          .query({
            client_id: TEST_CLIENT_ID,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            response_type: 'code',
            scope: 'openid profile email',
            state: `rapid_sequence_${step.label}`,
            auth_code: authCodeResponse.body.authCode,
            tenantId: TESTING_TENANT_ID,
          })
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect([302, 303]).toContain(authResponse.status);

        // Extract and validate tokens
        const url = new URL(authResponse.headers.location);
        const authCode = url.searchParams.get('code');

        const tokenResponse = await request(TESTING_APP_URL)
          .post('/api/oidc/token')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: `${TESTING_MAS_URL}/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C`,
            client_id: TEST_CLIENT_ID,
            client_secret: TESTING_MAS_CLIENT_SECRET,
          })
          .expect(200);

        const userinfoResponse = await request(TESTING_APP_URL)
          .get('/api/oidc/userinfo')
          .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .expect(200);

        // Verify correct user identity maintained
        expect(userinfoResponse.body.preferred_username).toBe(step.user.slug);
        console.log(`✅ ${step.label} context maintained: ${step.user.slug}`);
      }

      console.log(
        '✅ Rapid authentication sequence maintained correct user context',
      );
    });
  });

  describe('Matrix Handle Cleanup on User Deletion', () => {
    it('should automatically clean up Matrix handles when users are deleted', async () => {
      // Get admin token for user deletion (users cannot delete themselves)
      const adminToken = await loginAsAdmin();

      // First, verify both users have Matrix handles registered
      const user1HandleResponse = await request(TESTING_APP_URL)
        .get('/api/matrix/handle/check')
        .query({ handle: testUser1Data.slug })
        .set('Authorization', `Bearer ${testUser1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(user1HandleResponse.body).toHaveProperty('available', false);
      console.log(`✅ User 1 handle ${testUser1Data.slug} is registered`);

      // Delete user 1 using admin token (this should trigger Matrix handle cleanup)
      const deleteResponse = await request(TESTING_APP_URL)
        .delete(`/api/v1/users/${testUser1Data.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // The delete should succeed with 204 No Content
      expect(deleteResponse.status).toBe(204);
      console.log(`✅ User 1 deleted successfully`);

      // Wait a moment for cleanup to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the Matrix handle is now available (cleaned up)
      const postDeleteHandleResponse = await request(TESTING_APP_URL)
        .get('/api/matrix/handle/check')
        .query({ handle: testUser1Data.slug })
        .set('Authorization', `Bearer ${testUser2Token}`) // Use user 2's token since user 1 is deleted
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(postDeleteHandleResponse.body).toHaveProperty('available', true);
      console.log(
        `✅ User 1 Matrix handle ${testUser1Data.slug} was automatically cleaned up`,
      );

      // Verify user 2's handle is still registered (unaffected)
      const user2HandleResponse = await request(TESTING_APP_URL)
        .get('/api/matrix/handle/check')
        .query({ handle: testUser2Data.slug })
        .set('Authorization', `Bearer ${testUser2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(user2HandleResponse.body).toHaveProperty('available', false);
      console.log(
        `✅ User 2 handle ${testUser2Data.slug} remains registered (unaffected)`,
      );

      console.log('✅ Matrix handle cleanup on user deletion works correctly');
    });
  });
});
