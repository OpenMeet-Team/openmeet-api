import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('Search Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let regularUserToken: string;
  let regularUser: any;

  const testData = {
    events: {
      public: null,
      unlisted: null,
      private: null,
    },
    groups: {
      public: null,
      unlisted: null,
      private: null,
    },
  };

  beforeAll(async () => {
    // Login as admin
    adminToken = await loginAsAdmin();

    // Create a regular user
    const regularUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `search-test-${Date.now()}@openmeet.test`,
      'Search',
      'Tester',
    );
    regularUserToken = regularUserData.token;
    regularUser = regularUserData.user;

    // Create test events with different visibility levels
    const timestamp = Date.now();

    testData.events.public = await createEvent(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Public Event ${timestamp}`,
      slug: `searchtest-public-event-${timestamp}`,
      description: 'Public event for search visibility testing',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Public Location',
      locationOnline: 'https://public-event.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'public',
      timeZone: 'America/New_York',
    });

    testData.events.unlisted = await createEvent(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Unlisted Event ${timestamp}`,
      slug: `searchtest-unlisted-event-${timestamp}`,
      description: 'Unlisted event for search visibility testing',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Unlisted Location',
      locationOnline: 'https://unlisted-event.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'unlisted',
      timeZone: 'America/New_York',
    });

    testData.events.private = await createEvent(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Private Event ${timestamp}`,
      slug: `searchtest-private-event-${timestamp}`,
      description: 'Private event for search visibility testing',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Private Location',
      locationOnline: 'https://private-event.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'private',
      timeZone: 'America/New_York',
    });

    // Create test groups with different visibility levels
    testData.groups.public = await createGroup(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Public Group ${timestamp}`,
      slug: `searchtest-public-group-${timestamp}`,
      description: 'Public group for search visibility testing',
      visibility: 'public',
      categories: [1],
    });

    testData.groups.unlisted = await createGroup(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Unlisted Group ${timestamp}`,
      slug: `searchtest-unlisted-group-${timestamp}`,
      description: 'Unlisted group for search visibility testing',
      visibility: 'unlisted',
      categories: [1],
    });

    testData.groups.private = await createGroup(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Private Group ${timestamp}`,
      slug: `searchtest-private-group-${timestamp}`,
      description: 'Private group for search visibility testing',
      visibility: 'private',
      categories: [1],
    });
  });

  afterAll(async () => {
    // Cleanup: delete test events
    for (const event of Object.values(testData.events)) {
      if (event?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }

    // Cleanup: delete test groups
    for (const group of Object.values(testData.groups)) {
      if (group?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });

  describe('Unauthenticated Search', () => {
    it('should only return public events in search results', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/home/search')
        .query({ search: 'SEARCHTEST', page: 1, limit: 50 })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
      expect(response.body.events.data).toBeInstanceOf(Array);

      const eventSlugs = response.body.events.data.map((e: any) => e.slug);

      // Should include public event
      expect(eventSlugs).toContain(testData.events.public.slug);

      // Should NOT include unlisted or private events
      expect(eventSlugs).not.toContain(testData.events.unlisted.slug);
      expect(eventSlugs).not.toContain(testData.events.private.slug);
    });

    it('should only return public groups in search results', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/home/search')
        .query({ search: 'SEARCHTEST', page: 1, limit: 50 })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeDefined();
      expect(response.body.groups.data).toBeInstanceOf(Array);

      const groupSlugs = response.body.groups.data.map((g: any) => g.slug);

      // Should include public group
      expect(groupSlugs).toContain(testData.groups.public.slug);

      // Should NOT include unlisted or private groups
      expect(groupSlugs).not.toContain(testData.groups.unlisted.slug);
      expect(groupSlugs).not.toContain(testData.groups.private.slug);
    });
  });

  describe('Authenticated Search', () => {
    it('should only return public events (not unlisted or private)', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/home/search')
        .query({ search: 'SEARCHTEST', page: 1, limit: 50 })
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
      expect(response.body.events.data).toBeInstanceOf(Array);

      const eventSlugs = response.body.events.data.map((e: any) => e.slug);

      // Should include public event
      expect(eventSlugs).toContain(testData.events.public.slug);

      // Should NOT include unlisted or private events (even when authenticated)
      expect(eventSlugs).not.toContain(testData.events.unlisted.slug);
      expect(eventSlugs).not.toContain(testData.events.private.slug);
    });

    it('should only return public groups (not unlisted or private)', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/home/search')
        .query({ search: 'SEARCHTEST', page: 1, limit: 50 })
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeDefined();
      expect(response.body.groups.data).toBeInstanceOf(Array);

      const groupSlugs = response.body.groups.data.map((g: any) => g.slug);

      // Should include public group
      expect(groupSlugs).toContain(testData.groups.public.slug);

      // Should NOT include unlisted or private groups (even when authenticated)
      expect(groupSlugs).not.toContain(testData.groups.unlisted.slug);
      expect(groupSlugs).not.toContain(testData.groups.private.slug);
    });
  });

  describe('Search Compliance Summary', () => {
    it('should document expected search visibility behavior', () => {
      const expectedBehavior = {
        search_results: {
          public: {
            events: 'Visible in search',
            groups: 'Visible in search',
          },
          unlisted: {
            events: 'NOT in search (only via direct link)',
            groups: 'NOT in search (only via direct link)',
          },
          private: {
            events: 'NOT in search (invite-only)',
            groups: 'NOT in search (invite-only)',
          },
        },
        notes: [
          'Search visibility is independent of authentication status',
          'Even authenticated users do not see unlisted/private items in search',
          'Unlisted/private items are only accessible via direct link',
        ],
      };

      expect(expectedBehavior).toBeDefined();
      console.log('\n📋 Expected Search Visibility Behavior:');
      console.log(JSON.stringify(expectedBehavior, null, 2));
    });
  });
});
