import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser } from '../utils/functions';

jest.setTimeout(120000);

/**
 * OIDC Security Fixes E2E Tests
 *
 * Tests verify the following security improvements:
 * 1. Redirect URI validation on token endpoint
 * 2. Auth code expiry (60 seconds)
 * 3. Auth code reuse detection
 * 4. Client secret validation
 */
describe('OIDC Security Fixes', () => {
  const OIDC_CLIENT_ID = process.env.OAUTH_CLIENT_ID as string;
  const OIDC_REDIRECT_URI =
    'https://mas-dev.openmeet.net/upstream/callback/01JAYS74TCG3BTWKADN5Q4518C';
  const OIDC_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET as string;

  describe('Redirect URI Validation', () => {
    it('should reject token request with mismatched redirect_uri', async () => {
      // Create user and get session
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `redirect-test-${Date.now()}@test.com`,
        'Redirect',
        'Test',
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

      // Get authorization code with correct redirect_uri
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
          `oidc_session=${sessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (authorizeResponse.status !== 302) {
        throw new Error(
          `Failed to get authorization code. Status: ${authorizeResponse.status}`,
        );
      }

      const redirectUrl = authorizeResponse.headers.location;
      if (!redirectUrl || !redirectUrl.includes('code=')) {
        console.log('Redirect URL:', redirectUrl);
        throw new Error('No authorization code in redirect');
      }

      const url = new URL(redirectUrl);
      const authCode = url.searchParams.get('code');

      expect(authCode).toBeTruthy();

      // Try to exchange code with DIFFERENT redirect_uri
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: OIDC_CLIENT_SECRET,
          redirect_uri: 'https://evil.com/callback', // Different redirect_uri!
        });

      // Should reject with 401
      expect(tokenResponse.status).toBe(401);
      expect(tokenResponse.body.message).toContain('redirect_uri');
    });

    it('should accept token request with matching redirect_uri', async () => {
      // Create user and get session
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `redirect-valid-${Date.now()}@test.com`,
        'RedirectValid',
        'Test',
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

      // Get authorization code
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
          `oidc_session=${sessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      const redirectUrl = authorizeResponse.headers.location;
      const url = new URL(redirectUrl);
      const authCode = url.searchParams.get('code');

      // Exchange code with SAME redirect_uri
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: OIDC_CLIENT_SECRET,
          redirect_uri: OIDC_REDIRECT_URI, // Same redirect_uri
        });

      // Should succeed
      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body.access_token).toBeDefined();
    });
  });

  describe('Authorization Code Expiry', () => {
    it('should reject expired authorization code after 60 seconds', async () => {
      // Create user and get session
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `expiry-test-${Date.now()}@test.com`,
        'Expiry',
        'Test',
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

      // Get authorization code
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
          `oidc_session=${sessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      const redirectUrl = authorizeResponse.headers.location;
      const url = new URL(redirectUrl);
      const authCode = url.searchParams.get('code');

      console.log('⏳ Waiting 65 seconds for auth code to expire...');
      await new Promise((resolve) => setTimeout(resolve, 65000));

      // Try to use expired code
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: OIDC_CLIENT_SECRET,
          redirect_uri: OIDC_REDIRECT_URI,
        });

      // Should reject expired code
      expect(tokenResponse.status).toBe(401);
    }, 90000); // 90 second timeout for this test
  });

  describe('Authorization Code Reuse Detection', () => {
    it('should reject reused authorization code', async () => {
      // Create user and get session
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `reuse-test-${Date.now()}@test.com`,
        'Reuse',
        'Test',
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

      // Get authorization code
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
          `oidc_session=${sessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      const redirectUrl = authorizeResponse.headers.location;
      const url = new URL(redirectUrl);
      const authCode = url.searchParams.get('code');

      // Use code first time - should succeed
      const firstTokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: OIDC_CLIENT_SECRET,
          redirect_uri: OIDC_REDIRECT_URI,
        });

      expect(firstTokenResponse.status).toBe(200);
      expect(firstTokenResponse.body.access_token).toBeDefined();

      // Try to use same code again - should fail
      const secondTokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: OIDC_CLIENT_SECRET,
          redirect_uri: OIDC_REDIRECT_URI,
        });

      expect(secondTokenResponse.status).toBe(401);
      expect(secondTokenResponse.body.message).toContain('already been used');
    });
  });

  describe('Client Authentication', () => {
    it('should reject confidential client with invalid client_secret', async () => {
      // Create user and get session
      const user = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `client-invalid-${Date.now()}@test.com`,
        'ClientInvalid',
        'Test',
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

      // Get authorization code
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
          `oidc_session=${sessionId}`,
          `oidc_tenant=${TESTING_TENANT_ID}`,
        ])
        .set('x-tenant-id', TESTING_TENANT_ID);

      const redirectUrl = authorizeResponse.headers.location;
      const url = new URL(redirectUrl);
      const authCode = url.searchParams.get('code');

      // Try with wrong client_secret
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authCode,
          client_id: OIDC_CLIENT_ID,
          client_secret: 'wrong-secret',
          redirect_uri: OIDC_REDIRECT_URI,
        });

      // Should reject
      expect(tokenResponse.status).toBe(401);
      expect(tokenResponse.body.message).toContain(
        'Invalid client credentials',
      );
    });
  });
});
