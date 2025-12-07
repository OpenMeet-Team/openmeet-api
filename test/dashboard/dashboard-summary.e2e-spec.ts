import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
} from '../utils/constants';
import {
  loginAsTester,
  createEvent,
  createGroup,
  getAuthToken,
} from '../utils/functions';
import {
  EventStatus,
  EventType,
  GroupStatus,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(120000);

describe('Dashboard Summary Endpoints (e2e)', () => {
  let token: string;
  const createdEvents: any[] = [];
  const createdGroups: any[] = [];

  beforeAll(async () => {
    token = await loginAsTester();
  });

  afterAll(async () => {
    // Clean up created events
    for (const event of createdEvents) {
      try {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } catch (e) {
        console.warn(`Failed to delete event ${event.slug}:`, e);
      }
    }

    // Clean up created groups
    for (const group of createdGroups) {
      try {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } catch (e) {
        console.warn(`Failed to delete group ${group.slug}:`, e);
      }
    }
  });

  describe('GET /events/dashboard/summary', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard/summary')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should return summary with counts and arrays', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Verify counts object exists with required fields
        expect(response.body.counts).toBeDefined();
        expect(typeof response.body.counts.hostingUpcoming).toBe('number');
        expect(typeof response.body.counts.attendingUpcoming).toBe('number');
        expect(typeof response.body.counts.past).toBe('number');

        // Verify arrays exist
        expect(Array.isArray(response.body.hostingThisWeek)).toBe(true);
        expect(Array.isArray(response.body.hostingLater)).toBe(true);
        expect(Array.isArray(response.body.attendingSoon)).toBe(true);
      });

      it('should return events user is hosting', async () => {
        // Create a future event that the user hosts
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 3); // 3 days from now (this week)

        const event = await createEvent(TESTING_APP_URL, token, {
          name: 'Dashboard Test Event - Hosting',
          description: 'Event for testing dashboard summary',
          type: EventType.InPerson,
          status: EventStatus.Published,
          startDate: futureDate.toISOString(),
        });
        createdEvents.push(event);

        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);

        // The event should appear in hostingThisWeek or hostingLater
        const allHosting = [
          ...response.body.hostingThisWeek,
          ...response.body.hostingLater,
        ];
        const hasCreatedEvent = allHosting.some((e) => e.id === event.id);
        expect(hasCreatedEvent).toBe(true);

        // Count should reflect the event
        expect(response.body.counts.hostingUpcoming).toBeGreaterThanOrEqual(1);
      });

      it('should limit preview arrays to reasonable size', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);

        // Preview arrays should be limited (typically 5-10 items max)
        expect(response.body.hostingThisWeek.length).toBeLessThanOrEqual(10);
        expect(response.body.hostingLater.length).toBeLessThanOrEqual(5);
        expect(response.body.attendingSoon.length).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('GET /groups/dashboard/summary', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard/summary')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should return summary with counts and arrays', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Verify counts object exists with required fields
        expect(response.body.counts).toBeDefined();
        expect(typeof response.body.counts.leading).toBe('number');
        expect(typeof response.body.counts.member).toBe('number');

        // Verify arrays exist
        expect(Array.isArray(response.body.leadingGroups)).toBe(true);
        expect(Array.isArray(response.body.memberGroups)).toBe(true);
      });

      it('should return groups user is leading', async () => {
        // Create a group that the user owns
        const group = await createGroup(TESTING_APP_URL, token, {
          name: 'Dashboard Test Group - Leading',
          description: 'Group for testing dashboard summary',
          status: GroupStatus.Published,
          visibility: 'public',
        });
        createdGroups.push(group);

        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);

        // The group should appear in leadingGroups
        const hasCreatedGroup = response.body.leadingGroups.some(
          (g) => g.id === group.id,
        );
        expect(hasCreatedGroup).toBe(true);

        // Count should reflect the group
        expect(response.body.counts.leading).toBeGreaterThanOrEqual(1);
      });

      it('should limit preview arrays to reasonable size', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard/summary')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);

        // Preview arrays should be limited (typically 5-10 items max)
        expect(response.body.leadingGroups.length).toBeLessThanOrEqual(10);
        expect(response.body.memberGroups.length).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('GET /users/:identifier/profile/summary', () => {
    let userSlug: string;

    beforeAll(async () => {
      // Get current user's slug
      const meResponse = await request(TESTING_APP_URL)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(meResponse.status).toBe(200);
      userSlug = meResponse.body.slug;
    });

    describe('when accessing public profile', () => {
      it('should return profile summary by slug', async () => {
        const response = await request(TESTING_APP_URL)
          .get(`/api/v1/users/${userSlug}/profile/summary`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Verify basic user info
        expect(response.body.slug).toBe(userSlug);

        // Verify counts object exists with required fields
        expect(response.body.counts).toBeDefined();
        expect(typeof response.body.counts.organizedEvents).toBe('number');
        expect(typeof response.body.counts.attendingEvents).toBe('number');
        expect(typeof response.body.counts.ownedGroups).toBe('number');
        expect(typeof response.body.counts.groupMemberships).toBe('number');

        // Verify preview arrays exist
        expect(Array.isArray(response.body.organizedEvents)).toBe(true);
        expect(Array.isArray(response.body.attendingEvents)).toBe(true);
        expect(Array.isArray(response.body.ownedGroups)).toBe(true);
        expect(Array.isArray(response.body.groupMemberships)).toBe(true);
      });

      it('should return empty response for non-existent user slug', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/v1/users/non-existent-user-slug-12345/profile/summary')
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Returns 200 with empty body when user not found
        expect(response.status).toBe(200);
        // Body should be empty or not have required profile fields
        expect(response.body.slug).toBeUndefined();
      });

      it('should limit preview arrays to reasonable size', async () => {
        const response = await request(TESTING_APP_URL)
          .get(`/api/v1/users/${userSlug}/profile/summary`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);

        // Preview arrays should be limited (typically 5 items max)
        expect(response.body.organizedEvents.length).toBeLessThanOrEqual(5);
        expect(response.body.attendingEvents.length).toBeLessThanOrEqual(5);
        expect(response.body.ownedGroups.length).toBeLessThanOrEqual(5);
        expect(response.body.groupMemberships.length).toBeLessThanOrEqual(5);
      });
    });

    describe('identifier resolution', () => {
      it('should work with user slug', async () => {
        const response = await request(TESTING_APP_URL)
          .get(`/api/v1/users/${userSlug}/profile/summary`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(userSlug);
      });

      it('should return empty response for non-existent DID', async () => {
        // Test with a properly formatted but non-existent DID
        const response = await request(TESTING_APP_URL)
          .get('/api/v1/users/did:plc:nonexistent123456789/profile/summary')
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Returns 200 with empty body since DID doesn't exist
        expect(response.status).toBe(200);
        expect(response.body.slug).toBeUndefined();
      });

      it('should return empty response for non-existent handle', async () => {
        // Test with a handle format that doesn't exist
        const response = await request(TESTING_APP_URL)
          .get('/api/v1/users/nonexistent.handle.bsky.social/profile/summary')
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Returns 200 with empty body since handle doesn't resolve
        expect(response.status).toBe(200);
        expect(response.body.slug).toBeUndefined();
      });
    });

    describe('profile data integrity', () => {
      it('should include user events in counts', async () => {
        // First create an event
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);

        const event = await createEvent(TESTING_APP_URL, token, {
          name: 'Profile Summary Test Event',
          description: 'Event for testing profile summary',
          type: EventType.InPerson,
          status: EventStatus.Published,
          startDate: futureDate.toISOString(),
        });
        createdEvents.push(event);

        // Then check the profile summary
        const response = await request(TESTING_APP_URL)
          .get(`/api/v1/users/${userSlug}/profile/summary`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.counts.organizedEvents).toBeGreaterThanOrEqual(1);
      });

      it('should include user groups in counts', async () => {
        // First create a group
        const group = await createGroup(TESTING_APP_URL, token, {
          name: 'Profile Summary Test Group',
          description: 'Group for testing profile summary',
          status: GroupStatus.Published,
          visibility: 'public',
        });
        createdGroups.push(group);

        // Then check the profile summary
        const response = await request(TESTING_APP_URL)
          .get(`/api/v1/users/${userSlug}/profile/summary`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.counts.ownedGroups).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('GET /events/dashboard (paginated)', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should return paginated results', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Verify pagination structure
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(typeof response.body.total).toBe('number');
        expect(typeof response.body.page).toBe('number');
        expect(typeof response.body.totalPages).toBe('number');
      });

      it('should support page and limit parameters', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard?page=1&limit=5')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.page).toBe(1);
        expect(response.body.data.length).toBeLessThanOrEqual(5);
      });

      it('should filter by tab=hosting', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard?tab=hosting')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should filter by tab=attending', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard?tab=attending')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should filter by tab=past', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard?tab=past')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should reject invalid tab value', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/events/dashboard?tab=invalid')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(422);
      });
    });
  });

  describe('GET /groups/dashboard (paginated)', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard')
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should return paginated results', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // Verify pagination structure
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(typeof response.body.total).toBe('number');
        expect(typeof response.body.page).toBe('number');
        expect(typeof response.body.totalPages).toBe('number');
      });

      it('should support page and limit parameters', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard?page=1&limit=5')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.page).toBe(1);
        expect(response.body.data.length).toBeLessThanOrEqual(5);
      });

      it('should filter by role=leader', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard?role=leader')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should filter by role=member', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard?role=member')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should reject invalid role value', async () => {
        const response = await request(TESTING_APP_URL)
          .get('/api/groups/dashboard?role=invalid')
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(422);
      });
    });
  });
});
