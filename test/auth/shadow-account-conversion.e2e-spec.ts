import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
} from '../utils/constants';
import { getAuthToken } from '../utils/functions';

// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('Shadow Account Conversion (E2E)', () => {
  const app = TESTING_APP_URL;
  let serverApp;
  let authToken: string;

  beforeAll(async () => {
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  describe('Shadow Account Bluesky Login', () => {
    it('should convert shadow account to real account on first Bluesky login', async () => {
      // 1. Create a shadow account via test endpoint
      const testDID = `did:plc:test${Date.now()}${Math.random().toString(36).substring(7)}`;
      const testHandle = `test${Date.now()}.bsky.social`;

      const shadowResponse = await serverApp
        .post('/api/v1/test/shadow-accounts')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Test Shadow User',
        })
        .expect(201);

      expect(shadowResponse.body.id).toBeDefined();
      expect(shadowResponse.body.isShadowAccount).toBe(true);
      expect(shadowResponse.body.roleId).toBeNull();
      expect(shadowResponse.body.provider).toBe('bluesky');
      expect(shadowResponse.body.did).toBe(testDID);

      const shadowUserId = shadowResponse.body.id;

      // 2. Simulate Bluesky login via test endpoint
      const loginResponse = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Test Shadow User',
          email: `test${Date.now()}@openmeet.test`,
        })
        .expect(201);

      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user).toBeDefined();
      expect(loginResponse.body.user.id).toBe(shadowUserId);

      // 3. Verify account was converted to real account
      const meResponse = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .expect(200);

      expect(meResponse.body.id).toBe(shadowUserId);
      expect(meResponse.body.isShadowAccount).toBe(false); // ✅ Converted!
      expect(meResponse.body.role).toBeDefined();
      expect(meResponse.body.role.name).toBe('user'); // ✅ Role assigned!
      expect(meResponse.body.socialId).toBe(testDID);
      expect(meResponse.body.provider).toBe('bluesky');

      // 4. Verify user has permissions - try to create a group
      const createGroupResponse = await serverApp
        .post('/api/groups')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({
          name: `Test Group ${Date.now()}`,
          description: 'Testing shadow account conversion permissions',
        })
        .expect(201);

      expect(createGroupResponse.body.name).toContain('Test Group');
      expect(createGroupResponse.body.id).toBeDefined();
    });

    it('should assign role to shadow account without role on login', async () => {
      // Create shadow account
      const testDID = `did:plc:test${Date.now()}${Math.random().toString(36).substring(7)}`;
      const testHandle = `test${Date.now()}.bsky.social`;

      const shadowResponse = await serverApp
        .post('/api/v1/test/shadow-accounts')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Test User',
        })
        .expect(201);

      expect(shadowResponse.body.roleId).toBeNull();

      // Simulate login
      const loginResponse = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Test User',
        })
        .expect(201);

      // Verify role was assigned
      expect(loginResponse.body.user.role).toBeDefined();
      expect(loginResponse.body.user.role.name).toBe('user');
      expect(loginResponse.body.user.role.id).toBeDefined();
    });

    it('should allow shadow account to create groups after conversion', async () => {
      // Create and login shadow account in one flow
      const testDID = `did:plc:test${Date.now()}${Math.random().toString(36).substring(7)}`;
      const testHandle = `test${Date.now()}.bsky.social`;

      await serverApp
        .post('/api/v1/test/shadow-accounts')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Group Creator Test',
        })
        .expect(201);

      const loginResponse = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDID,
          handle: testHandle,
          displayName: 'Group Creator Test',
        })
        .expect(201);

      // Try to create a group with the converted account
      const groupResponse = await serverApp
        .post('/api/groups')
        .set('Authorization', `Bearer ${loginResponse.body.token}`)
        .send({
          name: `Permission Test Group ${Date.now()}`,
          description: 'Verifying CREATE_GROUPS permission',
        })
        .expect(201);

      expect(groupResponse.body.name).toContain('Permission Test Group');
    });
  });

  describe('Test Endpoints Security', () => {
    it('should be accessible in test environment', async () => {
      // Verify test endpoints are accessible
      const testDID = `did:plc:test${Date.now()}`;
      const response = await serverApp
        .post('/api/v1/test/shadow-accounts')
        .send({
          did: testDID,
          handle: 'security-test.bsky.social',
        });

      // Should succeed in test environment
      expect([201, 200]).toContain(response.status);
    });
  });

  describe('Multiple Login Scenarios', () => {
    it('should handle repeated logins correctly', async () => {
      // Create shadow account
      const testDID = `did:plc:test${Date.now()}${Math.random().toString(36).substring(7)}`;
      const testHandle = `test${Date.now()}.bsky.social`;

      await serverApp
        .post('/api/v1/test/shadow-accounts')
        .send({
          did: testDID,
          handle: testHandle,
        })
        .expect(201);

      // First login - converts shadow to real
      const login1Response = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDID,
          handle: testHandle,
        })
        .expect(201);

      // Verify conversion via /me endpoint (isShadowAccount not in login response DTO)
      const me1Response = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login1Response.body.token}`)
        .expect(200);

      expect(me1Response.body.isShadowAccount).toBe(false);

      // Second login - should still work with real account
      const login2Response = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDID,
          handle: testHandle,
        })
        .expect(201);

      expect(login2Response.body.user.id).toBe(login1Response.body.user.id);

      // Verify still a real account
      const me2Response = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${login2Response.body.token}`)
        .expect(200);

      expect(me2Response.body.isShadowAccount).toBe(false);
    });
  });
});
