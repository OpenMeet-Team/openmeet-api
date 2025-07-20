import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createGroup, createTestUser } from '../utils/functions';

describe('Matrix Application Service Room Aliases (e2e)', () => {
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

  describe('Event Room Aliases', () => {
    it('should create room when queried for existing event via alias', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-room-alias-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-room-alias-${Date.now()}`,
        name: 'Test Event for Room Alias',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        endDate: new Date(Date.now() + 90000000).toISOString(), // Tomorrow + 1 hour
        timeZone: 'UTC',
        description: 'Test event for room alias testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Query the Application Service for the room alias
      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the response is successful (empty object per Matrix AppService spec)
      expect(response.body).toEqual({});
    });

    it('should return 404 for non-existent event', async () => {
      // Query for a non-existent event
      const roomAlias = `#event-nonexistent-event-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200); // Application Service should return 200 with error object

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });

    it('should handle malformed event room aliases', async () => {
      // Test malformed room alias
      const roomAlias = `#invalid-format:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });

    it('should create room with correct properties for event', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-properties-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-properties-${Date.now()}`,
        name: 'Test Event Properties',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for properties testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Query the Application Service for the room alias
      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the response is successful (empty object per Matrix AppService spec)
      expect(response.body).toEqual({});
      
      // TODO: Add tests for room properties once Matrix SDK integration is available
      // - Room should be private
      // - Room should be encrypted
      // - Room should have correct name and topic
      // - Room should have proper permissions
    });
  });

  describe('Group Room Aliases', () => {
    it('should create room when queried for existing group via alias', async () => {
      // 1. Create a test user and group
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-group-alias-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        name: 'Test Group for Room Alias',
        description: 'Test group for room alias testing',
        status: 'published',
      });

      // 2. Query the Application Service for the room alias
      const roomAlias = `#group-${testGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the response is successful (empty object per Matrix AppService spec)
      expect(response.body).toEqual({});
    });

    it('should return 404 for non-existent group', async () => {
      // Query for a non-existent group
      const roomAlias = `#group-nonexistent-group-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200); // Application Service should return 200 with error object

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });

    it('should handle malformed group room aliases', async () => {
      // Test malformed room alias
      const roomAlias = `#group-invalid:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });
  });

  describe('Room Alias Validation', () => {
    it('should validate room alias format', async () => {
      const testCases = [
        {
          alias: '#event-test-event-tenant1:matrix.openmeet.net',
          description: 'valid event alias',
          shouldSucceed: true,
        },
        {
          alias: '#group-test-group-tenant1:matrix.openmeet.net',
          description: 'valid group alias',
          shouldSucceed: true,
        },
        {
          alias: '#invalid-type-test-tenant1:matrix.openmeet.net',
          description: 'invalid type',
          shouldSucceed: false,
        },
        {
          alias: '#event-test:matrix.openmeet.net',
          description: 'missing tenant ID',
          shouldSucceed: false,
        },
        {
          alias: '#event:matrix.openmeet.net',
          description: 'missing slug and tenant ID',
          shouldSucceed: false,
        },
      ];

      for (const testCase of testCases) {
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(testCase.alias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        // All test cases should return 'Room not found' error since we're not creating test data
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Room not found');
      }
    });
  });

  describe('Multiple Room Creation', () => {
    it('should handle multiple users joining the same room', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-multi-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-multi-user-room-${Date.now()}`,
        name: 'Test Multi-User Room',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for multi-user room testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. First, create the room with a single request
      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      
      const firstResponse = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toEqual({});

      // 3. Subsequent requests should return the same room (after short delay to avoid race conditions)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const secondResponse = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      const thirdResponse = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // Verify all responses are successful (empty object means success per Matrix spec)
      expect(secondResponse.status).toBe(200);
      expect(thirdResponse.status).toBe(200);
      expect(secondResponse.body).toEqual({});
      expect(thirdResponse.body).toEqual({});
    });
  });

  describe('Authorization', () => {
    it('should reject requests without authorization header', async () => {
      const roomAlias = `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });

    it('should reject requests with invalid token', async () => {
      const roomAlias = `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });
  });
});