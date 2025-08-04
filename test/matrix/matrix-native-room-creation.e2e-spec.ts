import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createGroup, createTestUser } from '../utils/functions';

describe('Matrix Native Room Creation (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  beforeEach(async () => {
    // Tests will use unique identifiers to avoid conflicts
    // TODO: Add cleanup logic if needed
  });

  describe('Event Room Creation via Application Service', () => {
    it('should create room when queried for existing event via alias', async () => {
      // 1. Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-event-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-matrix-event-${Date.now()}`,
        name: 'Test Matrix Event',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for Matrix room creation',
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

    it('should return error for non-existent event', async () => {
      // Query for a non-existent event
      const roomAlias = `#event-nonexistent-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });
  });

  describe('Group Room Creation via Application Service', () => {
    it('should create room when queried for existing group via alias', async () => {
      // 1. Create a test user and group
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-group-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const testGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        name: 'Test Matrix Group',
        description: 'Test group for Matrix room creation',
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

    it('should return error for non-existent group', async () => {
      // Query for a non-existent group
      const roomAlias = `#group-nonexistent-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });
  });

  describe('Room Alias Format Validation', () => {
    it('should handle different slug formats correctly', async () => {
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-formats-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const testCases = [
        { slug: 'simple-event', name: 'Simple Event' },
        { slug: 'event-with-numbers-123', name: 'Event with Numbers 123' },
        {
          slug: 'very-long-event-name-with-hyphens',
          name: 'Very Long Event Name',
        },
      ];

      for (const testCase of testCases) {
        // Create event
        const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
          slug: testCase.slug,
          name: testCase.name,
          type: 'in-person',
          status: 'published',
          visibility: 'public',
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 90000000).toISOString(),
          timeZone: 'UTC',
          description: `Test event for ${testCase.slug}`,
          maxAttendees: 100,
          categories: [],
        });

        // Query via Application Service
        const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        // Verify the event was found and room created (empty object per Matrix AppService spec)
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      }
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate rooms by tenant ID', async () => {
      // Create test event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-tenant-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: 'tenant-test-event',
        name: 'Tenant Test Event',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for tenant isolation',
        maxAttendees: 100,
        categories: [],
      });

      // Test with correct tenant ID
      const correctTenantAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const correctResponse = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(correctTenantAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Test with incorrect tenant ID
      const incorrectTenantAlias = `#event-${testEvent.slug}-different-tenant:matrix.openmeet.net`;
      const incorrectResponse = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(incorrectTenantAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify correct tenant finds the event (empty object per Matrix AppService spec)
      expect(correctResponse.body).toEqual({});

      // Verify incorrect tenant doesn't find the event
      expect(incorrectResponse.body).toHaveProperty('error');
      expect(incorrectResponse.body.error).toBe('Room not found');
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
