import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';
import {
  getPublicDataSource,
  seedAtprotoData,
  buildEventRecord,
} from '../utils/atproto-test-helper';

jest.setTimeout(120000);

describe('Search Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let regularUserToken: string;

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

    // Seed the public event into Contrail so searchAllEvents (which queries Contrail
    // for public events) can find it. The search read path queries Contrail first;
    // the async PDS→Jetstream→Contrail pipeline may not have run yet.
    //
    // We read the REAL atprotoUri that the API set after publishing to PDS, wait
    // briefly for Contrail ingestion, then seed manually if it hasn't arrived.
    // Using the real URI is critical — enrichRecords() links Contrail records to
    // tenant events by matching atprotoUri, so the URIs must be identical.
    try {
      const publicEvent = testData.events.public as any;

      // Wait for Contrail to ingest the public event from the PDS→Jetstream pipeline.
      // CI uses FLUSH_INTERVAL_MS=0 for instant flush.
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Read the real atprotoUri set by the API after PDS publish
      const eventResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${publicEvent.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const realAtprotoUri = eventResponse.body?.atprotoUri;

      if (realAtprotoUri) {
        const publicDs = await getPublicDataSource();

        // Check whether Contrail already ingested this event
        const existing = await publicDs.query(
          `SELECT uri FROM records_community_lexicon_calendar_event WHERE uri = $1`,
          [realAtprotoUri],
        );

        if (existing.length === 0) {
          // Contrail hasn't ingested yet — seed directly using the real URI
          const did = realAtprotoUri.split('/')[2];
          const rkey = realAtprotoUri.split('/').pop();
          await seedAtprotoData(publicDs, {
            events: [
              {
                uri: realAtprotoUri,
                did,
                rkey,
                cid: `bafysearchtest${timestamp}`,
                record: buildEventRecord({
                  name: publicEvent.name,
                  description: publicEvent.description,
                  startsAt: publicEvent.startDate,
                  endsAt: publicEvent.endDate,
                }),
              },
            ],
            rsvps: [],
            identities: [
              {
                did,
                handle: `searchtest.test`,
                pds: 'https://pds.test',
              },
            ],
            geoEntries: [],
          });
        }

        // Ensure search_vector is populated (whether Contrail ingested or we seeded)
        await publicDs.query(
          `UPDATE records_community_lexicon_calendar_event
           SET search_vector = to_tsvector('english',
             COALESCE(record->>'name', '') || ' ' ||
             COALESCE(record->>'description', ''))
           WHERE uri = $1 AND search_vector IS NULL`,
          [realAtprotoUri],
        );
      } else {
        console.warn(
          'Public event has no atprotoUri — Contrail seeding skipped. ' +
            'Search test may fail if Contrail pipeline did not run.',
        );
      }
    } catch (err) {
      console.error('Failed to seed Contrail for search test:', err);
    }

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
      status: 'published',
      categories: [1],
    });

    testData.groups.unlisted = await createGroup(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Unlisted Group ${timestamp}`,
      slug: `searchtest-unlisted-group-${timestamp}`,
      description: 'Unlisted group for search visibility testing',
      visibility: 'unlisted',
      status: 'published',
      categories: [1],
    });

    testData.groups.private = await createGroup(TESTING_APP_URL, adminToken, {
      name: `SEARCHTEST Private Group ${timestamp}`,
      slug: `searchtest-private-group-${timestamp}`,
      description: 'Private group for search visibility testing',
      visibility: 'private',
      status: 'published',
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
});
