import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createTestUser } from '../utils/functions';

describe('Matrix Room Creation and Invitation Flow (e2e)', () => {
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

  describe('AppService Room Query Validation', () => {
    it('should validate event existence during room query', async () => {
      // Create a test user and event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-query-validation-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-query-${Date.now()}`,
        name: 'Test Event for Query Validation',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for room query validation',
        maxAttendees: 100,
        categories: [],
      });

      // Query the Application Service for the room alias
      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify the AppService returns success for valid event (empty object per Matrix spec)
      expect(response.body).toEqual({});
    });

    it('should reject room queries for non-existent events', async () => {
      // Query for a non-existent event
      const roomAlias = `#event-nonexistent-event-${Date.now()}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      // Verify the AppService returns error for non-existent event
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });

    it('should validate room alias format patterns', async () => {
      const testCases = [
        {
          alias: `#event-valid-event-${TESTING_TENANT_ID}:matrix.openmeet.net`,
          description: 'valid event alias format',
          expectedError: 'Room not found', // Event doesn't exist
        },
        {
          alias: `#group-valid-group-${TESTING_TENANT_ID}:matrix.openmeet.net`,
          description: 'valid group alias format',
          expectedError: 'Room not found', // Group doesn't exist
        },
        {
          alias: `#invalid-prefix-${TESTING_TENANT_ID}:matrix.openmeet.net`,
          description: 'invalid prefix',
          expectedError: 'Room not found',
        },
        {
          alias: `#event-missing-tenant:matrix.openmeet.net`,
          description: 'missing tenant ID',
          expectedError: 'Room not found',
        },
      ];

      for (const testCase of testCases) {
        const response = await server
          .get(
            `/api/matrix/appservice/rooms/${encodeURIComponent(testCase.alias)}`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe(testCase.expectedError);
      }
    });
  });

  describe('Matrix Event Handlers and Room Configuration', () => {
    it('should handle m.room.create events', async () => {
      // Create test event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-create-event-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-create-${Date.now()}`,
        name: 'Test Event for Create Handler',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for create handler',
        maxAttendees: 100,
        categories: [],
      });

      // Simulate Matrix server sending m.room.create event to AppService
      const roomId = `!test-room-${Date.now()}:matrix.openmeet.net`;
      const roomCreateEvent = {
        events: [
          {
            type: 'm.room.create',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: {
              creator: '@system:matrix.openmeet.net',
            },
            state_key: '',
            event_id: `$create-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
        ],
      };

      const response = await server
        .put(
          `/api/matrix/appservice/_matrix/app/v1/transactions/txn-${Date.now()}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(roomCreateEvent)
        .expect(200);

      // Verify successful processing
      expect(response.body).toEqual({});
    });

    it('should handle m.room.canonical_alias events and configure event rooms', async () => {
      // Create test event with confirmed attendee
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-alias-event-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-alias-${Date.now()}`,
        name: 'Test Event for Alias Handler',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for alias handler',
        maxAttendees: 100,
        categories: [],
      });

      // Join the event as an attendee
      await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      // Simulate Matrix server sending m.room.canonical_alias event to AppService
      const roomId = `!test-room-alias-${Date.now()}:matrix.openmeet.net`;
      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const roomAliasEvent = {
        events: [
          {
            type: 'm.room.canonical_alias',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: {
              alias: roomAlias,
            },
            state_key: '',
            event_id: `$alias-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
        ],
      };

      const response = await server
        .put(
          `/api/matrix/appservice/_matrix/app/v1/transactions/txn-${Date.now()}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(roomAliasEvent)
        .expect(200);

      // Verify successful processing
      expect(response.body).toEqual({});

      // TODO: Add verification that attendees were invited
      // This would require mocking the Matrix SDK or testing against a real Matrix server
    });

    it('should process multiple event types in a single transaction', async () => {
      const roomId = `!test-room-multi-${Date.now()}:matrix.openmeet.net`;
      const multiEventTransaction = {
        events: [
          {
            type: 'm.room.create',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: { creator: '@system:matrix.openmeet.net' },
            state_key: '',
            event_id: `$create-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
          {
            type: 'm.room.name',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: { name: 'Test Room' },
            state_key: '',
            event_id: `$name-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
          {
            type: 'm.room.topic',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: { topic: 'Test Room Topic' },
            state_key: '',
            event_id: `$topic-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
          {
            type: 'm.room.join_rules',
            room_id: roomId,
            sender: '@system:matrix.openmeet.net',
            content: { join_rule: 'invite' },
            state_key: '',
            event_id: `$join-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
        ],
      };

      const response = await server
        .put(
          `/api/matrix/appservice/_matrix/app/v1/transactions/txn-${Date.now()}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(multiEventTransaction)
        .expect(200);

      expect(response.body).toEqual({});
    });
  });

  describe('Real-time Event Listener Invitation Flow', () => {
    it('should handle chat.event.member.add events', async () => {
      // Create test event and user
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-member-add-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-member-add-${Date.now()}`,
        name: 'Test Event for Member Add',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for member add flow',
        maxAttendees: 100,
        categories: [],
      });

      // Join the event as an attendee to trigger the member add flow
      const joinResponse = await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      // Verify attendee was created successfully
      expect(joinResponse.body).toHaveProperty('id');
      expect(joinResponse.body).toHaveProperty('status', 'confirmed');
      expect(joinResponse.body).toHaveProperty('user');
      expect(joinResponse.body).toHaveProperty('event');

      // TODO: Verify that the event listener was triggered and Matrix invitation was attempted
      // This would require either:
      // 1. Mocking the Matrix services to capture invitations
      // 2. Testing against a real Matrix server
      // 3. Adding a test endpoint to check event listener activity
    });

    it('should handle user removal from events', async () => {
      // Create test event and user
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-member-remove-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-member-remove-${Date.now()}`,
        name: 'Test Event for Member Remove',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for member remove flow',
        maxAttendees: 100,
        categories: [],
      });

      // Join then leave the event
      await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      const leaveResponse = await server
        .post(`/api/events/${testEvent.slug}/cancel-attending`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(201);

      // Verify attendee was cancelled successfully
      expect(leaveResponse.body).toHaveProperty('id');
      expect(leaveResponse.body).toHaveProperty('status', 'cancelled');
      expect(leaveResponse.body).toHaveProperty('user');
      expect(leaveResponse.body).toHaveProperty('event');

      // TODO: Verify that the event listener handled removal from Matrix room
    });

    it('should sync existing event attendees to Matrix', async () => {
      // Create test event and multiple users
      const testUser1 = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-sync-1-${Date.now()}@openmeet.net`,
        'Test',
        'User1',
      );
      const testUser2 = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-sync-2-${Date.now()}@openmeet.net`,
        'Test',
        'User2',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser1.token, {
        slug: `test-event-sync-${Date.now()}`,
        name: 'Test Event for Sync',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for attendee sync',
        maxAttendees: 100,
        categories: [],
      });

      // Have both users join the event
      await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser1.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser2.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      // TODO: Test manual sync functionality if such an endpoint exists
      // This would verify that existing attendees can be synced to Matrix rooms
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle Unknown room errors gracefully', async () => {
      // Create a test event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-unknown-room-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-unknown-room-${Date.now()}`,
        name: 'Test Event for Unknown Room Error',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for unknown room error handling',
        maxAttendees: 100,
        categories: [],
      });

      // Join the event (this should trigger Matrix room invitation)
      const joinResponse = await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      // Verify attendee was created successfully
      expect(joinResponse.body).toHaveProperty('id');
      expect(joinResponse.body).toHaveProperty('status', 'confirmed');
      expect(joinResponse.body).toHaveProperty('user');
      expect(joinResponse.body).toHaveProperty('event');

      // The key issue is that the Matrix SDK might return "Unknown room" errors
      // when trying to invite users to rooms that don't exist yet
      // This test validates that such errors are handled gracefully
      // TODO: Add specific error handling verification once Matrix mocking is in place
    });

    it('should handle malformed Matrix events in transactions', async () => {
      const malformedEvent = {
        events: [
          {
            type: 'm.room.create',
            // Missing required fields like room_id, sender, etc.
            content: {},
          },
          {
            // Completely invalid event structure
            invalid: 'data',
          },
        ],
      };

      const response = await server
        .put(
          `/api/matrix/appservice/_matrix/app/v1/transactions/txn-malformed-${Date.now()}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(malformedEvent)
        .expect(200);

      // AppService should handle malformed events gracefully
      expect(response.body).toEqual({});
    });

    it('should handle missing Matrix handles for users', async () => {
      // Create a test user without Matrix setup
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-no-matrix-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-no-matrix-${Date.now()}`,
        name: 'Test Event for No Matrix Handle',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for no Matrix handle',
        maxAttendees: 100,
        categories: [],
      });

      // Join the event (should succeed even without Matrix handle)
      const joinResponse = await server
        .post(`/api/events/${testEvent.slug}/attend`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ attendeeStatus: 'confirmed' })
        .expect(201);

      // Verify attendee was created successfully
      expect(joinResponse.body).toHaveProperty('id');
      expect(joinResponse.body).toHaveProperty('status', 'confirmed');
      expect(joinResponse.body).toHaveProperty('user');
      expect(joinResponse.body).toHaveProperty('event');

      // The system should gracefully handle users without Matrix handles
      // and not fail the entire invitation process
    });

    it('should validate AppService namespace configuration', async () => {
      // Test room aliases that should match the configured namespace
      const validNamespaceAliases = [
        `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`,
        `#group-test-${TESTING_TENANT_ID}:matrix.openmeet.net`,
      ];

      // Test room aliases that should NOT match the configured namespace
      const invalidNamespaceAliases = [
        `#event-test-${TESTING_TENANT_ID}:other-server.net`,
        `#other-prefix-test-${TESTING_TENANT_ID}:matrix.openmeet.net`,
      ];

      // All these should return "Room not found" since events/groups don't exist
      // But they should be processed by the AppService (not rejected due to namespace mismatch)
      for (const alias of [
        ...validNamespaceAliases,
        ...invalidNamespaceAliases,
      ]) {
        const response = await server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(alias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('Room not found');
      }
    });

    it('should handle concurrent room creation requests', async () => {
      // Create a test event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-concurrent-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );
      const testEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-event-concurrent-${Date.now()}`,
        name: 'Test Event for Concurrent Requests',
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test event for concurrent room creation',
        maxAttendees: 100,
        categories: [],
      });

      const roomAlias = `#event-${testEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // Make multiple concurrent requests to the AppService
      const concurrentRequests = Array.from({ length: 5 }, (_, _i) =>
        server
          .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`),
      );

      const responses = await Promise.all(concurrentRequests);

      // All requests should succeed
      responses.forEach((response, _index) => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({});
      });
    });
  });

  describe('Authorization and Security', () => {
    it('should reject AppService requests without proper authorization', async () => {
      const roomAlias = `#event-test-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // Test missing authorization header
      const noAuthResponse = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .expect(200);

      expect(noAuthResponse.body).toHaveProperty('error');
      expect(noAuthResponse.body.error).toBe('Invalid token');

      // Test invalid authorization token
      const invalidAuthResponse = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(invalidAuthResponse.body).toHaveProperty('error');
      expect(invalidAuthResponse.body.error).toBe('Invalid token');
    });

    it('should reject transaction requests without proper authorization', async () => {
      const txnId = `txn-auth-test-${Date.now()}`;
      const testTransaction = {
        events: [
          {
            type: 'm.room.message',
            room_id: '!test:matrix.openmeet.net',
            sender: '@test:matrix.openmeet.net',
            content: { msgtype: 'm.text', body: 'test message' },
            event_id: `$test-${Date.now()}`,
            origin_server_ts: Date.now(),
          },
        ],
      };

      // Test missing authorization header
      const noAuthResponse = await server
        .put(`/api/matrix/appservice/_matrix/app/v1/transactions/${txnId}`)
        .send(testTransaction)
        .expect(200);

      expect(noAuthResponse.body).toHaveProperty('error');
      expect(noAuthResponse.body.error).toBe('Invalid token');

      // Test invalid authorization token
      const invalidAuthResponse = await server
        .put(`/api/matrix/appservice/_matrix/app/v1/transactions/${txnId}`)
        .set('Authorization', 'Bearer invalid-token')
        .send(testTransaction)
        .expect(200);

      expect(invalidAuthResponse.body).toHaveProperty('error');
      expect(invalidAuthResponse.body.error).toBe('Invalid token');
    });
  });
});
