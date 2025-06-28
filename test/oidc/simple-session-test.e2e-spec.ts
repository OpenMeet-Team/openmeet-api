import request from 'supertest';
import { TESTING_TENANT_ID } from '../utils/constants';

/**
 * Simple test to isolate session cookie validation issue
 */
jest.setTimeout(30000);

describe('Simple Session Cookie Test', () => {
  const MATRIX_BASE_URL = process.env.BACKEND_DOMAIN?.includes('api-dev.openmeet.net') 
    ? 'https://matrix-dev.openmeet.net'
    : 'http://localhost:8448';

  it('should get session cookie and validate it with API', async () => {
    console.log('🔍 Step 1: Getting Matrix session cookie...');
    
    // Get session cookie from Matrix
    const ssoResponse = await request(MATRIX_BASE_URL)
      .get('/_matrix/client/v3/login/sso/redirect/oidc-openmeet')
      .query({
        redirectUrl: 'element://vector/webapp/?element-desktop-ssoid=simple-test'
      })
      .set('x-tenant-id', TESTING_TENANT_ID)
      .expect(302);

    // Extract session cookie
    const setCookieHeaders = ssoResponse.headers['set-cookie'] || [];
    let oidcSessionCookie = '';
    
    setCookieHeaders.forEach((cookie: string) => {
      if (cookie.includes('oidc_session=')) {
        const match = cookie.match(/oidc_session=([^;]+)/);
        if (match) {
          oidcSessionCookie = match[1];
        }
      }
    });

    expect(oidcSessionCookie).toBeTruthy();
    console.log(`✅ Got session cookie: ${oidcSessionCookie.substring(0, 50)}...`);

    console.log('🔍 Step 2: Testing session validation with API...');
    
    // Test direct session validation with our API
    const sessionTestResponse = await request(process.env.BACKEND_DOMAIN || 'http://localhost:3000')
      .get('/api/oidc/auth')
      .query({
        client_id: 'matrix_synapse',
        response_type: 'code',
        scope: 'openid profile email',
        redirect_uri: `${MATRIX_BASE_URL}/_synapse/client/oidc/callback`,
        state: 'test-state-123'
      })
      .set('Cookie', `oidc_session=${oidcSessionCookie}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log(`📋 Session validation response status: ${sessionTestResponse.status}`);
    console.log(`📋 Response headers: ${JSON.stringify(sessionTestResponse.headers, null, 2)}`);
    
    if (sessionTestResponse.status >= 400) {
      console.log(`📋 Error response body: ${sessionTestResponse.text}`);
    }

    // Should either redirect (302) or authenticate successfully
    expect([200, 302]).toContain(sessionTestResponse.status);
  });
});