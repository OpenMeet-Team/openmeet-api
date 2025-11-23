import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin, createGroup, createEvent, createTestUser } from '../utils/functions';
import { EventStatus, EventType, GroupStatus } from '../../src/core/constants/constant';

jest.setTimeout(120000);

describe('User Profile Visibility Compliance (e2e)', () => {
  let adminToken: string;
  let testUserToken: string;
  let testUserSlug: string;

  const testGroups = {
    public: null,
    unlisted: null,
    private: null,
  };

  const testEvents = {
    public: null,
    unlisted: null,
    private: null,
  };

  beforeAll(async () => {
    // Login as admin
    adminToken = await loginAsAdmin();

    // Create a test user who will own the groups and events
    const testUserData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `profile-visibility-test-${Date.now()}@openmeet.test`,
      'Profile',
      'TestUser',
    );
    testUserToken = testUserData.token;
    testUserSlug = testUserData.user.slug;

    // Create test groups with different visibility levels (owned by test user)
    testGroups.public = await createGroup(TESTING_APP_URL, testUserToken, {
      name: 'Public Group - Profile Test',
      slug: `public-group-profile-${Date.now()}`,
      description: 'Public group for profile visibility testing',
      visibility: 'public',
      status: GroupStatus.Published,
      categories: [1],
    });

    testGroups.unlisted = await createGroup(TESTING_APP_URL, testUserToken, {
      name: 'Unlisted Group - Profile Test',
      slug: `unlisted-group-profile-${Date.now()}`,
      description: 'Unlisted group for profile visibility testing',
      visibility: 'unlisted',
      status: GroupStatus.Published,
      categories: [1],
    });

    testGroups.private = await createGroup(TESTING_APP_URL, testUserToken, {
      name: 'Private Group - Profile Test',
      slug: `private-group-profile-${Date.now()}`,
      description: 'Private group for profile visibility testing',
      visibility: 'private',
      status: GroupStatus.Published,
      categories: [1],
    });

    // Create test events with different visibility levels (owned by test user)
    const tomorrow = new Date(Date.now() + 86400000);
    const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

    testEvents.public = await createEvent(TESTING_APP_URL, testUserToken, {
      name: 'Public Event - Profile Test',
      description: 'Public event for profile visibility testing',
      type: EventType.Online,
      visibility: 'public',
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: dayAfterTomorrow.toISOString(),
      categories: [1],
      timeZone: 'UTC',
    });

    testEvents.unlisted = await createEvent(TESTING_APP_URL, testUserToken, {
      name: 'Unlisted Event - Profile Test',
      description: 'Unlisted event for profile visibility testing',
      type: EventType.Online,
      visibility: 'unlisted',
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: dayAfterTomorrow.toISOString(),
      categories: [1],
      timeZone: 'UTC',
    });

    testEvents.private = await createEvent(TESTING_APP_URL, testUserToken, {
      name: 'Private Event - Profile Test',
      description: 'Private event for profile visibility testing',
      type: EventType.Online,
      visibility: 'private',
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: dayAfterTomorrow.toISOString(),
      categories: [1],
      timeZone: 'UTC',
    });
  });

  afterAll(async () => {
    // Cleanup: delete test groups
    for (const group of Object.values(testGroups)) {
      if (group?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${testUserToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }

    // Cleanup: delete test events
    for (const event of Object.values(testEvents)) {
      if (event?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${testUserToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });

  describe('Group Visibility on User Profiles', () => {
    it('should only show public groups on user profile to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeDefined();
      expect(Array.isArray(response.body.groups)).toBe(true);

      // Find each group type in the response
      const publicGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.public.slug,
      );
      const unlistedGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.unlisted.slug,
      );
      const privateGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.private.slug,
      );

      // Only public group should be visible
      expect(publicGroup).toBeDefined();
      expect(publicGroup.name).toBe('Public Group - Profile Test');

      // Unlisted and private groups should NOT be visible
      expect(unlistedGroup).toBeUndefined();
      expect(privateGroup).toBeUndefined();
    });

    it('should only show public groups on user profile to authenticated users', async () => {
      // Create another user to view the profile
      const otherUserData = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `profile-viewer-${Date.now()}@openmeet.test`,
        'Viewer',
        'User',
      );

      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('Authorization', `Bearer ${otherUserData.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeDefined();
      expect(Array.isArray(response.body.groups)).toBe(true);

      // Find each group type in the response
      const publicGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.public.slug,
      );
      const unlistedGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.unlisted.slug,
      );
      const privateGroup = response.body.groups.find(
        (g: any) => g.slug === testGroups.private.slug,
      );

      // Only public group should be visible
      expect(publicGroup).toBeDefined();

      // Unlisted and private groups should NOT be visible
      expect(unlistedGroup).toBeUndefined();
      expect(privateGroup).toBeUndefined();
    });

    it('should only show published groups on user profile', async () => {
      // Create a draft group
      const draftGroup = await createGroup(TESTING_APP_URL, testUserToken, {
        name: 'Draft Group - Profile Test',
        slug: `draft-group-profile-${Date.now()}`,
        description: 'Draft group should not appear on profile',
        visibility: 'public',
        status: GroupStatus.Draft,
        categories: [1],
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.groups).toBeDefined();

      // Draft group should NOT be visible even though it's public
      const foundDraftGroup = response.body.groups.find(
        (g: any) => g.slug === draftGroup.slug,
      );
      expect(foundDraftGroup).toBeUndefined();

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${draftGroup.slug}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });

  describe('Event Visibility on User Profiles', () => {
    it('should only show public events on user profile to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
      expect(Array.isArray(response.body.events)).toBe(true);

      // Find each event type in the response
      const publicEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.public.slug,
      );
      const unlistedEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.unlisted.slug,
      );
      const privateEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.private.slug,
      );

      // Only public event should be visible
      expect(publicEvent).toBeDefined();
      expect(publicEvent.name).toBe('Public Event - Profile Test');

      // Unlisted and private events should NOT be visible
      expect(unlistedEvent).toBeUndefined();
      expect(privateEvent).toBeUndefined();
    });

    it('should only show public events on user profile to authenticated users', async () => {
      // Create another user to view the profile
      const otherUserData = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `event-viewer-${Date.now()}@openmeet.test`,
        'EventViewer',
        'User',
      );

      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('Authorization', `Bearer ${otherUserData.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
      expect(Array.isArray(response.body.events)).toBe(true);

      // Find each event type in the response
      const publicEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.public.slug,
      );
      const unlistedEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.unlisted.slug,
      );
      const privateEvent = response.body.events.find(
        (e: any) => e.slug === testEvents.private.slug,
      );

      // Only public event should be visible
      expect(publicEvent).toBeDefined();

      // Unlisted and private events should NOT be visible
      expect(unlistedEvent).toBeUndefined();
      expect(privateEvent).toBeUndefined();
    });

    it('should only show published/cancelled events on user profile', async () => {
      // Create a draft event
      const tomorrow = new Date(Date.now() + 86400000);
      const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

      const draftEvent = await createEvent(TESTING_APP_URL, testUserToken, {
        name: 'Draft Event - Profile Test',
        description: 'Draft event should not appear on profile',
        type: EventType.Online,
        visibility: 'public',
        status: EventStatus.Draft,
        startDate: tomorrow.toISOString(),
        endDate: dayAfterTomorrow.toISOString(),
        categories: [1],
        timeZone: 'UTC',
      });

      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();

      // Draft event should NOT be visible even though it's public
      const foundDraftEvent = response.body.events.find(
        (e: any) => e.slug === draftEvent.slug,
      );
      expect(foundDraftEvent).toBeUndefined();

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${draftEvent.slug}`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });

  describe('Security: Issue #390 Regression Tests', () => {
    it('should prevent private group information leak to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // Verify no private groups are exposed
      const hasPrivateGroup = response.body.groups?.some(
        (g: any) => g.visibility === 'private',
      );
      expect(hasPrivateGroup).toBe(false);
    });

    it('should prevent unlisted group information leak to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // Verify no unlisted groups are exposed
      const hasUnlistedGroup = response.body.groups?.some(
        (g: any) => g.visibility === 'unlisted',
      );
      expect(hasUnlistedGroup).toBe(false);
    });

    it('should prevent private event information leak to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // Verify no private events are exposed
      const hasPrivateEvent = response.body.events?.some(
        (e: any) => e.visibility === 'private',
      );
      expect(hasPrivateEvent).toBe(false);
    });

    it('should prevent unlisted event information leak to anonymous users', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/v1/users/${testUserSlug}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // Verify no unlisted events are exposed
      const hasUnlistedEvent = response.body.events?.some(
        (e: any) => e.visibility === 'unlisted',
      );
      expect(hasUnlistedEvent).toBe(false);
    });
  });
});
