import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin, createEvent, createTestUser } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('Event Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let regularUserToken: string;

  const testEvents = {
    public: null,
    authenticated: null, // TODO: Will be renamed to 'unlisted' in visibility model v2
    private: null,
  };

  beforeAll(async () => {
    // Login as admin
    adminToken = await loginAsAdmin();

    // Create a regular user
    const regularUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `visibility-test-${Date.now()}@openmeet.test`,
      'Regular',
      'User',
    );
    regularUserToken = regularUserData.token;

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
      name: 'Unlisted Event - Visibility Test',
      slug: `unlisted-event-${Date.now()}`,
      description: 'This is an unlisted event for testing visibility',
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

    it('should allow unauthenticated users to view attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.public.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
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

  describe('Unlisted Events', () => {
    it('should allow unauthenticated users with link to view event details', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Unlisted Event - Visibility Test');
      expect(response.body.description).toBeDefined();
      expect(response.body.location).toBeDefined();
    });

    it('should allow unauthenticated users to view attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.authenticated.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
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

  describe('Private Events', () => {
    it('should return 403 for unauthenticated users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should block unauthenticated users from viewing attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should block non-invited authenticated users from viewing attendee list', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testEvents.private.slug}/attendees`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
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

  describe('ATProto-Only Public Events', () => {
    const atprotoDid = 'did:plc:visibilitytest1';
    const atprotoRkey = 'vistest1';
    const atprotoSlug = `${atprotoDid}~${atprotoRkey}`;
    const atprotoUri = `at://${atprotoDid}/community.lexicon.calendar.event/${atprotoRkey}`;

    beforeAll(async () => {
      const { getPublicDataSource } = await import(
        '../utils/atproto-test-helper'
      );
      const { seedAtprotoData } = await import('../utils/atproto-test-helper');

      const ds = await getPublicDataSource();
      const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
      const futureEndDate = new Date(
        new Date(futureDate).getTime() + 3600000,
      ).toISOString();

      await seedAtprotoData(ds, {
        events: [
          {
            uri: atprotoUri,
            did: atprotoDid,
            rkey: atprotoRkey,
            cid: 'bafyvistest1',
            record: {
              $type: 'community.lexicon.calendar.event',
              name: 'ATProto Visibility Test Event',
              description: 'Pure ATProto event for visibility testing',
              startsAt: futureDate,
              endsAt: futureEndDate,
              mode: 'community.lexicon.calendar.event#inperson',
              locations: [],
            },
          },
        ],
        rsvps: [],
        identities: [
          {
            did: atprotoDid,
            handle: 'visibility-tester.test',
            pds: 'https://pds.test',
          },
        ],
        geoEntries: [],
      });
    });

    afterAll(async () => {
      const { getPublicDataSource } = await import(
        '../utils/atproto-test-helper'
      );
      const ds = await getPublicDataSource();
      await ds.query(
        `DELETE FROM records_community_lexicon_calendar_event WHERE uri = $1`,
        [atprotoUri],
      );
      await ds.query(`DELETE FROM identities WHERE did = $1`, [atprotoDid]);
    });

    it('should allow unauthenticated access to ATProto-only public event via did~rkey slug', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${atprotoSlug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('ATProto Visibility Test Event');
      expect(response.body.atprotoUri).toBe(atprotoUri);
    });
  });
});
