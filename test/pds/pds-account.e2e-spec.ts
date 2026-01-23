import request from 'supertest';
import {
  TESTING_PDS_URL,
  TESTING_PDS_HANDLE_DOMAIN,
  TESTING_PDS_INVITE_CODE,
} from '../utils/constants';

jest.setTimeout(60000);

// Generate a short unique suffix for handles (max handle length is ~253 chars, but keep it short)
const shortId = () => Math.random().toString(36).substring(2, 8);

describe('PDS Account Creation', () => {
  const pdsUrl = TESTING_PDS_URL;
  const handleDomain = TESTING_PDS_HANDLE_DOMAIN;

  describe('Health Check', () => {
    it('should return healthy status from PDS', async () => {
      const response = await request(pdsUrl).get('/xrpc/_health').expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should describe server capabilities', async () => {
      const response = await request(pdsUrl)
        .get('/xrpc/com.atproto.server.describeServer')
        .expect(200);

      expect(response.body).toHaveProperty('did');
      expect(response.body).toHaveProperty('availableUserDomains');
      expect(response.body.availableUserDomains).toContain(handleDomain);
    });
  });

  describe('Account Creation', () => {
    const testEmail = `pds-${shortId()}@test.invalid`;
    const testHandle = `user${shortId()}${handleDomain}`;
    const testPassword = 'test-password-123';

    it('should create an account on the PDS', async () => {
      const response = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: testEmail,
          handle: testHandle,
          password: testPassword,
          ...(TESTING_PDS_INVITE_CODE && {
            inviteCode: TESTING_PDS_INVITE_CODE,
          }),
        })
        .expect(200);

      expect(response.body).toHaveProperty('did');
      expect(response.body).toHaveProperty('handle', testHandle);
      expect(response.body).toHaveProperty('accessJwt');
      expect(response.body).toHaveProperty('refreshJwt');

      // DID should be a valid did:plc format
      expect(response.body.did).toMatch(/^did:plc:[a-z0-9]+$/);
    });

    it('should fail to create duplicate handle', async () => {
      // First, create the account
      const uniqueEmail = `pds-dup-${shortId()}@test.invalid`;
      const uniqueHandle = `dup${shortId()}${handleDomain}`;

      await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: uniqueEmail,
          handle: uniqueHandle,
          password: testPassword,
          ...(TESTING_PDS_INVITE_CODE && {
            inviteCode: TESTING_PDS_INVITE_CODE,
          }),
        })
        .expect(200);

      // Try to create another account with the same handle
      const response = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: `diff-${shortId()}@test.invalid`,
          handle: uniqueHandle,
          password: testPassword,
          ...(TESTING_PDS_INVITE_CODE && {
            inviteCode: TESTING_PDS_INVITE_CODE,
          }),
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toMatch(/handle.*taken/i);
    });

    it('should resolve handle to DID', async () => {
      // Create account first
      const resolveEmail = `pds-res-${shortId()}@test.invalid`;
      const resolveHandle = `res${shortId()}${handleDomain}`;

      const createResponse = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: resolveEmail,
          handle: resolveHandle,
          password: testPassword,
          ...(TESTING_PDS_INVITE_CODE && {
            inviteCode: TESTING_PDS_INVITE_CODE,
          }),
        })
        .expect(200);

      const expectedDid = createResponse.body.did;

      // Resolve the handle
      const resolveResponse = await request(pdsUrl)
        .get('/xrpc/com.atproto.identity.resolveHandle')
        .query({ handle: resolveHandle })
        .expect(200);

      expect(resolveResponse.body).toHaveProperty('did', expectedDid);
    });

    it('should create session with valid credentials', async () => {
      // Create account first
      const sessionEmail = `pds-ses-${shortId()}@test.invalid`;
      const sessionHandle = `ses${shortId()}${handleDomain}`;

      await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: sessionEmail,
          handle: sessionHandle,
          password: testPassword,
          ...(TESTING_PDS_INVITE_CODE && {
            inviteCode: TESTING_PDS_INVITE_CODE,
          }),
        })
        .expect(200);

      // Create session (login)
      const sessionResponse = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createSession')
        .set('Content-Type', 'application/json')
        .send({
          identifier: sessionHandle,
          password: testPassword,
        })
        .expect(200);

      expect(sessionResponse.body).toHaveProperty('did');
      expect(sessionResponse.body).toHaveProperty('handle', sessionHandle);
      expect(sessionResponse.body).toHaveProperty('accessJwt');
      expect(sessionResponse.body).toHaveProperty('refreshJwt');
    });
  });
});
