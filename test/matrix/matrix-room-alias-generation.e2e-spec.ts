import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createGroup, createTestUser } from '../utils/functions';
import { cleanupTestEntities } from '../utils/database-cleanup';

describe('Matrix Room Alias Generation (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  // Clean up test data before running tests to prevent interference
  beforeAll(async () => {
    await cleanupTestEntities(['simple-group', 'another-very-long-group', 'group-with-numbers', 'test-group']);
  });

  // Clean up test data after tests complete
  afterAll(async () => {
    await cleanupTestEntities(['simple-group', 'another-very-long-group', 'group-with-numbers', 'test-group']);
  });

  describe('Event Room Alias Generation', () => {
    it('should generate correct room alias for simple event slug', async () => {
      // 1. Create a test user and event with simple slug
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-simple-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: 'simple-event',
        name: 'Simple Event',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for simple alias testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Query the Application Service
      const expectedAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(expectedAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the alias is generated correctly (empty object per Matrix spec)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('should generate correct room alias for event slug with hyphens', async () => {
      // 1. Create a test event with hyphenated slug
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-hyphens-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: 'multi-word-event-name',
        name: 'Multi Word Event Name',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for hyphenated alias testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Query the Application Service
      const expectedAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(expectedAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the alias is generated correctly (empty object per Matrix spec)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('should generate correct room alias for event slug with numbers', async () => {
      // 1. Create a test event with numbers in slug
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: 'event-2024-conference',
        name: 'Event 2024 Conference',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for number alias testing',
        maxAttendees: 100,
        categories: [],
      });

      // 2. Query the Application Service
      const expectedAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(expectedAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the alias is generated correctly (empty object per Matrix spec)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });
  });

  describe('Group Room Alias Generation', () => {
    it('should generate correct room alias for simple group slug', async () => {
      // 1. Create a test group with simple slug
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        slug: 'simple-group',
        name: 'Simple Group',
        description: 'Test group for simple alias testing',
        isPublic: true,
        categories: [],
      });

      // 2. Query the Application Service
      const expectedAlias = `#group-${testGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(expectedAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the alias is generated correctly (empty object per Matrix spec)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('should generate correct room alias for group slug with hyphens', async () => {
      // 1. Create a test group with hyphenated slug
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        slug: 'multi-word-group-name',
        name: 'Multi Word Group Name',
        description: 'Test group with hyphenated slug for room alias testing',
        createdBy: testUser.id,
      });

      // 2. Query the Application Service
      const expectedAlias = `#group-${testGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(expectedAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Verify the alias is generated correctly (empty object per Matrix spec)
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });
  });

  describe('Room Alias Parsing', () => {
    it('should correctly parse event room aliases', async () => {
      // This test will verify that the Application Service can parse room aliases correctly
      // We'll test this by creating events with different slug patterns and verifying they're found

      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testCases = [
        {
          slug: 'simple-event',
          name: 'Simple Event',
        },
        {
          slug: 'event-with-numbers-123',
          name: 'Event with Numbers 123',
        },
        {
          slug: 'very-long-event-name-with-many-hyphens',
          name: 'Very Long Event Name with Many Hyphens',
        },
      ];

      for (const testCase of testCases) {
        // 1. Create test event
        const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
          slug: testCase.slug,
          name: testCase.name,
          type: 'in-person',
          status: 'published',
          visibility: 'public',
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 90000000).toISOString(),
          timeZone: 'UTC',
          description: 'Test event for room alias parsing',
          maxAttendees: 100,
          categories: [],
        });

        // 2. Query via Application Service
        const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        // 3. Verify the event was found (empty object per Matrix spec) - AppService indicates room alias exists
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      }
    });

    it('should correctly parse group room aliases', async () => {
      // This test will verify that the Application Service can parse group room aliases correctly

      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testCases = [
        {
          slug: 'simple-group',
          name: 'Simple Group',
        },
        {
          slug: 'group-with-numbers-456',
          name: 'Group with Numbers 456',
        },
        {
          slug: 'another-very-long-group-name',
          name: 'Another Very Long Group Name',
        },
      ];

      for (const testCase of testCases) {
        // 1. Create test group
        const testGroup = await createGroup(TESTING_APP_URL, testUser.token, {
          slug: testCase.slug,
          name: testCase.name,
          description: 'Test group for room alias parsing',
          createdBy: testUser.id,
        });

        // 2. Query via Application Service
        const roomAlias = `#group-${testGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        // 3. Verify the group was found (empty object per Matrix spec) - AppService indicates room alias exists
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      }
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate rooms by tenant ID in alias', async () => {
      // 1. Create test event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: 'tenant-isolated-event',
        name: 'Tenant Isolated Event',
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

      // 2. Test with correct tenant ID
      const correctTenantAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const correctResponse = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(correctTenantAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 3. Test with incorrect tenant ID
      const incorrectTenantAlias = `#event-${testEvent.slug}-different-tenant:matrix.openmeet.net`;
      const incorrectResponse = await server
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(incorrectTenantAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // 4. Verify correct tenant finds the event, incorrect tenant doesn't
      if (correctResponse.body.room_id) {
        expect(correctResponse.body.room_id).toMatch(/^!/);
      }

      expect(incorrectResponse.body).toHaveProperty('error');
      expect(incorrectResponse.body.error).toBe('Room not found');
    });
  });

  describe('Matrix-Safe Slug Handling', () => {
    it('should handle slugs that need Matrix sanitization', async () => {
      // Matrix room aliases have specific character restrictions
      // This test ensures our system can handle edge cases

      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      // Note: In a real implementation, these might be sanitized before reaching the alias
      const testCases = [
        {
          slug: 'event-with-underscores_test',
          name: 'Event with Underscores Test',
          shouldWork: true, // Underscores are generally allowed in Matrix
        },
        {
          slug: 'event-with-dots.test',
          name: 'Event with Dots Test',
          shouldWork: true, // Dots are generally allowed in Matrix
        },
      ];

      for (const testCase of testCases) {
        // 1. Create test event
        const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
          slug: testCase.slug,
          name: testCase.name,
          type: 'in-person',
          status: 'published',
          visibility: 'public',
          startDate: new Date(Date.now() + 86400000).toISOString(),
          endDate: new Date(Date.now() + 90000000).toISOString(),
          timeZone: 'UTC',
          description: 'Test event for room alias parsing',
          maxAttendees: 100,
          categories: [],
        });

        // 2. Query via Application Service
        const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        // 3. Verify room creation - test cases should work since shouldWork is true
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      }
    });
  });
});
