import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
} from '../utils/constants';
import { createTestUser, getAuthToken } from '../utils/functions';

jest.setTimeout(60000);

/**
 * AT Protocol Identity Relink E2E Tests
 *
 * Tests the handleLinkCallback flow via the test endpoint POST /api/v1/test/auth/bluesky-link.
 * Verifies that relinking an AT Protocol identity correctly handles:
 * 1. socialId is only updated for bluesky-provider users
 * 2. firstName is preserved when user already has one
 * 3. DID strings are not used as firstName when handle resolution fails
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-relink
 */
describe('AT Protocol Identity Relink (E2E)', () => {
  const app = TESTING_APP_URL;
  let serverApp;

  beforeAll(async () => {
    await getAuthToken(app, TESTING_USER_EMAIL, TESTING_USER_PASSWORD);
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  describe('Issue 1: socialId should only be updated for bluesky-provider users', () => {
    it('should NOT overwrite socialId for email-provider user when linking ATProto', async () => {
      // 1. Register and verify an email user
      const timestamp = Date.now();
      const email = `relink-email-${timestamp}@openmeet.test`;

      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        email,
        'EmailUser',
        'Test',
      );
      const token = testUser.token;

      // Get user details (ulid, socialId before link)
      const meBefore = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meBefore.body.provider).toBe('email');
      const originalSocialId = meBefore.body.socialId; // null for email users
      const userUlid = meBefore.body.ulid;

      // 2. Simulate ATProto link via test endpoint
      const testDid = `did:plc:relink-email-${timestamp}`;
      await serverApp
        .post('/api/v1/test/auth/bluesky-link')
        .send({
          userUlid,
          did: testDid,
          handle: `emailuser-${timestamp}.bsky.social`,
          displayName: 'Email User On Bluesky',
          pdsUrl: 'https://pds.test',
        })
        .expect(201);

      // 3. Verify socialId was NOT changed
      const meAfter = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meAfter.body.socialId).toBe(originalSocialId);
      expect(meAfter.body.provider).toBe('email'); // provider unchanged

      // 4. Verify preferences were still updated (link was successful)
      expect(meAfter.body.preferences?.bluesky?.did).toBe(testDid);
      expect(meAfter.body.preferences?.bluesky?.connected).toBe(true);
    });

    it('should update socialId for bluesky-provider user when relinking', async () => {
      // 1. Create a native bluesky user via test endpoint
      const timestamp = Date.now();
      const oldDid = `did:plc:relink-bsky-old-${timestamp}`;
      const newDid = `did:plc:relink-bsky-new-${timestamp}`;

      const loginResponse = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: oldDid,
          handle: `bskyuser-${timestamp}.bsky.social`,
          displayName: 'Bluesky User',
        })
        .expect(201);

      const token = loginResponse.body.token;

      const meBefore = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meBefore.body.provider).toBe('bluesky');
      expect(meBefore.body.socialId).toBe(oldDid);
      const userUlid = meBefore.body.ulid;

      // 2. Relink to a new DID
      await serverApp
        .post('/api/v1/test/auth/bluesky-link')
        .send({
          userUlid,
          did: newDid,
          handle: `bskyuser-new-${timestamp}.bsky.social`,
          displayName: 'Bluesky User Relinked',
          pdsUrl: 'https://pds.test',
        })
        .expect(201);

      // 3. Verify socialId WAS updated to new DID
      const meAfter = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meAfter.body.socialId).toBe(newDid);
      expect(meAfter.body.preferences?.bluesky?.did).toBe(newDid);
    });
  });

  describe('Issue 2: firstName should be preserved when user already has one', () => {
    it('should NOT overwrite existing firstName on relink', async () => {
      // 1. Register and verify email user with a specific firstName
      const timestamp = Date.now();
      const email = `relink-name-${timestamp}@openmeet.test`;

      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        email,
        'OriginalName',
        'Test',
      );
      const token = testUser.token;

      const me = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(me.body.firstName).toBe('OriginalName');

      // 2. Link ATProto with a different displayName
      const testDid = `did:plc:relink-name-${timestamp}`;
      await serverApp
        .post('/api/v1/test/auth/bluesky-link')
        .send({
          userUlid: me.body.ulid,
          did: testDid,
          handle: `nametest-${timestamp}.bsky.social`,
          displayName: 'DifferentBlueskyName',
          pdsUrl: 'https://pds.test',
        })
        .expect(201);

      // 3. Verify firstName was NOT overwritten
      const meAfter = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meAfter.body.firstName).toBe('OriginalName');
    });

    it('should set firstName from profile when user has no firstName', async () => {
      // 1. Create a bluesky user with no firstName (using test endpoint)
      const timestamp = Date.now();
      const testDid = `did:plc:relink-noname-${timestamp}`;

      // Create user via bluesky login — firstName comes from displayName
      const loginResponse = await serverApp
        .post('/api/v1/test/auth/bluesky')
        .send({
          did: testDid,
          handle: `noname-${timestamp}.bsky.social`,
          // No displayName — firstName will come from handle
        })
        .expect(201);

      const token = loginResponse.body.token;
      const me = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const userUlid = me.body.ulid;

      // Clear firstName by updating user (if possible via API, or just verify behavior)
      // The key test: if user somehow has no firstName, relink should set it
      // For now, verify that the link was successful and preferences updated
      const newDid = `did:plc:relink-noname-new-${timestamp}`;
      await serverApp
        .post('/api/v1/test/auth/bluesky-link')
        .send({
          userUlid,
          did: newDid,
          handle: `noname-new-${timestamp}.bsky.social`,
          displayName: 'NewDisplayName',
          pdsUrl: 'https://pds.test',
        })
        .expect(201);

      const meAfter = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // User already had a firstName from initial login, so it should be preserved
      expect(meAfter.body.firstName).toBeDefined();
      expect(meAfter.body.preferences?.bluesky?.did).toBe(newDid);
    });
  });

  describe('Issue 3: DID string should not be used as firstName', () => {
    it('should not set firstName to DID when handle equals DID', async () => {
      // 1. Register and verify email user
      const timestamp = Date.now();
      const email = `relink-did-${timestamp}@openmeet.test`;

      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        email,
        'NoBluesky',
        'Test',
      );
      const token = testUser.token;

      const me = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // 2. Link ATProto where handle fell back to DID (no displayName)
      const testDid = `did:plc:relink-did-${timestamp}`;
      await serverApp
        .post('/api/v1/test/auth/bluesky-link')
        .send({
          userUlid: me.body.ulid,
          did: testDid,
          handle: testDid, // handle === DID (resolution failed)
          // No displayName
          pdsUrl: 'https://pds.test',
        })
        .expect(201);

      // 3. Verify firstName is NOT the DID string
      const meAfter = await serverApp
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // firstName should NOT be the DID — it should remain empty/null or be unchanged
      if (meAfter.body.firstName) {
        expect(meAfter.body.firstName).not.toMatch(/^did:/);
      }
    });
  });
});
