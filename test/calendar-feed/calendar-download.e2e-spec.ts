import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createTestUser,
  createGroup,
  createEvent,
  joinGroup,
  approveMember,
} from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Calendar Download (e2e)', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user2;
  let publicGroup;
  let privateGroup;
  let testEvent;

  beforeAll(async () => {
    // Create two test users
    user1 = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `calendar-test-user1-${Date.now()}@example.com`,
      'Calendar',
      'User1',
    );
    user1Token = user1.token;

    user2 = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `calendar-test-user2-${Date.now()}@example.com`,
      'Calendar',
      'User2',
    );
    user2Token = user2.token;

    // Create a public group
    publicGroup = await createGroup(TESTING_APP_URL, user1Token, {
      name: 'Public Calendar Test Group',
      description: 'A public group for testing calendar downloads',
      visibility: 'public',
    });

    // Create a private group
    privateGroup = await createGroup(TESTING_APP_URL, user1Token, {
      name: 'Private Calendar Test Group',
      description: 'A private group for testing calendar downloads',
      visibility: 'private',
    });

    // Create a test event in the public group
    testEvent = await createEvent(TESTING_APP_URL, user1Token, {
      name: 'Test Calendar Event',
      description: 'A test event for calendar download testing',
      location: 'Test Location',
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      endDate: new Date(Date.now() + 25 * 60 * 60 * 1000), // Tomorrow + 1 hour
      group: publicGroup.id,
      timeZone: 'UTC',
      visibility: 'public',
      type: 'in-person',
      maxAttendees: 100,
      categories: [1], // Use existing category 1
      status: 'published', // Ensure event is published
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    try {
      if (testEvent?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${testEvent.slug}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }

      if (publicGroup?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${publicGroup.slug}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }

      if (privateGroup?.slug) {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${privateGroup.slug}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    } catch (error) {
      console.log(`Cleanup error: ${error.message}`);
    }
  });

  describe('Public Group Calendar Downloads', () => {
    it('should allow anyone to download public group calendar without authentication', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${publicGroup.slug}/calendar.ics`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain(
        `filename="${publicGroup.slug}.ics"`,
      );
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
    });

    it('should allow authenticated users to download public group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${publicGroup.slug}/calendar.ics`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
    });

    it('should handle HEAD requests for public group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .head(`/api/calendar/groups/${publicGroup.slug}/calendar.ics`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain(
        `filename="${publicGroup.slug}.ics"`,
      );
    });
  });

  describe('Private Group Calendar Downloads', () => {
    it('should deny unauthenticated access to private group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${privateGroup.slug}/calendar.ics`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Authentication required');
    });

    it('should deny non-members access to private group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${privateGroup.slug}/calendar.ics`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain(
        'Access denied to private group calendar',
      );
    });

    it('should allow group owner to download private group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${privateGroup.slug}/calendar.ics`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
    });

    it('should allow group members to download private group calendar', async () => {
      // First, have user2 join the private group (becomes a guest)
      const joinResult = await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        privateGroup.slug,
        user2Token,
      );

      // Then approve user2 to become a member with SEE_EVENTS permission
      await approveMember(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        privateGroup.slug,
        joinResult.id,
        user1Token,
      );

      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${privateGroup.slug}/calendar.ics`)
        .set('Authorization', `Bearer ${user2Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
    });
  });

  describe('User Personal Calendar Downloads', () => {
    it('should allow users to download their own calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/calendar/my/calendar.ics')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain(
        `filename="${user1.slug}.ics"`,
      );
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
    });

    it('should deny unauthenticated access to personal calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/calendar/my/calendar.ics')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it('should handle HEAD requests for personal calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .head('/api/calendar/my/calendar.ics')
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.headers['content-disposition']).toContain(
        `filename="${user1.slug}.ics"`,
      );
    });
  });

  describe('Calendar Content Validation', () => {
    it('should return valid calendar structure for public group with test event', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${publicGroup.slug}/calendar.ics`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
      expect(response.headers['content-type']).toContain('text/calendar');
      // Should contain the test event we created
      expect(response.text).toContain('Test Calendar Event');
    });

    it('should handle date range filtering', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const futureDateStr = futureDate.toISOString().split('T')[0]; // YYYY-MM-DD format

      const response = await request(TESTING_APP_URL)
        .get(`/api/calendar/groups/${publicGroup.slug}/calendar.ics`)
        .query({ start: futureDateStr })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.text).toContain('BEGIN:VCALENDAR');
      expect(response.text).toContain('END:VCALENDAR');
      // Should not contain the test event since it's tomorrow, not 30 days from now
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent group calendar', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/calendar/groups/non-existent-group/calendar.ics')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(404);
      expect(response.body.message).toContain(
        'Group with slug non-existent-group not found',
      );
    });

    it('should return 401 for missing tenant ID', async () => {
      const response = await request(TESTING_APP_URL).get(
        `/api/calendar/groups/${publicGroup.slug}/calendar.ics`,
      );

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('Tenant');
    });
  });
});
