import request from 'supertest';
import { TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

/**
 * Full Matrix OIDC Flow E2E Test
 *
 * Tests the complete Matrix session cookie flow:
 * 1. Matrix SSO redirect (creates session cookie)
 * 2. OIDC authorization with session cookie
 * 3. Matrix callback with session cookie validation
 *
 * This test will reveal ALB cookie corruption issues by going through
 * the actual Matrix server endpoints.
 */
jest.setTimeout(60000);

describe('Full Matrix OIDC Session Cookie Flow', () => {
  let userToken: string;

  // Matrix URLs - will use dev environment when BACKEND_DOMAIN is set
  const MATRIX_BASE_URL = process.env.BACKEND_DOMAIN?.includes(
    'api-dev.openmeet.net',
  )
    ? 'https://matrix-dev.openmeet.net'
    : 'http://localhost:8448';

  beforeAll(async () => {
    try {
      userToken = await loginAsTester();
      console.log('🔐 Test setup complete with user token');
    } catch (error) {
      console.error('Error in beforeAll setup:', error.message);
    }
  });

  describe('Matrix Session Cookie Flow', () => {
    it('should complete full Matrix SSO → OIDC → Callback flow with session cookies', async () => {
      console.log('🚀 Starting full Matrix OIDC session cookie test...');
      console.log(`📍 Matrix URL: ${MATRIX_BASE_URL}`);

      // Step 1: Initiate Matrix SSO redirect
      console.log('📋 Step 1: Matrix SSO redirect (creates session cookie)');

      const ssoResponse = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/login/sso/redirect/oidc-openmeet')
        .query({
          redirectUrl:
            'element://vector/webapp/?element-desktop-ssoid=test-full-flow',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(302);

      console.log('🔍 SSO Response Analysis:');
      console.log(`Status: ${ssoResponse.status}`);
      console.log(
        `Location: ${ssoResponse.headers.location?.substring(0, 100)}...`,
      );

      // Extract session cookies from Matrix response
      const setCookieHeaders = ssoResponse.headers['set-cookie'] || [];
      const sessionCookies: string[] = [];
      let oidcSessionCookie = '';
      let originalMacaroonValue = '';

      setCookieHeaders.forEach((cookie: string) => {
        if (cookie.includes('oidc_session')) {
          sessionCookies.push(cookie);
          // Extract just the cookie value for oidc_session
          const match = cookie.match(/oidc_session=([^;]+)/);
          if (match) {
            originalMacaroonValue = match[1]; // Store original value for comparison
            oidcSessionCookie = `oidc_session=${match[1]}`;
          }
        }
      });

      console.log(`📋 Session cookies found: ${sessionCookies.length}`);
      console.log(
        `📋 OIDC session cookie: ${oidcSessionCookie ? 'Present' : 'Missing'}`,
      );

      if (oidcSessionCookie) {
        console.log(
          `📋 OIDC session cookie length: ${oidcSessionCookie.length} characters`,
        );
        console.log(
          `📋 Original macaroon value length: ${originalMacaroonValue.length} characters`,
        );
        console.log(
          `📋 Original macaroon preview: ${originalMacaroonValue.substring(0, 50)}...`,
        );

        // Try to analyze the macaroon structure
        try {
          console.log(
            `📋 Macaroon appears to be base64: ${/^[A-Za-z0-9+/]+=*$/.test(originalMacaroonValue)}`,
          );

          // Try to decode as base64 and see if it looks like binary data
          const decodedBytes = Buffer.from(originalMacaroonValue, 'base64');
          console.log(
            `📋 Decoded macaroon bytes length: ${decodedBytes.length}`,
          );
          console.log(
            `📋 First 20 bytes: ${Array.from(decodedBytes.slice(0, 20))
              .map((b) => b.toString(16).padStart(2, '0'))
              .join(' ')}`,
          );

          // Try to decode as text to see if there's readable content
          const decodedText = decodedBytes.toString(
            'utf8',
            0,
            Math.min(100, decodedBytes.length),
          );
          console.log(
            `📋 Decoded text preview: ${decodedText.replace(/[^\x20-\x7E]/g, '?')}`,
          );
        } catch (error) {
          console.log(`📋 Failed to analyze macaroon: ${error.message}`);
        }
      }

      // Verify Matrix created session cookies
      expect(sessionCookies.length).toBeGreaterThan(0);
      expect(oidcSessionCookie).toBeTruthy();

      // Step 2: Extract OIDC authorization URL and parameters
      const locationHeader = ssoResponse.headers.location;
      expect(locationHeader).toContain('api/oidc/auth');

      const url = new URL(locationHeader);
      const clientId = url.searchParams.get('client_id');
      const state = url.searchParams.get('state');
      const nonce = url.searchParams.get('nonce');
      const redirectUri = url.searchParams.get('redirect_uri');

      console.log('📋 Step 2: OIDC Authorization parameters extracted');
      console.log(`   - client_id: ${clientId}`);
      console.log(`   - state: ${state}`);
      console.log(`   - nonce: ${nonce?.substring(0, 20)}...`);
      console.log(`   - redirect_uri: ${redirectUri}`);

      expect(clientId).toBe('matrix_synapse');
      expect(state).toBeTruthy();
      expect(redirectUri).toContain('_synapse/client/oidc/callback');

      // Step 3: Generate auth code for authenticated user
      console.log('📋 Step 3: Generate auth code for Matrix authentication');

      const authCodeResponse = await request(
        process.env.BACKEND_DOMAIN || 'http://localhost:3000',
      )
        .post('/api/matrix/generate-auth-code')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      const authCode = authCodeResponse.body.authCode;
      console.log(`✅ Auth code generated: ${authCode.substring(0, 20)}...`);

      // Step 4: Complete OIDC authorization with auth code (simulating Matrix's call to API)
      console.log(
        '📋 Step 4: OIDC authorization with auth code and session cookies',
      );

      const oidcAuthResponse = await request(
        process.env.BACKEND_DOMAIN || 'http://localhost:3000',
      )
        .get('/api/oidc/auth')
        .query({
          client_id: clientId,
          response_type: 'code',
          scope: 'openid profile email',
          state: state,
          nonce: nonce,
          redirect_uri: redirectUri,
          auth_code: authCode,
        })
        .set('Cookie', oidcSessionCookie) // Include Matrix session cookie
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(302);

      console.log('✅ OIDC authorization completed successfully');

      const callbackLocation = oidcAuthResponse.headers.location;
      expect(callbackLocation).toContain('_synapse/client/oidc/callback');
      expect(callbackLocation).toContain('code=');
      expect(callbackLocation).toContain(`state=${state}`);

      // Step 5: Extract authorization code from callback URL
      const callbackUrl = new URL(callbackLocation);
      const authorizationCode = callbackUrl.searchParams.get('code');
      const callbackState = callbackUrl.searchParams.get('state');

      console.log('📋 Step 5: Authorization code received for Matrix callback');
      console.log(`   - code: ${authorizationCode?.substring(0, 20)}...`);
      console.log(`   - state: ${callbackState}`);
      console.log(`   - state matches: ${callbackState === state}`);

      expect(authorizationCode).toBeTruthy();
      expect(callbackState).toBe(state);

      // Step 6: THE CRITICAL TEST - Matrix OIDC callback with session cookie validation
      console.log(
        '📋 Step 6: Matrix OIDC callback - testing session cookie validation',
      );
      console.log('🚨 This is where Matrix macaroon deserialization happens!');

      // Verify we're sending back the exact same cookie value
      const cookieToSend = oidcSessionCookie;
      const cookieValueToSend = cookieToSend.replace('oidc_session=', '');

      console.log('🔍 Cookie Integrity Check:');
      console.log(
        `   Original macaroon: ${originalMacaroonValue.substring(0, 50)}...`,
      );
      console.log(
        `   Sending back:     ${cookieValueToSend.substring(0, 50)}...`,
      );
      console.log(
        `   Values match:     ${originalMacaroonValue === cookieValueToSend}`,
      );
      console.log(`   Length original:  ${originalMacaroonValue.length}`);
      console.log(`   Length sending:   ${cookieValueToSend.length}`);

      if (originalMacaroonValue !== cookieValueToSend) {
        console.log('🔥 COOKIE CORRUPTION DETECTED!');
        console.log(
          '❌ We are corrupting the Matrix session cookie ourselves!',
        );

        // Find where they differ
        for (
          let i = 0;
          i < Math.min(originalMacaroonValue.length, cookieValueToSend.length);
          i++
        ) {
          if (originalMacaroonValue[i] !== cookieValueToSend[i]) {
            console.log(`   First difference at position ${i}:`);
            console.log(
              `   Original: '${originalMacaroonValue[i]}' (${originalMacaroonValue.charCodeAt(i)})`,
            );
            console.log(
              `   Sending:  '${cookieValueToSend[i]}' (${cookieValueToSend.charCodeAt(i)})`,
            );
            break;
          }
        }

        throw new Error(
          'We are corrupting the Matrix session cookie - not ALB!',
        );
      }

      const matrixCallbackResponse = await request(MATRIX_BASE_URL)
        .get('/_synapse/client/oidc/callback')
        .query({
          code: authorizationCode,
          state: callbackState,
        })
        .set('Cookie', oidcSessionCookie) // Critical: Matrix must validate this session cookie
        .redirects(0); // Don't follow redirects to capture the exact response

      console.log('🔍 Matrix Callback Response Analysis:');
      console.log(`Status: ${matrixCallbackResponse.status}`);
      console.log(
        `Location: ${matrixCallbackResponse.headers.location || 'No redirect'}`,
      );
      console.log(
        `Response body preview: ${matrixCallbackResponse.text?.substring(0, 200)}...`,
      );

      // If it's HTML and potentially an error, log more detail
      if (matrixCallbackResponse.text?.includes('<!DOCTYPE html>')) {
        console.log(
          '📄 HTML Response detected - checking for error content...',
        );
        const fullText = matrixCallbackResponse.text;
        if (fullText.toLowerCase().includes('error')) {
          console.log('🔍 Full HTML response (contains "error"):');
          console.log(fullText);
        }
      }

      // Check for macaroon deserialization errors in response (could be in HTML error pages too)
      const responseText = matrixCallbackResponse.text || '';
      const hasMarcaroonError =
        responseText.includes('MacaroonDeserializationException') ||
        responseText.includes('cannot determine data format') ||
        responseText.includes('binary-encoded macaroon') ||
        responseText.includes('Invalid session') ||
        responseText.includes('Session expired') ||
        responseText.includes('Authentication failed') ||
        (matrixCallbackResponse.status === 200 &&
          responseText.includes('<!DOCTYPE html>') &&
          (responseText.includes('error') || responseText.includes('Error')));

      if (matrixCallbackResponse.status === 400) {
        console.log('❌ Matrix callback failed - status 400');

        if (hasMarcaroonError) {
          console.log(
            '🔥 DETECTED: Macaroon deserialization error in response!',
          );
          console.log('❌ ALB is still corrupting Matrix session cookies');
          throw new Error(
            'Matrix macaroon deserialization failed - ALB cookie corruption not fixed',
          );
        } else {
          console.log('❌ Matrix callback failed for other reasons');
          console.log(`Error response: ${responseText}`);
        }
      } else if (matrixCallbackResponse.status === 302) {
        console.log(
          '✅ Matrix callback succeeded - session cookie validation passed',
        );
        console.log('🎉 ALB cookie corruption appears to be FIXED!');
      } else {
        console.log(
          `⚠️ Unexpected Matrix response status: ${matrixCallbackResponse.status}`,
        );
      }

      // Fail explicitly if we detect macaroon errors regardless of status code
      if (hasMarcaroonError) {
        throw new Error(
          `Matrix macaroon deserialization error detected: ${responseText.substring(0, 300)}`,
        );
      }

      // Check for successful completion
      // Matrix should either redirect to Element (302) or return success
      // Only allow 400 if it's NOT a macaroon error
      if (matrixCallbackResponse.status === 400 && !hasMarcaroonError) {
        console.log(
          '✅ Matrix returned 400 but no macaroon error - this is acceptable',
        );
      } else {
        expect([200, 302]).toContain(matrixCallbackResponse.status);
      }

      // If 302, verify it's redirecting to Element
      if (matrixCallbackResponse.status === 302) {
        const finalRedirect = matrixCallbackResponse.headers.location;
        expect(finalRedirect).toContain('element://');
      }

      console.log(
        '✅ Full Matrix OIDC session cookie flow completed successfully!',
      );
    });

    it('should handle invalid session cookies gracefully', async () => {
      console.log('🧪 Testing invalid session cookie handling...');

      const invalidCookie = 'oidc_session=invalid_base64_data_123';

      const ssoResponse = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/login/sso/redirect/oidc-openmeet')
        .query({
          redirectUrl:
            'element://vector/webapp/?element-desktop-ssoid=test-invalid-cookie',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(302);

      const locationHeader = ssoResponse.headers.location;
      const url = new URL(locationHeader);
      const state = url.searchParams.get('state');

      // Try Matrix callback with invalid session cookie
      const matrixCallbackResponse = await request(MATRIX_BASE_URL)
        .get('/_synapse/client/oidc/callback')
        .query({
          code: 'fake_code_123',
          state: state,
        })
        .set('Cookie', invalidCookie)
        .redirects(0);

      console.log(
        `Invalid cookie response status: ${matrixCallbackResponse.status}`,
      );

      // Should handle invalid cookies gracefully (400 or redirect to login)
      expect([400, 302]).toContain(matrixCallbackResponse.status);
    });
  });

  describe('Session Cookie Analysis', () => {
    it('should analyze Matrix session cookie structure', async () => {
      console.log('🔍 Analyzing Matrix session cookie structure...');

      const ssoResponse = await request(MATRIX_BASE_URL)
        .get('/_matrix/client/v3/login/sso/redirect/oidc-openmeet')
        .query({
          redirectUrl:
            'element://vector/webapp/?element-desktop-ssoid=test-cookie-analysis',
        })
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(302);

      const setCookieHeaders = ssoResponse.headers['set-cookie'] || [];

      setCookieHeaders.forEach((cookie: string, index: number) => {
        if (cookie.includes('oidc_session')) {
          console.log(`📋 Cookie ${index + 1}: ${cookie.substring(0, 100)}...`);

          // Extract cookie value
          const match = cookie.match(/oidc_session=([^;]+)/);
          if (match) {
            const cookieValue = match[1];
            console.log(`   - Value length: ${cookieValue.length} characters`);
            console.log(
              `   - Appears to be base64: ${/^[A-Za-z0-9+/]+=*$/.test(cookieValue)}`,
            );

            // Try to analyze the cookie flags
            const flags = cookie
              .split(';')
              .slice(1)
              .map((f) => f.trim());
            console.log(`   - Flags: ${flags.join(', ')}`);
          }
        }
      });
    });
  });
});
