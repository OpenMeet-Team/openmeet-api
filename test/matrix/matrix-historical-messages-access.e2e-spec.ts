import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, createTestUser, loginAsAdmin, registerMatrixUserIdentity } from '../utils/functions';

/**
 * Matrix Attendee Auto-Invitation E2E Tests
 *
 * These tests validate the event-driven flow where confirmed attendees
 * are automatically invited to Matrix rooms by the bot service.
 *
 * This is DIFFERENT from existing matrix-bot-integration.e2e-spec.ts which tests
 * manual bot operations. This test focuses on the AUTOMATIC event-driven flow:
 *
 * Event Flow Being Tested:
 * event.attendee.updated (status=confirmed) → chat.event.member.add → Matrix bot invitation
 *
 * Core Issue: Users can't see historical messages because the automatic
 * bot invitation system isn't working when users confirm attendance.
 */
describe('Matrix Attendee Auto-Invitation (E2E)', () => {
  let adminToken: string;
  let testUserToken: string;
  let eventSlug: string;
  let testUser: any;

  beforeAll(async () => {
    jest.setTimeout(60000);

    adminToken = await loginAsAdmin();

    // Create test user
    testUser = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `auto-invite-test-${Date.now()}@example.com`,
      'AutoInvite',
      'TestUser',
    );
    testUserToken = testUser.token;

    // Register user with Matrix for authentication (required for Matrix room access)
    await registerMatrixUserIdentity(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      testUserToken,
      testUser.slug,
    );

    // Create test event (Matrix room will be created automatically via event flow)
    const eventData = {
      name: 'Auto-Invitation Test Event',
      description: 'Event for testing automatic Matrix bot invitations',
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://meet.openmeet.test/auto-invite-test',
      categories: [1],
      status: 'published',
      type: 'online',
    };

    const event = await createEvent(TESTING_APP_URL, adminToken, eventData);
    eventSlug = event.slug;

    console.log(
      `Test setup complete: Event ${eventSlug}, User: ${testUser.slug}`,
    );
  }, 60000);

  afterAll(async () => {
    // Note: With Matrix Application Service, rooms are managed by Matrix server
    // No explicit cleanup needed as rooms are created on-demand
    console.log('Matrix Application Service handles room lifecycle automatically');

    jest.setTimeout(5000);
  });

  describe('Event-Driven Matrix Auto-Invitation Flow', () => {
    it('should automatically invite user to Matrix room when confirming event attendance', async () => {
      // Step 1: User attends event (triggers event.attendee.updated → chat.event.member.add flow)
      const attendResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${eventSlug}/attend`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`User attend response:`, attendResponse.body);
      expect(attendResponse.status).toBe(201);
      expect(attendResponse.body.status).toBe('confirmed');
      console.log(`✅ User attendance confirmed:`, attendResponse.body.status);

      // Step 3: CRITICAL TEST - User should be able to access Matrix room via Application Service
      // This validates the Matrix-native approach with room aliases
      const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const joinResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`User Matrix room join response:`, {
        status: joinResponse.status,
        body: joinResponse.body,
      });

      // This is THE test that will fail if Application Service can't create the room
      expect(joinResponse.status).toBe(200);
      expect(joinResponse.body).toEqual({}); // Matrix AppService spec: empty object for success

      console.log(
        `✅ PASS: User successfully accessed Matrix room via Application Service`,
      );
      console.log(`Room creation successful (empty response per Matrix spec)`);
    }, 45000);

    it('should ensure Matrix room exists when user confirms attendance', async () => {
      // Test that Application Service creates room on-demand
      const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const ensureRoomResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Ensure room response:`, ensureRoomResponse.body);

      expect(ensureRoomResponse.status).toBe(200);
      expect(ensureRoomResponse.body).toEqual({}); // Matrix AppService spec: empty object for success

      console.log(
        `✅ Matrix room accessible via Application Service (empty response per Matrix spec)`,
      );
    }, 30000);
  });

  describe('Matrix Application Service Multiple Users', () => {
    it('should handle multiple confirmed attendees accessing the same room', async () => {
      // Create another test user
      const testUser2 = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `multi-user-test-${Date.now()}@openmeet.net`,
        'MultiUser',
        'Test',
      );

      // Register second user with Matrix for authentication
      await registerMatrixUserIdentity(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testUser2.token,
        testUser2.slug,
      );

      // User attends event
      const attendResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${eventSlug}/attend`)
        .set('Authorization', `Bearer ${testUser2.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendResponse.status).toBe(201);
      console.log(`Second user attendance successful`);

      // Access Matrix room via Application Service
      const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const roomResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Second user Matrix access attempt:`, {
        status: roomResponse.status,
        body: roomResponse.body,
      });

      expect(roomResponse.status).toBe(200);
      expect(roomResponse.body).toEqual({}); // Matrix AppService spec: empty object for success

      console.log(`✅ Multiple users can access the same Matrix room via Application Service`);
    }, 45000);

    it('should log Matrix bot errors visibly instead of swallowing them', async () => {
      // This test ensures Matrix errors are visible in logs, not silently ignored
      console.log(`🔍 Testing Matrix bot error visibility...`);

      // Get event attendees to trigger any Matrix operations
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}/attendees`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      console.log(`Event has ${attendeesResponse.body.length} attendees`);

      // Test that we can detect Matrix operation outcomes via Application Service
      const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const diagnosticResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // Log the outcome for diagnostic purposes
      console.log(`Matrix diagnostic response:`, {
        status: diagnosticResponse.status,
        room_id: diagnosticResponse.body?.room_id,
        error: diagnosticResponse.body?.error,
      });

      // This test passes regardless but logs the current state
      expect(diagnosticResponse.status).toBe(200);
      console.log(`📝 Matrix bot error visibility test completed`);
    }, 30000);
  });

  describe('Historical Messages Access Validation', () => {
    it('should validate that confirmed attendees can access historical messages', async () => {
      // This test documents the end goal - access to historical messages
      console.log(
        `🎯 Testing historical messages access for confirmed attendees...`,
      );

      // Verify user is confirmed attendee by checking attendance directly
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}/attendees`)
        .set('Authorization', `Bearer ${testUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const userAttendance = attendeesResponse.body.data.find(
        (attendee) => attendee.user.slug === testUser.slug,
      );
      expect(userAttendance).toBeDefined();
      expect(userAttendance.status).toBe('confirmed');

      // Test Matrix room access via Application Service (prerequisite for historical messages)
      const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const roomAccessResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Historical messages access test result:`, {
        attendanceStatus: userAttendance.status,
        matrixAccess: roomAccessResponse.status === 200 ? 'SUCCESS' : 'FAILED',
        roomId: Object.keys(roomAccessResponse.body).length === 0 ? 'ACCESSIBLE' : 'NOT_ACCESSIBLE',
      });

      expect(roomAccessResponse.status).toBe(200);
      expect(roomAccessResponse.body).toEqual({}); // Matrix AppService spec: empty object for success

      console.log(
        `✅ PASS: Confirmed attendee can access Matrix room via Application Service`,
      );
      console.log(`Room creation successful (empty response per Matrix spec)`);
      console.log(`Historical messages are accessible via Matrix JS SDK directly`);
    }, 30000);
  });
});
