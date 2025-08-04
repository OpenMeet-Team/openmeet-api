import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createTestUser } from '../utils/functions';

describe('Matrix Application Service Room Alias Conflicts (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  // Use the actual tokens from our configuration
  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  // Test cleanup happens automatically via test database isolation

  describe('Room Alias Conflict Handling', () => {
    it('should handle room creation when alias already exists', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-conflict-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const event = await createEvent(TESTING_APP_URL, testUser.token, {
        name: 'Conflict Test Event',
        slug: `conflict-test-${Date.now()}`,
        description: 'Testing room alias conflicts',
        type: 'online',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        timeZone: 'UTC',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Generate room alias for this event
      const roomAlias = `#event-${event.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // 3. First request should create the room successfully
      const firstResponse = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(firstResponse.body).toEqual({});

      // 4. Second request should handle "room already exists" gracefully
      const secondResponse = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(secondResponse.body).toEqual({});
    });

    it('should handle concurrent room creation requests for same alias', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-concurrent-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const event = await createEvent(TESTING_APP_URL, testUser.token, {
        name: 'Concurrent Test Event',
        slug: `concurrent-test-${Date.now()}`,
        description: 'Testing concurrent room creation',
        type: 'online',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        timeZone: 'UTC',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Generate room alias for this event
      const roomAlias = `#event-${event.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // 3. Make multiple concurrent requests
      const requests = Array.from({ length: 3 }, () =>
        server
          .get(
            `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`),
      );

      const responses = await Promise.all(requests);

      // 4. All requests should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      });
    });

    it('should return success for existing room even when attendee invitation fails', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-invite-fail-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const event = await createEvent(TESTING_APP_URL, testUser.token, {
        name: 'Invite Fail Test Event',
        slug: `invite-fail-test-${Date.now()}`,
        description: 'Testing attendee invitation failures',
        type: 'online',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        timeZone: 'UTC',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Generate room alias for this event
      const roomAlias = `#event-${event.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // 3. First request creates the room
      await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 4. Second request should still succeed even if invitation logic has issues
      const response = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should handle malformed room aliases gracefully', async () => {
      // Test various malformed aliases to ensure they return proper errors
      const malformedAliases = [
        `#event-${TESTING_TENANT_ID}:matrix.openmeet.net`, // Missing slug (malformed)
        '#event-test-nonexistent:matrix.openmeet.net', // Missing tenant
        '#invalid-format:matrix.openmeet.net', // Invalid format
        '#event-:matrix.openmeet.net', // Empty slug
      ];

      for (const alias of malformedAliases) {
        const response = await server
          .get(
            `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(alias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Room not found');
      }
    });

    it('should handle non-existent events properly', async () => {
      // Test room alias for event that doesn't exist
      const nonExistentAlias = `#event-nonexistent-${Date.now()}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      const response = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(nonExistentAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });
  });

  describe('Error Response Validation', () => {
    it('should return proper error for invalid authorization', async () => {
      const roomAlias = `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      const response = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return proper error for missing authorization', async () => {
      const roomAlias = `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      const response = await server
        .get(
          `/api/matrix/appservice/_matrix/app/v1/rooms/${encodeURIComponent(roomAlias)}`,
        )
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });
  });
});
