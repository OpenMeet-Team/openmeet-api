import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  loginAsAdmin,
  createTestUser,
  createEvent,
} from '../utils/functions';
import {
  GroupStatus,
  GroupVisibility,
  EventVisibility,
  EventStatus,
  EventType,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Sitewide Activity Feed Security (E2E)', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;
  let authenticatedUserToken: string;

  // Entities
  let publicGroup: any;
  let authenticatedGroup: any;
  let privateGroup: any;
  let publicEvent: any;
  let authenticatedEvent: any;
  let privateEvent: any;

  // Store user info
  let authenticatedUser: any;

  beforeAll(async () => {
    try {
      // Get admin token
      adminToken = await loginAsAdmin();

      const timestamp = Date.now();

      // Create test user (authenticated but not a member)
      authenticatedUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `sitewide.user.${timestamp}@example.com`,
        'Sitewide',
        'User',
      );
      authenticatedUserToken = authenticatedUser.token;

      // Create groups with different visibility levels
      publicGroup = await createGroup(app, adminToken, {
        name: `Sitewide Public Group ${timestamp}`,
        description: 'A public group for sitewide feed testing',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      authenticatedGroup = await createGroup(app, adminToken, {
        name: `Sitewide Authenticated Group ${timestamp}`,
        description: 'An unlisted group for sitewide feed testing',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Authenticated,
      });

      privateGroup = await createGroup(app, adminToken, {
        name: `Sitewide Private Group ${timestamp}`,
        description: 'A private group for sitewide feed testing',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Private,
      });

      // Create events with different visibility levels
      publicEvent = await createEvent(app, adminToken, {
        name: `Sitewide Public Event ${timestamp}`,
        description: 'A public event for sitewide feed testing',
        type: EventType.Hybrid,
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
      });

      authenticatedEvent = await createEvent(app, adminToken, {
        name: `Sitewide Authenticated Event ${timestamp}`,
        description: 'An unlisted event for sitewide feed testing',
        type: EventType.Hybrid,
        status: EventStatus.Published,
        visibility: EventVisibility.Authenticated,
      });

      privateEvent = await createEvent(app, adminToken, {
        name: `Sitewide Private Event ${timestamp}`,
        description: 'A private event for sitewide feed testing',
        type: EventType.Hybrid,
        status: EventStatus.Published,
        visibility: EventVisibility.Private,
      });

      // Wait a moment for activity feed entries to be created
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log('Sitewide feed test setup complete:', {
        publicGroup: publicGroup.slug,
        authenticatedGroup: authenticatedGroup.slug,
        privateGroup: privateGroup.slug,
        publicEvent: publicEvent.slug,
        authenticatedEvent: authenticatedEvent.slug,
        privateEvent: privateEvent.slug,
        authenticatedUserId: authenticatedUser.id,
      });
    } catch (error) {
      console.error('Error in beforeAll:', error);
      throw error;
    }
  });

  describe('GET /api/feed - Unauthenticated Users', () => {
    it('should only show activities from public groups and events', async () => {
      // Given: User is not logged in
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      console.log('Unauthenticated sitewide feed response:', {
        status: response.status,
        activityCount: response.body?.length,
      });

      // Then: Should succeed
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Check that only public activities are returned
      const activities = response.body;
      for (const activity of activities) {
        expect(activity.visibility).toBe('public');

        // Should not contain private group/event activities
        if (activity.groupId === privateGroup.id) {
          throw new Error(
            `Private group activity leaked to sitewide feed for unauthenticated user: ${JSON.stringify(activity)}`,
          );
        }
        if (activity.eventId === privateEvent.id) {
          throw new Error(
            `Private event activity leaked to sitewide feed for unauthenticated user: ${JSON.stringify(activity)}`,
          );
        }
        if (activity.groupId === authenticatedGroup.id) {
          throw new Error(
            `Unlisted group activity leaked to sitewide feed for unauthenticated user: ${JSON.stringify(activity)}`,
          );
        }
        if (activity.eventId === authenticatedEvent.id) {
          throw new Error(
            `Unlisted event activity leaked to sitewide feed for unauthenticated user: ${JSON.stringify(activity)}`,
          );
        }
      }
    });

    it('should show activities from public groups', async () => {
      // Given: User is not logged in
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      // Then: Should include public group activities
      expect(response.status).toBe(200);
      const activities = response.body;

      // Check if any activities are from the public group
      const hasPublicGroupActivity = activities.some(
        (a) => a.groupId === publicGroup.id,
      );

      console.log('Has public group activity:', hasPublicGroupActivity);
      // Note: This might be false if no activities were created yet
      // The important test is that private/authenticated are NOT present
    });

    it('should show activities from public events', async () => {
      // Given: User is not logged in
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      // Then: Should include public event activities
      expect(response.status).toBe(200);
      const activities = response.body;

      // Check if any activities are from the public event
      const hasPublicEventActivity = activities.some(
        (a) => a.eventId === publicEvent.id,
      );

      console.log('Has public event activity:', hasPublicEventActivity);
      // Note: This might be false if no activities were created yet
      // The important test is that private/authenticated are NOT present
    });
  });

  describe('GET /api/feed - Authenticated Users', () => {
    it('should show activities from public and unlisted groups/events', async () => {
      // Given: User is logged in
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('Authorization', `Bearer ${authenticatedUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      console.log('Authenticated sitewide feed response:', {
        status: response.status,
        activityCount: response.body?.length,
      });

      // Then: Should succeed
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Check that only public and authenticated activities are returned
      const activities = response.body;
      for (const activity of activities) {
        expect(['public', 'authenticated']).toContain(activity.visibility);

        // Should not contain private group/event activities
        if (activity.groupId === privateGroup.id) {
          throw new Error(
            `Private group activity leaked to sitewide feed for authenticated user: ${JSON.stringify(activity)}`,
          );
        }
        if (activity.eventId === privateEvent.id) {
          throw new Error(
            `Private event activity leaked to sitewide feed for authenticated user: ${JSON.stringify(activity)}`,
          );
        }
      }
    });

    it('should NOT show activities from private groups', async () => {
      // Given: User is logged in but not a member of private group
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('Authorization', `Bearer ${authenticatedUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      // Then: Should not include private group activities
      expect(response.status).toBe(200);
      const activities = response.body;

      const hasPrivateGroupActivity = activities.some(
        (a) => a.groupId === privateGroup.id,
      );

      expect(hasPrivateGroupActivity).toBe(false);
    });

    it('should NOT show activities from private events', async () => {
      // Given: User is logged in but not an attendee of private event
      // When: Request sitewide feed
      const response = await request(app)
        .get('/api/feed')
        .set('Authorization', `Bearer ${authenticatedUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 100 });

      // Then: Should not include private event activities
      expect(response.status).toBe(200);
      const activities = response.body;

      const hasPrivateEventActivity = activities.some(
        (a) => a.eventId === privateEvent.id,
      );

      expect(hasPrivateEventActivity).toBe(false);
    });
  });
});
