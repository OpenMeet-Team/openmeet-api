import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  loginAsAdmin,
  createGroup,
  createTestUser,
} from '../utils/functions';

jest.setTimeout(120000);

describe('Group Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let adminUser: any;
  let regularUserToken: string;
  let regularUser: any;

  const testGroups = {
    public: null,
    unlisted: null,
    private: null,
  };

  beforeAll(async () => {
    // Login as admin
    adminToken = await loginAsAdmin();
    const adminResponse = await request(TESTING_APP_URL)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    adminUser = adminResponse.body;

    // Create a regular user
    const regularUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `group-visibility-test-${Date.now()}@openmeet.test`,
      'GroupTest',
      'User',
    );
    regularUserToken = regularUserData.token;
    regularUser = regularUserData.user;

    // Create test groups with different visibility levels
    testGroups.public = await createGroup(TESTING_APP_URL, adminToken, {
      name: 'Public Group - Visibility Test',
      slug: `public-group-${Date.now()}`,
      description: 'This is a public group for testing visibility',
      visibility: 'public',
      categories: [1],
    });

    testGroups.unlisted = await createGroup(TESTING_APP_URL, adminToken, {
      name: 'Unlisted Group - Visibility Test',
      slug: `unlisted-group-${Date.now()}`,
      description: 'This is an unlisted group for testing visibility',
      visibility: 'unlisted',
      categories: [1],
    });

    testGroups.private = await createGroup(TESTING_APP_URL, adminToken, {
      name: 'Private Group - Visibility Test',
      slug: `private-group-${Date.now()}`,
      description: 'This is a private group for testing visibility',
      visibility: 'private',
      categories: [1],
    });
  });

  afterAll(async () => {
    // Cleanup: delete test groups
    for (const group of Object.values(testGroups)) {
      if (group?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });

  describe('Public Groups', () => {
    it('should allow unauthenticated users to view group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.public.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Public Group - Visibility Test');
      expect(response.body.description).toBeDefined();
    });

    it('should allow unauthenticated users to view member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.public.slug}/members`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should allow authenticated users to view group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.public.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.description).toBeDefined();
    });

    it('should allow authenticated users to view member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.public.slug}/members`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Unlisted Groups', () => {
    it('should allow unauthenticated users with link to view group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.unlisted.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Unlisted Group - Visibility Test');
      expect(response.body.description).toBeDefined();
    });

    it('should allow unauthenticated users to view member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.unlisted.slug}/members`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });

    it('should allow authenticated users to view group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.unlisted.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.description).toBeDefined();
    });

    it('should allow authenticated users to view member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.unlisted.slug}/members`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Private Groups', () => {
    it('should return 403 for unauthenticated users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should block unauthenticated users from viewing member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}/members`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should block non-member authenticated users from viewing group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should block non-member authenticated users from viewing member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}/members`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should allow group members to view full group details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Private Group - Visibility Test');
      expect(response.body.description).toBeDefined();
    });

    it('should allow group members to view member list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroups.private.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Visibility Model Compliance Summary', () => {
    it('should document expected behavior per visibility level', () => {
      const expectedBehavior = {
        public: {
          unauthenticated: {
            viewGroup: 200,
            viewMembers: 200,
          },
          authenticated: {
            viewGroup: 200,
            viewMembers: 200,
          },
        },
        unlisted: {
          unauthenticated: {
            viewGroup: 200,
            viewMembers: 200,
          },
          authenticated: {
            viewGroup: 200,
            viewMembers: 200,
          },
        },
        private: {
          unauthenticated: {
            viewGroup: 403,
            viewMembers: 403,
          },
          authenticated_non_member: {
            viewGroup: 403,
            viewMembers: 403,
          },
          authenticated_member: {
            viewGroup: 200,
            viewMembers: 200,
          },
        },
      };

      expect(expectedBehavior).toBeDefined();
      console.log('\n📋 Expected Group Visibility Behavior:');
      console.log(JSON.stringify(expectedBehavior, null, 2));
    });
  });
});
