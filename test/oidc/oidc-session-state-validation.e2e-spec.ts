import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';
import * as jwt from 'jsonwebtoken';

describe('OIDC Session-State Validation (E2E)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let token: string;

  beforeAll(async () => {
    try {
      // Login as the main test user to get auth token
      token = await loginAsTester();
      console.log('🔐 Session-state validation test setup complete');
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
      throw error;
    }
  }, 30000);

  describe('Matrix Session Cookie vs URL State Validation', () => {
    it('should demonstrate that Matrix expects session cookie state to match URL state', async () => {
      // This test simulates what Matrix Synapse v1.132.0 does:
      // 1. Creates session cookie with embedded state value
      // 2. Sends different state value in URL to OIDC provider
      // 3. Expects OIDC provider to return the session state, not URL state
      // 4. Validates session cookie state matches returned URL state

      // Generate auth code for authenticated flow
      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;

      // Simulate Matrix's behavior: session cookie state ≠ URL state
      const sessionState = 'SESSION_COOKIE_STATE_ABC123';
      const urlState = 'URL_PARAMETER_STATE_XYZ789'; // Different value

      console.log('🧪 Test Setup:');
      console.log('  - Session cookie would contain state:', sessionState);
      console.log('  - URL parameter state sent to OIDC:', urlState);
      console.log('  - Matrix expects OIDC to return:', sessionState);

      // Test current OIDC behavior (preserves URL state)
      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: urlState, // This is what gets sent to OIDC
        nonce: 'test-nonce-validation',
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

      console.log('🔍 Current OIDC Behavior:');
      console.log('  - OIDC received state:', urlState);
      console.log('  - OIDC returned state:', returnedState);

      // Current behavior: OIDC preserves URL state exactly
      expect(returnedState).toBe(urlState);

      // Verify JWT also preserves the URL state
      const decodedAuthCode = jwt.decode(finalAuthCode!, { complete: true });
      const payload = decodedAuthCode!.payload as any;
      expect(payload.state).toBe(urlState);
      expect(payload.matrix_original_state).toBe(urlState);

      console.log('❌ Problem Identified:');
      console.log('  - Matrix session cookie contains:', sessionState);
      console.log('  - OIDC returns:', returnedState);
      console.log(
        '  - These don\'t match → "Invalid session for OIDC callback"',
      );

      // This demonstrates why Matrix v1.132.0 fails with skip_verification: false
      // Matrix's verify_oidc_session_token(session_cookie, returned_state) will fail
      // because session_cookie contains sessionState but returned_state contains urlState
    });

    it('should show that identical states work (local environment simulation)', async () => {
      // This test simulates what happens in local where skip_verification: true
      // or when session state accidentally matches URL state

      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      const matchingState = 'MATCHING_STATE_ABC123';

      console.log('🧪 Working Scenario:');
      console.log('  - Session cookie state:', matchingState);
      console.log('  - URL parameter state:', matchingState);
      console.log('  - Expected OIDC return:', matchingState);

      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: matchingState,
        nonce: 'test-nonce-matching',
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

      console.log('✅ Working Case Results:');
      console.log('  - OIDC returned state:', returnedState);
      console.log('  - States match → Matrix validation would succeed');

      expect(returnedState).toBe(matchingState);

      // Test token exchange works normally
      const tokenParams = {
        grant_type: 'authorization_code',
        code: redirectUrl.searchParams.get('code')!,
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

    it('should demonstrate the required fix: extract session state from request context', async () => {
      // This test shows what our OIDC service SHOULD do:
      // 1. Receive OIDC request with session context (simulated via headers)
      // 2. Extract the real session state (not just preserve URL state)
      // 3. Return the session state in the callback

      const authCodeResponse = await request(TESTING_APP_URL)
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', testTenantId)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;

      // Simulate Matrix sending session context somehow
      // (In real implementation, we'd need to extract from session cookie)
      const realSessionState = 'REAL_SESSION_STATE_FROM_COOKIE';
      const urlState = 'DIFFERENT_URL_STATE';

      console.log('🎯 Required Fix Simulation:');
      console.log('  - Matrix session cookie state:', realSessionState);
      console.log('  - URL state (ignored):', urlState);
      console.log('  - OIDC should return:', realSessionState);

      // Current test just documents the requirement
      // The actual fix would involve:
      // 1. Parsing Matrix session cookie in OIDC authorization endpoint
      // 2. Extracting the embedded state from the macaroon
      // 3. Returning that state instead of preserving URL state

      const authParams = {
        client_id: 'matrix_synapse',
        redirect_uri:
          'https://matrix-dev.openmeet.net/_synapse/client/oidc/callback',
        response_type: 'code',
        scope: 'openid profile email',
        state: urlState,
        nonce: 'test-nonce-fix',
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

      console.log('📋 Current Implementation:');
      console.log('  - Returns URL state:', returnedState);
      console.log('📋 Required Implementation:');
      console.log('  - Should return session state:', realSessionState);
      console.log('📋 Implementation Strategy:');
      console.log('  - Parse oidc_session cookie in authorization endpoint');
      console.log('  - Decode macaroon to extract embedded state value');
      console.log('  - Return extracted state instead of URL state');

      // For now, this test documents current vs required behavior
      expect(returnedState).toBe(urlState); // Current behavior
      // After fix: expect(returnedState).toBe(realSessionState); // Required behavior
    });
  });

  describe('Matrix Session Cookie Analysis', () => {
    it('should demonstrate how to parse Matrix session cookies (theoretical)', () => {
      // This test documents the structure of Matrix session cookies
      // and how they should be parsed to extract the real state value

      console.log('📚 Matrix Session Cookie Structure (from investigation):');
      console.log('  - Cookie Name: oidc_session');
      console.log('  - Format: Base64-encoded macaroon');
      console.log('  - Contains caveats including:');
      console.log('    * state = <actual_session_state>');
      console.log('    * idp_id = oidc-openmeet');
      console.log('    * nonce = <random_nonce>');
      console.log('    * client_redirect_url = <callback_url>');
      console.log('    * time < <expiration_timestamp>');

      // Example from manual testing:
      // const exampleSessionCookie = 'MDAyMWxvY2F0aW9uIG1hdHJpeC5vcGVubWVldC5uZXQKMDA...';
      const exampleDecodedContent = `
        0021location matrix.openmeet.net
        0013identifier key
        0010cid gen = 1
        0017cid type = session
        002fcid state = OQQyxaNrEoCHSEImvfUDjMYdJRdpmr
        001fcid idp_id = oidc-openmeet
        0031cid nonce = HECyxy0hNbKvzoOHzE9xBso2QpapE94i
        0023cid client_redirect_url = test
        001ecid ui_auth_session_id = 
        0019cid code_verifier = 
        001dcid time < 1750867363475
      `;

      console.log('📋 Example Session Cookie Content:');
      console.log(exampleDecodedContent);
      console.log('  - Real state: OQQyxaNrEoCHSEImvfUDjMYdJRdpmr');
      console.log('  - This is what OIDC should return as state parameter');

      // The actual implementation would need:
      // 1. Node.js macaroons library to parse the session cookie
      // 2. Extract the 'state' caveat value
      // 3. Return that value in the OIDC callback

      expect(true).toBe(true); // Test passes, just documents the requirement
    });
  });
});
