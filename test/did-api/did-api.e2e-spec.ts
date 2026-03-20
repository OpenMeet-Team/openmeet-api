import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
  joinGroup,
  approveMember,
  getGroupMembers,
} from '../utils/functions';
import {
  EventType,
  EventVisibility,
  GroupVisibility,
} from '../../src/core/constants/constant';

jest.setTimeout(120000);

/**
 * E2E Tests for DID API endpoints.
 *
 * These endpoints let external ATProto frontends query a user's
 * private data: groups they belong to and events they have access to.
 */
describe('DID API (e2e)', () => {
  let adminToken: string;
  // Test data created in beforeAll
  let privateGroup: any;
  let publicGroup: any;
  let privateGroupEvent: any;
  let unlistedGroupEvent: any;
  let publicGroupEvent: any;
  let standalonePublicEvent: any;
  let memberUser: any;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();

    // Create a member user who will join groups
    memberUser = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `did-api-member-${Date.now()}@test.com`,
      'DIDApi',
      'Member',
    );

    // Create a private group (admin is owner)
    privateGroup = await createGroup(TESTING_APP_URL, adminToken, {
      name: `DID API Private Group ${Date.now()}`,
      description: 'Private group for DID API testing',
      visibility: GroupVisibility.Private,
    });

    // Create a public group (admin is owner)
    publicGroup = await createGroup(TESTING_APP_URL, adminToken, {
      name: `DID API Public Group ${Date.now()}`,
      description: 'Public group for DID API testing',
      visibility: GroupVisibility.Public,
    });

    // Member joins the private group
    await joinGroup(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      privateGroup.slug,
      memberUser.token,
    );

    // If the group requires approval, approve the member
    if (privateGroup.requireApproval) {
      const members = await getGroupMembers(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        privateGroup.slug,
        adminToken,
      );
      const pendingMember = members.find(
        (m: any) => m.user?.id === memberUser.id,
      );
      if (pendingMember) {
        await approveMember(
          TESTING_APP_URL,
          TESTING_TENANT_ID,
          privateGroup.slug,
          pendingMember.id,
          adminToken,
        );
      }
    }

    // Member joins the public group
    await joinGroup(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      publicGroup.slug,
      memberUser.token,
    );

    // Create a private event in the private group
    privateGroupEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `DID Private Event ${Date.now()}`,
      description: 'Private event in private group',
      startDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 3 * 86400000 + 7200000).toISOString(),
      type: EventType.InPerson,
      location: 'Private Location',
      maxAttendees: 50,
      categories: [],
      status: 'published',
      visibility: EventVisibility.Private,
      group: privateGroup.id,
      timeZone: 'UTC',
    });

    // Create an unlisted event in the private group
    unlistedGroupEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `DID Unlisted Event ${Date.now()}`,
      description: 'Unlisted event in private group',
      startDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 5 * 86400000 + 7200000).toISOString(),
      type: EventType.Online,
      locationOnline: 'https://meet.example.com',
      maxAttendees: 100,
      categories: [],
      status: 'published',
      visibility: EventVisibility.Unlisted,
      group: privateGroup.id,
      timeZone: 'UTC',
    });

    // Create a public event in the public group
    publicGroupEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `DID Public Group Event ${Date.now()}`,
      description: 'Public event in public group',
      startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
      type: EventType.Hybrid,
      location: 'Public Location',
      locationOnline: 'https://meet.example.com',
      maxAttendees: 200,
      categories: [],
      status: 'published',
      visibility: EventVisibility.Public,
      group: publicGroup.id,
      timeZone: 'UTC',
    });

    // Create a standalone public event (no group) - member RSVPs to it
    standalonePublicEvent = await createEvent(TESTING_APP_URL, adminToken, {
      name: `DID Standalone Public Event ${Date.now()}`,
      description: 'Public event without a group',
      startDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      endDate: new Date(Date.now() + 10 * 86400000 + 7200000).toISOString(),
      type: EventType.InPerson,
      location: 'Standalone Location',
      maxAttendees: 50,
      categories: [],
      status: 'published',
      visibility: EventVisibility.Public,
      timeZone: 'UTC',
    });

    // Member RSVPs to the standalone public event
    await request(TESTING_APP_URL)
      .post(`/api/events/${standalonePublicEvent.slug}/attend`)
      .set('Authorization', `Bearer ${memberUser.token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});

    // Member RSVPs to the private group event
    await request(TESTING_APP_URL)
      .post(`/api/events/${privateGroupEvent.slug}/attend`)
      .set('Authorization', `Bearer ${memberUser.token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});
  });

  afterAll(async () => {
    // Cleanup events
    const eventSlugs = [
      privateGroupEvent?.slug,
      unlistedGroupEvent?.slug,
      publicGroupEvent?.slug,
      standalonePublicEvent?.slug,
    ].filter(Boolean);

    for (const slug of eventSlugs) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    // Cleanup groups
    for (const group of [privateGroup, publicGroup].filter(Boolean)) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  // ─── GET /api/v1/did/groups ──────────────────────────────────

  describe('GET /api/v1/did/groups', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/groups')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it('should return groups the authenticated user belongs to', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/groups')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('groups');
      expect(Array.isArray(response.body.groups)).toBe(true);

      // Member should see both groups they joined
      const groupSlugs = response.body.groups.map((g: any) => g.slug);
      expect(groupSlugs).toContain(privateGroup.slug);
      expect(groupSlugs).toContain(publicGroup.slug);
    });

    it('should include expected fields in group response', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/groups')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const group = response.body.groups.find(
        (g: any) => g.slug === privateGroup.slug,
      );
      expect(group).toBeDefined();
      expect(group).toHaveProperty('slug');
      expect(group).toHaveProperty('name');
      expect(group).toHaveProperty('description');
      expect(group).toHaveProperty('visibility');
      expect(group).toHaveProperty('role');
      expect(group).toHaveProperty('memberCount');
    });

    it('should not return groups the user does not belong to', async () => {
      // Create a new user who is not a member of any group
      const outsider = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `did-api-outsider-${Date.now()}@test.com`,
        'DIDApi',
        'Outsider',
      );

      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/groups')
        .set('Authorization', `Bearer ${outsider.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toHaveLength(0);
    });
  });

  // ─── GET /api/v1/did/events ──────────────────────────────────

  describe('GET /api/v1/did/events', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it('should return private/unlisted events from groups the user belongs to', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('cursor');
      expect(Array.isArray(response.body.events)).toBe(true);

      const eventSlugs = response.body.events.map((e: any) => e.slug);

      // Should include private event from group (user is member + RSVP'd)
      expect(eventSlugs).toContain(privateGroupEvent.slug);

      // Should include unlisted event from group (user is member)
      expect(eventSlugs).toContain(unlistedGroupEvent.slug);
    });

    it('should NOT include public events by default', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const eventSlugs = response.body.events.map((e: any) => e.slug);

      // Public events should NOT appear unless includePublic=true
      expect(eventSlugs).not.toContain(standalonePublicEvent.slug);
      expect(eventSlugs).not.toContain(publicGroupEvent.slug);
    });

    it('should include public attending events when includePublic=true', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events?includePublic=true')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const eventSlugs = response.body.events.map((e: any) => e.slug);

      // Should include the public event the user is attending
      expect(eventSlugs).toContain(standalonePublicEvent.slug);
    });

    it('should filter by groupSlug', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/did/events?groupSlug=${privateGroup.slug}`)
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // All returned events should belong to the specified group
      for (const event of response.body.events) {
        if (event.group) {
          expect(event.group.slug).toBe(privateGroup.slug);
        }
      }

      // Should include events from the private group
      const eventSlugs = response.body.events.map((e: any) => e.slug);
      expect(eventSlugs).toContain(privateGroupEvent.slug);
    });

    it('should include expected fields in event response', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const event = response.body.events.find(
        (e: any) => e.slug === privateGroupEvent.slug,
      );
      expect(event).toBeDefined();
      expect(event).toHaveProperty('slug');
      expect(event).toHaveProperty('name');
      expect(event).toHaveProperty('description');
      expect(event).toHaveProperty('startDate');
      expect(event).toHaveProperty('endDate');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('visibility');
      expect(event).toHaveProperty('status');
      expect(event).toHaveProperty('group');
      expect(event.group).toHaveProperty('slug');
      expect(event.group).toHaveProperty('name');
    });

    it('should respect limit parameter', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events?limit=1')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events.length).toBeLessThanOrEqual(1);
    });

    it('should sort events by startDate ascending', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events?includePublic=true')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const events = response.body.events;
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].startDate).getTime();
        const curr = new Date(events[i].startDate).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  // ─── GET /api/v1/did/events/:slug ──────────────────────────

  describe('GET /api/v1/did/events/:slug', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/did/events/${privateGroupEvent.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it('should return event detail for an event the user has access to', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/did/events/${privateGroupEvent.slug}`)
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('slug', privateGroupEvent.slug);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('description');
      expect(response.body).toHaveProperty('startDate');
      expect(response.body).toHaveProperty('visibility');
      expect(response.body).toHaveProperty('group');
    });

    it('should return 403 for a private event the user has no access to', async () => {
      // Create a user who is not a member of the group
      const outsider = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `did-api-no-access-${Date.now()}@test.com`,
        'NoAccess',
        'User',
      );

      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/did/events/${privateGroupEvent.slug}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
    });

    it('should return 404 for a non-existent event', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/v1/did/events/does-not-exist-slug')
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(404);
    });
  });
});
