import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';
import * as jwt from 'jsonwebtoken';

describe('OIDC Matrix State Preservation (E2E)', () => {
  const testTenantId = TESTING_TENANT_ID;
  const matrixState = 'woRNVZWvJAa8v11ZIbPjWpa2iN3mEy'; // Real Matrix session state
  let token: string;

  beforeAll(async () => {
    try {
      // Login as the main test user to get auth token
      token = await loginAsTester();
      console.log('🔐 Matrix state preservation test setup complete');
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
      throw error;
    }
  }, 30000);

  describe('Matrix OIDC Authorization Flow', () => {
    it('should preserve Matrix state through complete OIDC authorization flow', async () => {
      // Step 1: Generate an auth code for Matrix OIDC flow
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      expect(authCode).toBeDefined();

      // Step 2: Matrix initiates OIDC flow with state parameter
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matrixState,
        nonce: 'wPO1q3JlqmsYxeIK3fansuzHAeC7q9yB',
        auth_code: authCode, // Use the generated auth code
      };

      // Make request to authorization endpoint
      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query(authParams)
        .set('x-tenant-id', testTenantId)
        .expect(302); // Should redirect to Matrix callback

      // Verify redirect URL contains preserved state
      const redirectLocation = authResponse.headers.location;
      expect(redirectLocation).toBeDefined();
      expect(redirectLocation).toContain(`state=${matrixState}`);

      // Extract authorization code from redirect URL
      const redirectUrl = new URL(redirectLocation);
      const finalAuthCode = redirectUrl.searchParams.get('code')!;
      const returnedState = redirectUrl.searchParams.get('state');

      expect(finalAuthCode).toBeDefined();
      expect(returnedState).toBe(matrixState);

      // Step 3: Verify the authorization code JWT contains preserved Matrix state
      const decodedAuthCode = jwt.decode(finalAuthCode!, { complete: true });
      expect(decodedAuthCode).toBeTruthy();

      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBe(matrixState);
      expect(payload.matrix_original_state).toBe(matrixState);
      expect(payload.type).toBe('auth_code');
      expect(payload.client_id).toBe('matrix_synapse');
      expect(payload.tenantId).toBe(testTenantId);

      // Step 4: Exchange authorization code for tokens (Matrix callback simulation)
      const tokenParams = {
        grant_type: 'authorization_code',
        code: finalAuthCode,
        redirect_uri: authParams.redirect_uri,
        client_id: 'matrix_synapse',
        client_secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
      };

      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .send(tokenParams)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      // Verify tokens are generated successfully
      expect(tokenResponse.body.access_token).toBeDefined();
      expect(tokenResponse.body.id_token).toBeDefined();
      expect(tokenResponse.body.token_type).toBe('Bearer');
      expect(tokenResponse.body.expires_in).toBe(3600);

      // Step 5: Verify user info can be retrieved with access token
      const userInfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      expect(userInfoResponse.body.sub).toBeDefined();
      expect(userInfoResponse.body.tenant_id).toBe(testTenantId);
    });

    it('should handle OIDC flow with no Matrix state parameter', async () => {
      // Generate auth code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;

      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        nonce: 'test-nonce-no-state',
        auth_code: authCode,
        // No state parameter
      };

      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query(authParams)
        .set('x-tenant-id', testTenantId)
        .expect(302);

      const redirectLocation = authResponse.headers.location;
      const redirectUrl = new URL(redirectLocation);
      const finalAuthCode = redirectUrl.searchParams.get('code')!;

      // Should not have state parameter in redirect
      expect(redirectUrl.searchParams.has('state')).toBe(false);

      // Verify JWT doesn't have state
      const decodedAuthCode = jwt.decode(finalAuthCode!, { complete: true });
      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBeUndefined();
      expect(payload.matrix_original_state).toBeUndefined();

      // Should still be able to exchange for tokens
      const tokenParams = {
        grant_type: 'authorization_code',
        code: finalAuthCode,
        redirect_uri: authParams.redirect_uri,
        client_id: 'matrix_synapse',
        client_secret:
          process.env.MATRIX_OIDC_CLIENT_SECRET || 'change-me-in-production',
      };

      await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .send(tokenParams)
        .set('x-tenant-id', testTenantId)
        .expect(200);
    });

    it('should preserve Matrix state with special characters', async () => {
      // Generate auth code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      const specialMatrixState = 'ABC123-_=+/special%20state&chars';

      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: specialMatrixState,
        nonce: 'test-nonce',
        auth_code: authCode,
      };

      const authResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query(authParams)
        .set('x-tenant-id', testTenantId)
        .expect(302);

      const redirectLocation = authResponse.headers.location;
      const redirectUrl = new URL(redirectLocation);
      const returnedState = redirectUrl.searchParams.get('state');
      const finalAuthCode = redirectUrl.searchParams.get('code')!;

      // Verify special characters in state are preserved
      expect(returnedState).toBe(specialMatrixState);

      // Verify JWT contains the special state
      const decodedAuthCode = jwt.decode(finalAuthCode!, { complete: true });
      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBe(specialMatrixState);
      expect(payload.matrix_original_state).toBe(specialMatrixState);
    });
  });

  describe('Matrix OIDC Error Scenarios', () => {
    it('should reject invalid client_id to prevent Matrix session hijacking', async () => {
      // Generate auth code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;

      const authParams = {
        client_id: 'evil_client', // Invalid client
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matrixState,
        auth_code: authCode,
      };

      await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query(authParams)
        .set('x-tenant-id', testTenantId)
        .expect(401); // Should reject invalid client
    });
  });
});
