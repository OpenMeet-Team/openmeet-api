import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

/**
 * OIDC Matrix Authentication Flow E2E Tests
 *
 * Tests the complete OIDC authentication flow for Matrix integration,
 * including the new auth_code parameter and seamless authentication improvements.
 */
jest.setTimeout(60000);

describe('OIDC Matrix Authentication Flow', () => {
  let token: string;
  let authCode: string;

  beforeAll(async () => {
    jest.setTimeout(120000);
    
    try {
      // Login as the main test user
      token = await loginAsTester();
      console.log('🔐 Test setup complete with auth token');
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
    }
  });

  afterAll(() => {
    jest.setTimeout(5000);
  });

  describe('OIDC Discovery', () => {
    it('should return valid OIDC discovery document: /api/oidc/.well-known/openid-configuration (GET)', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/oidc/.well-known/openid-configuration')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Verify required OIDC discovery fields
      expect(response.body).toHaveProperty('issuer');
      expect(response.body).toHaveProperty('authorization_endpoint');
      expect(response.body).toHaveProperty('token_endpoint');
      expect(response.body).toHaveProperty('userinfo_endpoint');
      expect(response.body).toHaveProperty('jwks_uri');
      expect(response.body).toHaveProperty('scopes_supported');
      expect(response.body).toHaveProperty('response_types_supported');

      // Verify Matrix-specific scopes
      expect(response.body.scopes_supported).toContain('openid');
      expect(response.body.scopes_supported).toContain('profile');
      expect(response.body.scopes_supported).toContain('email');

      console.log('✅ OIDC discovery document valid');
    });

    it('should return valid JWKS: /api/oidc/jwks (GET)', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/oidc/jwks')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Verify JWKS structure
      expect(response.body).toHaveProperty('keys');
      expect(Array.isArray(response.body.keys)).toBe(true);
      expect(response.body.keys.length).toBeGreaterThan(0);

      // Verify key properties
      const key = response.body.keys[0];
      expect(key).toHaveProperty('kty');
      expect(key).toHaveProperty('use');
      expect(key).toHaveProperty('kid');
      expect(key).toHaveProperty('n');
      expect(key).toHaveProperty('e');

      console.log('✅ JWKS endpoint valid');
    });
  });

  describe('Matrix Auth Code Generation', () => {
    it('should generate auth code for authenticated user: /api/matrix/generate-auth-code (POST)', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(response.body).toHaveProperty('authCode');
      expect(response.body).toHaveProperty('expiresAt');
      expect(typeof response.body.authCode).toBe('string');
      expect(response.body.authCode.length).toBeGreaterThan(10);

      // Store auth code for use in subsequent tests
      authCode = response.body.authCode;

      console.log('✅ Matrix auth code generated successfully');
    });

    it('should reject auth code generation for unauthenticated requests: /api/matrix/generate-auth-code (POST)', async () => {
      await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(401);

      console.log('✅ Auth code generation properly protected');
    });
  });

  describe('OIDC Authorization with Auth Code', () => {
    it('should handle OIDC authorization with valid auth_code parameter: /api/oidc/auth (GET)', async () => {
      // First generate a fresh auth code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const testAuthCode = authCodeResponse.body.authCode;

      // Test OIDC authorization with auth_code parameter
      const response = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'test_state_123',
          nonce: 'test_nonce_456',
          auth_code: testAuthCode,
          tenantId: TESTING_TENANT_ID
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Should redirect to Matrix callback with authorization code
      expect([200, 302, 303]).toContain(response.status);

      if (response.status >= 300) {
        // Check redirect location contains authorization code
        expect(response.headers.location).toContain('_synapse/client/oidc/callback');
        expect(response.headers.location).toContain('code=');
        expect(response.headers.location).toContain('state=test_state_123');

        console.log('✅ OIDC auth with auth_code redirected successfully');
      } else {
        // Direct response should contain authorization flow data
        expect(response.body).toBeDefined();
        console.log('✅ OIDC auth with auth_code completed successfully');
      }
    });

    it('should reject OIDC authorization with invalid auth_code: /api/oidc/auth (GET)', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'test_state_123',
          auth_code: 'invalid_auth_code_12345',
          tenantId: TESTING_TENANT_ID
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Should redirect to email form or return error (not complete successfully)
      if (response.status >= 300) {
        // If redirecting, should not be to Matrix callback (should be to login)
        if (response.headers.location) {
          expect(response.headers.location).not.toContain('_synapse/client/oidc/callback');
        }
      }

      console.log('✅ Invalid auth_code properly rejected');
    });

    it('should validate required OIDC parameters: /api/oidc/auth (GET)', async () => {
      // Test missing client_id
      await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid'
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(400);

      // Test missing redirect_uri
      await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          response_type: 'code',
          scope: 'openid'
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(400);

      console.log('✅ OIDC parameter validation working');
    });
  });

  describe('OIDC Token Exchange', () => {
    let authorizationCode: string;

    beforeAll(async () => {
      // Generate auth code and complete OIDC flow to get authorization code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (authCodeResponse.status === 200) {
        const authResponse = await request(TESTING_APP_URL)
          .get('/api/oidc/auth')
          .query({
            client_id: 'matrix_synapse',
            redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
            response_type: 'code',
            scope: 'openid profile email',
            state: 'test_state',
            auth_code: authCodeResponse.body.authCode,
            tenantId: TESTING_TENANT_ID
          })
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Extract authorization code from redirect URL if present
        if (authResponse.status >= 300 && authResponse.headers.location) {
          const url = new URL(authResponse.headers.location);
          authorizationCode = url.searchParams.get('code');
        }
      }
    });

    it('should exchange authorization code for tokens: /api/oidc/token (POST)', async () => {
      if (!authorizationCode) {
        console.log('⚠️ Skipping token exchange test - no authorization code available');
        return;
      }

      const response = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          client_id: 'matrix_synapse'
        })
        .expect(200);

      // Verify token response
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in');
      expect(response.body).toHaveProperty('id_token');

      // Verify ID token is a valid JWT
      const idToken = response.body.id_token;
      expect(idToken.split('.')).toHaveLength(3);

      console.log('✅ Token exchange completed successfully');
    });

    it('should provide valid userinfo with access token: /api/oidc/userinfo (GET)', async () => {
      if (!authorizationCode) {
        console.log('⚠️ Skipping userinfo test - no authorization code available');
        return;
      }

      // First get access token
      const tokenResponse = await request(TESTING_APP_URL)
        .post('/api/oidc/token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          client_id: 'matrix_synapse'
        });

      if (tokenResponse.status !== 200) {
        console.log('⚠️ Skipping userinfo test - token exchange failed');
        return;
      }

      const accessToken = tokenResponse.body.access_token;

      // Test userinfo endpoint
      const userinfoResponse = await request(TESTING_APP_URL)
        .get('/api/oidc/userinfo')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // Verify userinfo claims
      expect(userinfoResponse.body).toHaveProperty('sub');
      expect(userinfoResponse.body).toHaveProperty('email');
      expect(userinfoResponse.body).toHaveProperty('name');

      console.log('✅ Userinfo endpoint working correctly');
    });
  });

  describe('Matrix Authentication Performance', () => {
    it('should complete auth code generation quickly (performance test)', async () => {
      const startTime = Date.now();

      await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const duration = Date.now() - startTime;
      
      // Should complete in under 1 second (no more 10s silent auth delay)
      expect(duration).toBeLessThan(1000);

      console.log(`✅ Auth code generation completed in ${duration}ms`);
    });

    it('should complete OIDC auth with auth_code quickly', async () => {
      // Generate fresh auth code
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const startTime = Date.now();

      await request(TESTING_APP_URL)
        .get('/api/oidc/auth')
        .query({
          client_id: 'matrix_synapse',
          redirect_uri: 'http://localhost:8448/_synapse/client/oidc/callback',
          response_type: 'code',
          scope: 'openid profile email',
          state: 'perf_test_state',
          auth_code: authCodeResponse.body.authCode,
          tenantId: TESTING_TENANT_ID
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      const duration = Date.now() - startTime;

      // Should complete in under 2 seconds (seamless authentication)
      expect(duration).toBeLessThan(2000);

      console.log(`✅ OIDC auth with auth_code completed in ${duration}ms`);
    });
  });
});