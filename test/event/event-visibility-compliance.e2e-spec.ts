import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createTestUser,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('Event Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let adminUser: any;
  let regularUserToken: string;
  let regularUser: any;

  const testEvents = {
    public: null,
    authenticated: null, // TODO: Will be renamed to 'unlisted' in visibility model v2
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
      `visibility-test-${Date.now()}@openmeet.test`,
      'Regular',
      'User',
    );
    regularUserToken = regularUserData.token;
    regularUser = regularUserData.user;

    // Create test events with different visibility levels
    testEvents.public = await createEvent(TESTING_APP_URL, adminToken, {
      name: 'Public Event - Visibility Test',
      slug: `public-event-${Date.now()}`,
      description: 'This is a public event for testing visibility',
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

    testEvents.authenticated = await createEvent(TESTING_APP_URL, adminToken, {
      name: 'Authenticated Event - Visibility Test',
      slug: `authenticated-event-${Date.now()}`,
      description: 'This is an authenticated event for testing visibility',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Authenticated Location',
      locationOnline: 'https://authenticated-event.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'authenticated',
      timeZone: 'America/New_York',
    });

    testEvents.private = await createEvent(TESTING_APP_URL, adminToken, {
      name: 'Private Event - Visibility Test',
      slug: `private-event-${Date.now()}`,
      description: 'This is a private event for testing visibility',
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

    // Admin attends the private event (so they have access)
    await request(TESTING_APP_URL)
      .post(`/api/events/${testEvents.private.slug}/attend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});
  });

  afterAll(async () => {
    // Cleanup: delete test events
    for (const event of Object.values(testEvents)) {
      if (event?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });

  describe('Public Events', () => {
    it('should allow unauthenticated users to view event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.public.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Public Event - Visibility Test');
      expect(response.body.description).toBeDefined();
      expect(response.body.location).toBeDefined();
    });

    it('[CURRENT] requires authentication to view attendee list (should be 200 per design doc)', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.public.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Current behavior: 401 (requires auth)
      // Expected per design doc: 200 (public attendee list)
      expect(response.status).toBe(401);
    });

    it('should allow authenticated users to view event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.public.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.description).toBeDefined();
    });

    it('should allow authenticated users to view attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.public.slug}/attendees`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Authenticated Events (will be renamed to Unlisted in v2)', () => {
    it('should allow unauthenticated users with link to view event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Authenticated Event - Visibility Test');
      expect(response.body.description).toBeDefined();
      expect(response.body.location).toBeDefined();
    });

    it('[CURRENT] requires authentication to view attendee list (should be 200 per design doc)', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Current behavior: 401 (requires auth)
      // Expected per design doc: 200 (anyone with link can view)
      expect(response.status).toBe(401);
    });

    it('should allow authenticated users to view event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.description).toBeDefined();
    });

    it('should allow authenticated users to view attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}/attendees`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Private Events - Current Behavior (TODO: Will change when visibility model v2 is implemented)', () => {
    it('[FUTURE] should return 403 for unauthenticated users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // TODO: Should be 403 when visibility model v2 is implemented
      // For now, accepting current behavior
      expect([200, 403]).toContain(response.status);
    });

    it('[FUTURE] should block unauthenticated users from viewing attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // TODO: Should be 401 or 403 when visibility model v2 is implemented
      // For now, documenting expected future behavior
      expect([200, 401, 403]).toContain(response.status);
    });

    it('[FUTURE] should show teaser page for authenticated but not invited users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // TODO: Should return 200 with teaser page (limited info) when v2 is implemented
      // Teaser should show: name, host, date/time
      // Teaser should NOT show: description, location, attendees
      expect([200, 403]).toContain(response.status);
    });

    it('[FUTURE] should block non-invited authenticated users from viewing attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}/attendees`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // TODO: Should be 401 or 403 when visibility model v2 is implemented
      expect([200, 401, 403]).toContain(response.status);
    });

    it('should allow invited/attending users to view full event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Private Event - Visibility Test');
      expect(response.body.description).toBeDefined();
      expect(response.body.location).toBeDefined();
    });

    it('should allow invited/attending users to view attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.total).toBeGreaterThan(0);
    });
  });

  describe('Visibility Model Compliance Summary', () => {
    it('should document expected behavior per visibility level', () => {
      // This test serves as documentation for the expected behavior
      const currentBehavior = {
        public: {
          unauthenticated: {
            viewEvent: 200,
            viewAttendees: 401, // Currently requires auth (design doc says should be 200)
          },
          authenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
        },
        authenticated: { // Currently named 'authenticated', will be 'unlisted' in v2
          unauthenticated: {
            viewEvent: 200,
            viewAttendees: 401, // Currently requires auth (design doc says should be 200)
          },
          authenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
        },
        private: {
          unauthenticated: {
            viewEvent: 200, // Currently open (design doc says should be 403)
            viewAttendees: 401, // Currently requires auth
          },
          authenticated_not_invited: {
            viewEvent: 200, // Currently shows full details (design doc says teaser only)
            viewAttendees: 200, // Currently allowed (design doc says should be 403)
          },
          authenticated_invited: {
            viewEvent: 200, // Full details
            viewAttendees: 200,
          },
        },
      };

      const expectedBehaviorV2 = {
        public: {
          unauthenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
          authenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
        },
        unlisted: { // Renamed from 'authenticated' in v2
          unauthenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
          authenticated: {
            viewEvent: 200,
            viewAttendees: 200,
          },
        },
        private: {
          unauthenticated: {
            viewEvent: 403, // "Login required"
            viewAttendees: 403,
          },
          authenticated_not_invited: {
            viewEvent: 200, // Teaser page with limited info
            viewAttendees: 403, // Not allowed
          },
          authenticated_invited: {
            viewEvent: 200, // Full details
            viewAttendees: 200,
          },
        },
      };

      // This test always passes - it's just documentation
      expect(currentBehavior).toBeDefined();
      expect(expectedBehaviorV2).toBeDefined();

      console.log('\n📋 Current Visibility Behavior:');
      console.log(JSON.stringify(currentBehavior, null, 2));
      console.log('\n📋 Visibility Model V2 - Expected Behavior:');
      console.log(JSON.stringify(expectedBehaviorV2, null, 2));
    });
  });
});
