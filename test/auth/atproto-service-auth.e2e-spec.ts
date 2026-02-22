import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_PDS_URL,
  TESTING_PDS_HANDLE_DOMAIN,
  TESTING_PDS_INVITE_CODE,
} from '../utils/constants';

/**
 * AT Protocol Service Auth E2E Tests
 *
 * Tests the full HTTP flow of exchanging a PDS-signed service auth JWT
 * for OpenMeet access/refresh tokens, including auto-creation of users
 * for unknown DIDs.
 *
 * Flow under test:
 * 1. Create account on PDS via com.atproto.server.createAccount
 * 2. Get the SERVICE_DID from OpenMeet's /.well-known/did.json
 * 3. Call com.atproto.server.getServiceAuth on PDS with the account's accessJwt
 *    - aud: SERVICE_DID (from did.json)
 *    - lxm: net.openmeet.auth
 * 4. Exchange the signed JWT at POST /api/v1/auth/atproto/service-auth
 * 5. Verify returned tokens work with /api/v1/auth/me
 *
 * Prerequisites:
 * - PDS and PLC containers must be running (Docker devnet)
 * - Valid PDS_INVITE_CODE in .env (if required by PDS)
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-service-auth
 */

const isPdsConfigured = !!process.env.PDS_URL;
const describeIfPds = isPdsConfigured ? describe : describe.skip;

jest.setTimeout(120000);

const shortId = () => Math.random().toString(36).substring(2, 8);

/**
 * Create a PDS account and get a service auth JWT for OpenMeet.
 *
 * 1. Create account on PDS via com.atproto.server.createAccount
 * 2. Get the SERVICE_DID from OpenMeet's /.well-known/did.json
 * 3. Call com.atproto.server.getServiceAuth on PDS with the account's accessJwt
 *    - aud: SERVICE_DID (from did.json)
 *    - lxm: net.openmeet.auth
 * 4. Return the signed JWT + account info
 */
async function createPdsAccountAndGetServiceAuthToken(
  pdsUrl: string,
  appUrl: string,
): Promise<{
  did: string;
  handle: string;
  serviceAuthToken: string;
  accessJwt: string;
}> {
  const handle = `svcauth${shortId()}${TESTING_PDS_HANDLE_DOMAIN}`;
  const email = `svcauth-${shortId()}@test.invalid`;
  const password = 'test-password-123';

  // 1. Create PDS account
  const createResponse = await request(pdsUrl)
    .post('/xrpc/com.atproto.server.createAccount')
    .set('Content-Type', 'application/json')
    .send({
      email,
      handle,
      password,
      ...(TESTING_PDS_INVITE_CODE && { inviteCode: TESTING_PDS_INVITE_CODE }),
    })
    .expect(200);

  const { did, accessJwt } = createResponse.body;

  // 2. Get SERVICE_DID from OpenMeet's did.json
  const didJsonResponse = await request(appUrl)
    .get('/.well-known/did.json')
    .expect(200);

  const serviceDid = didJsonResponse.body.id;

  // 3. Get service auth token from PDS
  const serviceAuthResponse = await request(pdsUrl)
    .get('/xrpc/com.atproto.server.getServiceAuth')
    .query({ aud: serviceDid, lxm: 'net.openmeet.auth' })
    .set('Authorization', `Bearer ${accessJwt}`)
    .expect(200);

  return {
    did,
    handle,
    serviceAuthToken: serviceAuthResponse.body.token,
    accessJwt,
  };
}

describeIfPds('AT Protocol Service Auth (e2e)', () => {
  const app = TESTING_APP_URL;
  const pdsUrl = TESTING_PDS_URL;

  let serverApp: request.SuperAgentTest;

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  describe('Auto-create user for unknown DID', () => {
    it('should auto-create user and return tokens for unknown DID', async () => {
      // Create a fresh PDS account (no OpenMeet account exists)
      const { handle, serviceAuthToken } =
        await createPdsAccountAndGetServiceAuthToken(pdsUrl, app);

      // Exchange service auth token for OpenMeet tokens
      const response = await serverApp
        .post('/api/v1/auth/atproto/service-auth')
        .send({ token: serviceAuthToken })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('tokenExpires');

      // Verify the auto-created user via /auth/me
      const meResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${response.body.token}`)
        .expect(200);

      expect(meResponse.body).toHaveProperty('ulid');
      expect(meResponse.body.provider).toBe('atproto-service');
      // The handle should be used as firstName
      expect(meResponse.body.firstName).toBe(handle);
    });

    it('should return tokens for same DID on second service auth (idempotent)', async () => {
      // Create a fresh PDS account
      const { accessJwt } =
        await createPdsAccountAndGetServiceAuthToken(pdsUrl, app);

      // We need fresh service auth tokens for each exchange call because they
      // are short-lived JWTs. The PDS generates a new one each time.

      // Get SERVICE_DID for constructing service auth requests
      const didJsonResponse = await request(app)
        .get('/.well-known/did.json')
        .expect(200);
      const serviceDid = didJsonResponse.body.id;

      // First exchange: get a service auth token and exchange it
      const firstTokenResponse = await request(pdsUrl)
        .get('/xrpc/com.atproto.server.getServiceAuth')
        .query({ aud: serviceDid, lxm: 'net.openmeet.auth' })
        .set('Authorization', `Bearer ${accessJwt}`)
        .expect(200);

      const firstResponse = await serverApp
        .post('/api/v1/auth/atproto/service-auth')
        .send({ token: firstTokenResponse.body.token })
        .expect(200);

      // Get user ULID from first login
      const firstMe = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${firstResponse.body.token}`)
        .expect(200);

      // Second exchange: get another service auth token and exchange it
      const secondTokenResponse = await request(pdsUrl)
        .get('/xrpc/com.atproto.server.getServiceAuth')
        .query({ aud: serviceDid, lxm: 'net.openmeet.auth' })
        .set('Authorization', `Bearer ${accessJwt}`)
        .expect(200);

      const secondResponse = await serverApp
        .post('/api/v1/auth/atproto/service-auth')
        .send({ token: secondTokenResponse.body.token })
        .expect(200);

      expect(secondResponse.body).toHaveProperty('token');

      // Verify same user (same ULID) - idempotent login
      const secondMe = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${secondResponse.body.token}`)
        .expect(200);

      expect(secondMe.body.ulid).toBe(firstMe.body.ulid);
    });

    it('should allow Bluesky OAuth login for service-auth-created user (account continuity)', async () => {
      // Step 1: Create user via service auth (simulates Roomy calendar opening)
      const { did, handle, serviceAuthToken } =
        await createPdsAccountAndGetServiceAuthToken(pdsUrl, app);

      const serviceAuthResponse = await serverApp
        .post('/api/v1/auth/atproto/service-auth')
        .send({ token: serviceAuthToken })
        .expect(200);

      // Get the auto-created user's ULID
      const serviceAuthMe = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${serviceAuthResponse.body.token}`)
        .expect(200);

      const originalUlid = serviceAuthMe.body.ulid;
      expect(serviceAuthMe.body.provider).toBe('atproto-service');

      // Step 2: Simulate Bluesky OAuth login with the same DID
      // This uses the test helper that calls findUserByAtprotoIdentity —
      // the same lookup the real OAuth callback uses
      const oauthResponse = await serverApp
        .post('/api/v1/test/auth/bluesky-direct')
        .send({
          did,
          handle,
          displayName: 'Test User via OAuth',
          email: 'oauth-upgrade@test.invalid',
        })
        .expect(201);

      expect(oauthResponse.body).toHaveProperty('token');

      // Step 3: Verify it's the SAME user account (not a duplicate)
      const oauthMe = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${oauthResponse.body.token}`)
        .expect(200);

      expect(oauthMe.body.ulid).toBe(originalUlid);
    });

    it('should reject invalid/tampered service auth token', async () => {
      // Send a fake JWT that won't verify - the DID in iss doesn't exist
      // or the signature is invalid
      const fakeToken =
        'eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.' +
        'eyJpc3MiOiJkaWQ6cGxjOmZha2UxMjMiLCJhdWQiOiJkaWQ6d2ViOmFwaS5vcGVubWVldC5uZXQiLCJseG0iOiJuZXQub3Blbm1lZXQuYXV0aCIsImV4cCI6OTk5OTk5OTk5OX0.' +
        'invalidsignature';

      const response = await serverApp
        .post('/api/v1/auth/atproto/service-auth')
        .send({ token: fakeToken });

      // Should fail with 4xx (DID resolution will fail for fake DID,
      // or signature verification will fail, or expiry check will reject)
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
});
