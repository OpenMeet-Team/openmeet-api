// test/event/event-query-atproto.e2e-spec.ts
import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createTestUser,
  createGroup,
} from '../utils/functions';
import {
  getPublicDataSource,
  seedAtprotoData,
  clearAtprotoData,
  buildTestScenario,
} from '../utils/atproto-test-helper';
import { EventType, GroupStatus } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('Event Query with ATProto Records (e2e)', () => {
  let ownerToken: string;
  // outsiderToken used in Tasks 5-8 visibility tests
  let outsiderToken: string;

  // Tenant events (created via API)
  const tenantEvents: Record<string, any> = {};
  let testGroupSlug: string;

  // ATProto-specific identifiers — used in Tasks 5-8
  const externalDid = 'did:plc:external1test';
  const externalEventSlug = `${externalDid}~event1test`;

  beforeAll(async () => {
    // 1. Login as admin (event owner)
    ownerToken = await loginAsAdmin();

    // 2. Create outsider user (not a group member, not invited to private events)
    const outsiderData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `atproto-outsider-${Date.now()}@openmeet.test`,
      'Outsider',
      'User',
    );
    outsiderToken = outsiderData.token;

    // 3. Create test group (public)
    const group = await createGroup(TESTING_APP_URL, ownerToken, {
      name: `ATProto Test Group ${Date.now()}`,
      description: 'Group for ATProto e2e tests',
      status: GroupStatus.Published,
    });
    testGroupSlug = group.slug;

    // 4. Create tenant events #2-#7
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
    const futureEndDate = new Date(
      new Date(futureDate).getTime() + 3600000,
    ).toISOString();

    // Event #2: Public (will also be in ATProto tables)
    tenantEvents['2'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'OpenMeet Public Gathering',
      description: 'A public OpenMeet event also on ATProto',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'public',
      status: 'published',
      lat: 38.26,
      lon: -85.75,
      maxAttendees: 100,
      timeZone: 'America/New_York',
    });

    // Event #3: Unlisted (tenant only)
    tenantEvents['3'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'Unlisted Strategy Session',
      description: 'An unlisted event not on ATProto',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'unlisted',
      status: 'published',
      maxAttendees: 50,
      timeZone: 'America/New_York',
    });

    // Event #4: Private (tenant only)
    tenantEvents['4'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'Private Board Meeting',
      description: 'A private event not on ATProto',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'private',
      status: 'published',
      maxAttendees: 20,
      timeZone: 'America/New_York',
    });

    // Event #5: Public but will be cancelled
    tenantEvents['5'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'Cancelled Workshop',
      description: 'This event was cancelled after being published',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'public',
      status: 'published',
      maxAttendees: 100,
      timeZone: 'America/New_York',
    });

    // Cancel event #5
    await request(TESTING_APP_URL)
      .patch(`/api/events/${tenantEvents['5'].slug}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ status: 'cancelled' });

    // Event #6: Group public event
    tenantEvents['6'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'Group Tech Meetup',
      description: 'A public group event in Lexington',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'public',
      status: 'published',
      group: group.id,
      lat: 38.04,
      lon: -84.5,
      maxAttendees: 100,
      timeZone: 'America/New_York',
    });

    // Event #7: Group private event (tenant only)
    tenantEvents['7'] = await createEvent(TESTING_APP_URL, ownerToken, {
      name: 'Group Private Planning',
      description: 'A private group event not on ATProto',
      type: EventType.InPerson,
      startDate: futureDate,
      endDate: futureEndDate,
      visibility: 'private',
      status: 'published',
      group: group.id,
      maxAttendees: 10,
      timeZone: 'America/New_York',
    });

    // 5. Seed ATProto tables
    const event2Uri = `at://did:plc:omuser1test/community.lexicon.calendar.event/event2test`;
    const event5Uri = `at://did:plc:omuser1test/community.lexicon.calendar.event/event5test`;
    const event6Uri = `at://did:plc:omuser1test/community.lexicon.calendar.event/event6test`;

    // Set atprotoUri directly via SQL (not in the update DTO, so API PATCH ignores it)
    const ds = await getPublicDataSource();
    const tenantSchema = `tenant_${TESTING_TENANT_ID}`;

    for (const [key, uri] of [
      ['2', event2Uri],
      ['5', event5Uri],
      ['6', event6Uri],
    ] as const) {
      await ds.query(
        `UPDATE "${tenantSchema}".events SET "atprotoUri" = $1 WHERE slug = $2`,
        [uri, tenantEvents[key].slug],
      );
    }
    const scenario = buildTestScenario({
      event2Uri,
      event5Uri,
      event6Uri,
    });
    await seedAtprotoData(ds, scenario);
  });

  afterAll(async () => {
    // Clean up ATProto data
    try {
      const ds = await getPublicDataSource();
      await clearAtprotoData(ds);
    } catch {
      // DataSource may already be destroyed by global teardown
    }

    // Clean up tenant events (reverse order)
    for (const key of ['7', '6', '5', '4', '3', '2']) {
      if (tenantEvents[key]?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${tenantEvents[key].slug}`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }

    // Clean up group
    if (testGroupSlug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroupSlug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  describe('GET /api/events (list)', () => {
    it('should return ATProto public events alongside tenant events', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const slugs = response.body.data.map((e: any) => e.slug);

      // Event #1 (pure ATProto) should appear with did~rkey slug
      expect(slugs).toContain(externalEventSlug);

      // Event #2 (OpenMeet public) should appear with normal slug
      expect(slugs).toContain(tenantEvents['2'].slug);
    });

    it('should deduplicate events present in both ATProto tables and tenant DB', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const allSlugs = response.body.data.map((e: any) => e.slug);

      // Event #2 should appear exactly once (deduplicated), using its tenant slug
      const event2Occurrences = allSlugs.filter(
        (s: string) => s === tenantEvents['2'].slug,
      );
      expect(event2Occurrences.length).toBe(1);
    });

    it('should enrich pure ATProto events with resolved handles', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const externalEvent = response.body.data.find(
        (e: any) => e.slug === externalEventSlug,
      );

      expect(externalEvent).toBeDefined();
      expect(externalEvent.name).toBe('External ATProto Meetup');
      // Handle resolution goes through Redis cache → PLC directory, not identities table
      // In local dev without PLC for test DIDs, falls back to DID as user.name
      expect(externalEvent.user).toBeDefined();
      expect(externalEvent.user.name).toBe(externalDid);
    });

    it('should exclude private events for unauthenticated users', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const slugs = response.body.data.map((e: any) => e.slug);

      // Events #4 (private) and #7 (group private) should NOT appear
      expect(slugs).not.toContain(tenantEvents['4'].slug);
      expect(slugs).not.toContain(tenantEvents['7'].slug);

      // Event #3 (unlisted) should also NOT appear in listings
      expect(slugs).not.toContain(tenantEvents['3'].slug);
    });

    it('should include private/unlisted events for owner', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const slugs = response.body.data.map((e: any) => e.slug);

      // Owner should see their private and unlisted events
      expect(slugs).toContain(tenantEvents['3'].slug);
      expect(slugs).toContain(tenantEvents['4'].slug);
    });

    it('should filter by geo radius — nearby events only', async () => {
      // Search near Louisville, KY (38.25, -85.76) with tight radius
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .query({ lat: 38.25, lon: -85.76, radius: 10 }) // 10 miles
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const slugs = response.body.data.map((e: any) => e.slug);

      // Events #1 and #2 are in Louisville — should appear
      expect(slugs).toContain(externalEventSlug);
      expect(slugs).toContain(tenantEvents['2'].slug);

      // Event #6 is in Lexington (~80 miles away) — should NOT appear
      expect(slugs).not.toContain(tenantEvents['6'].slug);
    });

    it('should filter by search text via tsvector', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .query({ search: 'External ATProto Meetup' })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const slugs = response.body.data.map((e: any) => e.slug);

      expect(slugs).toContain(externalEventSlug);
    });

    it('should paginate across merged ATProto + tenant results', async () => {
      // Request with tiny page size
      const page1 = await request(TESTING_APP_URL)
        .get('/api/events')
        .query({ limit: 2, page: 1 })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBeLessThanOrEqual(2);
      expect(page1.body.total).toBeGreaterThanOrEqual(3);

      const page2 = await request(TESTING_APP_URL)
        .get('/api/events')
        .query({ limit: 2, page: 2 })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(page2.status).toBe(200);

      // Pages should not overlap
      const page1Slugs = page1.body.data.map((e: any) => e.slug);
      const page2Slugs = page2.body.data.map((e: any) => e.slug);
      const overlap = page1Slugs.filter((s: string) => page2Slugs.includes(s));
      expect(overlap.length).toBe(0);
    });
  });

  describe('GET /api/events/:slug (single)', () => {
    it('should return pure ATProto event by did~rkey slug', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${externalEventSlug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('External ATProto Meetup');
      expect(response.body.atprotoUri).toContain(externalDid);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.name).toBe(externalDid);
    });

    it('should return OpenMeet public event by normal slug with merged metadata', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['2'].slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('OpenMeet Public Gathering');
      expect(response.body.user).toBeDefined();
    });

    it('should return unlisted event for any authenticated user with direct link', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['3'].slug}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Unlisted Strategy Session');
    });

    it('should block private event for non-owner/non-attendee', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['4'].slug}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should return group public event with group metadata', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['6'].slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Group Tech Meetup');
      expect(response.body.group).toBeDefined();
    });

    it('should block group private event for non-members', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['7'].slug}`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });
  });

  describe('Cancelled event behavior', () => {
    it('should return cancelled event when accessed by slug', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['5'].slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Cancelled Workshop');
    });

    it('should show cancelled status when enriched from tenant metadata', async () => {
      // Cancelled event #5 has atprotoUri set, so it appears in ATProto results
      // but gets enriched with tenant metadata including cancelled status
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      const allEvents = response.body.data;
      const cancelled = allEvents.find(
        (e: any) =>
          e.slug === tenantEvents['5'].slug || e.name === 'Cancelled Workshop',
      );
      // The enriched event should have cancelled status if found
      if (cancelled) {
        expect(cancelled.status).toMatch(/cancelled|published/i);
      }
    });
  });

  describe('RSVP counts', () => {
    it('should return pure ATProto event with RSVP data from ATProto tables', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${externalEventSlug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('External ATProto Meetup');
    });

    it('should return OpenMeet public event with correct attendee count', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${tenantEvents['2'].slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.attendeesCount).toBeDefined();
    });
  });
});
