import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  loginAsAdmin,
  createTestUser,
  joinGroup,
} from '../utils/functions';
import {
  GroupStatus,
  GroupVisibility,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Activity Feed Security (E2E)', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;
  let groupMemberToken: string;
  let nonMemberToken: string;
  let privateGroup: any;
  let authenticatedGroup: any;
  let publicGroup: any;

  // Store user info
  let groupMemberUser: any;
  let nonMemberUser: any;

  beforeAll(async () => {
    try {
      // Get admin token
      adminToken = await loginAsAdmin();

      const timestamp = Date.now();

      // Create test users
      groupMemberUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `feed.member.${timestamp}@example.com`,
        'Feed',
        'Member',
      );
      groupMemberToken = groupMemberUser.token;

      nonMemberUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `feed.nonmember.${timestamp}@example.com`,
        'Feed',
        'NonMember',
      );
      nonMemberToken = nonMemberUser.token;

      // Create private group
      privateGroup = await createGroup(app, adminToken, {
        name: `Private Test Group ${timestamp}`,
        description: 'A private group for testing activity feed security',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Private,
      });

      // Create authenticated (unlisted) group
      authenticatedGroup = await createGroup(app, adminToken, {
        name: `Authenticated Test Group ${timestamp}`,
        description: 'An authenticated group for testing activity feed security',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Authenticated,
      });

      // Create public group
      publicGroup = await createGroup(app, adminToken, {
        name: `Public Test Group ${timestamp}`,
        description: 'A public group for testing activity feed security',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Add groupMember to private group only
      await joinGroup(app, TESTING_TENANT_ID, privateGroup.slug, groupMemberToken);

      console.log('Test setup complete:', {
        privateGroup: privateGroup.slug,
        authenticatedGroup: authenticatedGroup.slug,
        publicGroup: publicGroup.slug,
        groupMemberId: groupMemberUser.id,
        nonMemberId: nonMemberUser.id,
      });
    } catch (error) {
      console.error('Error in beforeAll:', error);
      throw error;
    }
  });

  describe('GET /groups/:slug/feed - Private Groups', () => {
    it('should allow group members to access private group feed', async () => {
      // Given: User is a member of private group
      // When: Member requests group feed
      const response = await request(app)
        .get(`/api/groups/${privateGroup.slug}/feed`)
        .set('Authorization', `Bearer ${groupMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Member access response:', {
        status: response.status,
        bodyLength: response.body?.length,
      });

      // Then: Should return activities (200 OK)
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should deny non-members access to private group feed', async () => {
      // Given: User is NOT a member of private group
      // When: Non-member requests group feed
      const response = await request(app)
        .get(`/api/groups/${privateGroup.slug}/feed`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Non-member access response:', {
        status: response.status,
        body: response.body,
      });

      // Then: Should receive Forbidden error (403)
      expect(response.status).toBe(403);
      expect(response.body.message).toBeDefined();
    });

    it('should deny unauthenticated users access to private group feed', async () => {
      // Given: User is not logged in
      // When: Unauthenticated request to private group feed
      const response = await request(app)
        .get(`/api/groups/${privateGroup.slug}/feed`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Unauthenticated access response:', {
        status: response.status,
        body: response.body,
      });

      // Then: Should receive Forbidden or Unauthorized (403 or 401)
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('GET /groups/:slug/feed - Authenticated Groups', () => {
    it('should allow authenticated users to access authenticated group feed', async () => {
      // Given: Authenticated (unlisted) group exists
      // When: Any authenticated user requests feed
      const response = await request(app)
        .get(`/api/groups/${authenticatedGroup.slug}/feed`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Authenticated user access to authenticated group:', {
        status: response.status,
        bodyLength: response.body?.length,
      });

      // Then: Should succeed (authenticated = anyone with account can access)
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should deny unauthenticated users access to authenticated group feed', async () => {
      // Given: Authenticated group exists
      // When: Unauthenticated user requests feed
      const response = await request(app)
        .get(`/api/groups/${authenticatedGroup.slug}/feed`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Unauthenticated access to authenticated group:', {
        status: response.status,
        body: response.body,
      });

      // Then: Should be denied (401 or 403)
      expect([401, 403]).toContain(response.status);
    });
  });

  describe('GET /groups/:slug/feed - Public Groups', () => {
    it('should allow anyone to access public group feed', async () => {
      // Given: Public group exists
      // When: Unauthenticated user requests feed
      const response = await request(app)
        .get(`/api/groups/${publicGroup.slug}/feed`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Unauthenticated access to public group:', {
        status: response.status,
        bodyLength: response.body?.length,
      });

      // Then: Should succeed
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should allow authenticated users to access public group feed', async () => {
      // Given: Public group exists
      // When: Authenticated user requests feed
      const response = await request(app)
        .get(`/api/groups/${publicGroup.slug}/feed`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Authenticated user access to public group:', {
        status: response.status,
        bodyLength: response.body?.length,
      });

      // Then: Should succeed
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
