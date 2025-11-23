import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('Visibility Cross-Cutting Concerns (e2e)', () => {
  let adminToken: string;
  let regularUserToken: string;
  let otherUserToken: string;

  const testData = {
    publicGroup: null,
    unlistedGroup: null,
    privateGroup: null,
    publicEvent: null,
    unlistedEvent: null,
    privateEvent: null,
    groupPublicEvent: null,
    groupUnlistedEvent: null,
    groupPrivateEvent: null,
  };

  beforeAll(async () => {
    // Login as admin
    adminToken = await loginAsAdmin();

    // Create two regular users
    const regularUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `visibility-cross-${Date.now()}@openmeet.test`,
      'Regular',
      'User',
    );
    regularUserToken = regularUserData.token;

    const otherUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `visibility-other-${Date.now()}@openmeet.test`,
      'Other',
      'User',
    );
    otherUserToken = otherUserData.token;

    const timestamp = Date.now();

    // Create groups
    testData.publicGroup = await createGroup(TESTING_APP_URL, adminToken, {
      name: `Public Group ${timestamp}`,
      slug: `public-group-cross-${timestamp}`,
      description: 'Public group for cross-cutting tests',
      visibility: 'public',
      categories: [1],
    });

    testData.unlistedGroup = await createGroup(TESTING_APP_URL, adminToken, {
      name: `Unlisted Group ${timestamp}`,
      slug: `unlisted-group-cross-${timestamp}`,
      description: 'Unlisted group for cross-cutting tests',
      visibility: 'unlisted',
      categories: [1],
    });

    testData.privateGroup = await createGroup(TESTING_APP_URL, adminToken, {
      name: `Private Group ${timestamp}`,
      slug: `private-group-cross-${timestamp}`,
      description: 'Private group for cross-cutting tests',
      visibility: 'private',
      requireApproval: false,
      categories: [1],
    });

    // Create standalone events
    testData.publicEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Public Event ${timestamp}`,
      slug: `public-event-cross-${timestamp}`,
      description: 'Public event for cross-cutting tests',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Public Location',
      locationOnline: 'https://public.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'public',
      timeZone: 'America/New_York',
    });

    testData.unlistedEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Unlisted Event ${timestamp}`,
      slug: `unlisted-event-cross-${timestamp}`,
      description: 'Unlisted event for cross-cutting tests',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Unlisted Location',
      locationOnline: 'https://unlisted.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'unlisted',
      timeZone: 'America/New_York',
    });

    testData.privateEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Private Event ${timestamp}`,
      slug: `private-event-cross-${timestamp}`,
      description: 'Private event for cross-cutting tests',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Private Location',
      locationOnline: 'https://private.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'private',
      timeZone: 'America/New_York',
    });

    // Create group events (events associated with groups)
    testData.groupPublicEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Group Public Event ${timestamp}`,
      slug: `group-public-event-${timestamp}`,
      description: 'Public event in public group',
      group: { id: testData.publicGroup.id },
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Public Location',
      locationOnline: 'https://group-public.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      visibility: 'public',
      timeZone: 'America/New_York',
    });

    testData.groupUnlistedEvent = await createEvent(
      TESTING_APP_URL,
      adminToken,
      {
        name: `Group Unlisted Event ${timestamp}`,
        slug: `group-unlisted-event-${timestamp}`,
        description: 'Unlisted event in private group',
        group: { id: testData.privateGroup.id },
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
        type: EventType.Hybrid,
        location: 'Unlisted Location',
        locationOnline: 'https://group-unlisted.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'published',
        visibility: 'unlisted',
        timeZone: 'America/New_York',
      },
    );

    testData.groupPrivateEvent = await createEvent(
      TESTING_APP_URL,
      adminToken,
      {
        name: `Group Private Event ${timestamp}`,
        slug: `group-private-event-${timestamp}`,
        description: 'Private event in private group',
        group: { id: testData.privateGroup.id },
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
        type: EventType.Hybrid,
        location: 'Private Location',
        locationOnline: 'https://group-private.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'published',
        visibility: 'private',
        timeZone: 'America/New_York',
      },
    );

    // Add regularUser to private group
    await request(TESTING_APP_URL)
      .post(`/api/groups/${testData.privateGroup.slug}/join`)
      .set('Authorization', `Bearer ${regularUserToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Have admin attend the private event
    await request(TESTING_APP_URL)
      .post(`/api/events/${testData.privateEvent.slug}/attend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});
  });

  afterAll(async () => {
    // Cleanup events
    for (const key of Object.keys(testData)) {
      if (key.includes('Event') && testData[key]?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${testData[key].slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }

    // Cleanup groups
    for (const key of Object.keys(testData)) {
      if (key.includes('Group') && testData[key]?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${testData[key].slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });

  describe('Guest Home Page', () => {
    it('should NOT show unlisted or private events and groups', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/home/guest')
        .query({ limit: 100 })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
      expect(response.body.groups).toBeDefined();

      const eventSlugs = response.body.events.map((e: any) => e.slug);
      const groupSlugs = response.body.groups.map((g: any) => g.slug);

      // Key compliance check: Should NOT include unlisted or private items
      expect(eventSlugs).not.toContain(testData.unlistedEvent.slug);
      expect(eventSlugs).not.toContain(testData.privateEvent.slug);
      expect(groupSlugs).not.toContain(testData.unlistedGroup.slug);
      expect(groupSlugs).not.toContain(testData.privateGroup.slug);
    });
  });

  describe('Group Events Visibility Inheritance', () => {
    it('should allow unauthenticated users to view public event in public group', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testData.groupPublicEvent.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });

    it('should allow unauthenticated users to view unlisted event in private group', async () => {
      // Unlisted events are accessible via direct link regardless of group
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testData.groupUnlistedEvent.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });

    it('should block unauthenticated users from viewing private event', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testData.groupPrivateEvent.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should allow group members to view private event in their group', async () => {
      // regularUser is a member of privateGroup
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testData.groupPrivateEvent.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });

    it('should block non-members from viewing private event in private group', async () => {
      // otherUser is NOT a member of privateGroup
      const response = await request(TESTING_APP_URL)
        .get(`/api/events/${testData.groupPrivateEvent.slug}`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });
  });

  describe('Activity Feed Visibility', () => {
    it('should only show public items in sitewide activity feed for unauthenticated users', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/feed')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Activities should only reference public events/groups
      const activities = response.body;
      const eventIds = activities
        .filter((a: any) => a.eventId)
        .map((a: any) => a.eventId);
      const groupIds = activities
        .filter((a: any) => a.groupId)
        .map((a: any) => a.groupId);

      // Should NOT include unlisted or private items
      expect(eventIds).not.toContain(testData.unlistedEvent.id);
      expect(eventIds).not.toContain(testData.privateEvent.id);
      expect(groupIds).not.toContain(testData.unlistedGroup.id);
      expect(groupIds).not.toContain(testData.privateGroup.id);
    });
  });

  describe('Visibility Model Documentation', () => {
    it('should document cross-cutting visibility expectations', () => {
      const expectations = {
        search: {
          public: 'Visible in search results',
          unlisted: 'NOT visible in search',
          private: 'NOT visible in search',
        },
        home_pages: {
          public: 'Visible on guest/user home',
          unlisted: 'NOT visible on home pages',
          private: 'NOT visible on home pages',
        },
        activity_feed: {
          public: 'Visible in sitewide feed',
          unlisted: 'NOT in sitewide feed (only event-scoped)',
          private: 'NOT in sitewide feed (only group-scoped for members)',
        },
        direct_access: {
          public: 'Anyone can view',
          unlisted: 'Anyone with link can view',
          private: 'Only invited/members can view',
        },
      };

      expect(expectations).toBeDefined();
      console.log('\n📋 Cross-Cutting Visibility Expectations:');
      console.log(JSON.stringify(expectations, null, 2));
    });
  });
});
