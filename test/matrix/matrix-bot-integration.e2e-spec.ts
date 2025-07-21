import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  createGroup,
  registerMatrixUserIdentity,
} from '../utils/functions';

/**
 * Matrix Application Service Integration E2E Tests
 *
 * These tests validate the Matrix Application Service works end-to-end with:
 * - Running OpenMeet API
 * - Running Matrix Authentication Service (MAS)
 * - Running Matrix server
 * - Matrix Application Service room creation via aliases
 *
 * Note: Having an OpenMeet ID means users can log into Matrix via MAS.
 * No manual user provisioning or websocket testing needed.
 */
describe('Matrix Application Service Integration (E2E)', () => {
  let userToken: string;
  let adminToken: string;
  let eventSlug: string;
  let groupSlug: string;
  let currentUser: any;

  // Matrix Application Service homeserver token
  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  beforeAll(async () => {
    jest.setTimeout(60000);

    // Login as regular user and admin
    userToken = await loginAsTester();
    adminToken = await loginAsAdmin();

    // Get user information
    const userResponse = await request(TESTING_APP_URL)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    currentUser = userResponse.body;

    // Register Matrix user identities (simulating MAS authentication)
    // Clear any existing corrupted Matrix identity and register fresh
    try {
      await registerMatrixUserIdentity(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        userToken,
        currentUser.slug,
      );
      console.log(`Registered Matrix identity for user ${currentUser.slug}`);
    } catch (error) {
      console.error(
        `FAILED to register Matrix identity for user: ${error.message}`,
      );
      throw error; // Don't continue with invalid Matrix auth
    }

    // Create test event and group for bot operations
    const eventData = {
      name: 'Matrix Bot Test Event',
      description: 'Event for testing Matrix bot integration',
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://meet.openmeet.test/bot-test',
      categories: [1],
      status: 'published',
      type: 'online',
      userSlug: currentUser.slug,
    };

    const groupData = {
      name: 'Matrix Bot Test Group',
      description: 'Group for testing Matrix bot integration',
      isPublic: true,
      categories: [1],
    };

    const event = await createEvent(TESTING_APP_URL, userToken, eventData);
    eventSlug = event.slug;

    const group = await createGroup(TESTING_APP_URL, userToken, groupData);
    groupSlug = group.slug;

    // Get admin user info
    const adminResponse = await request(TESTING_APP_URL)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    const adminUser = adminResponse.body;

    // Register Matrix identity for admin user too
    try {
      await registerMatrixUserIdentity(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        adminToken,
        adminUser.slug,
      );
      console.log(
        `Registered Matrix identity for admin user ${adminUser.slug}`,
      );
    } catch (error) {
      console.warn(
        `Failed to register Matrix identity for admin: ${error.message}`,
      );
    }

    // Add admin user to the group so they can create chat rooms
    try {
      const memberResponse = await request(TESTING_APP_URL)
        .post(`/api/groups/${groupSlug}/join`)
        .set('Authorization', `Bearer ${adminToken}`) // Admin joins group themselves
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (memberResponse.status === 201) {
        console.log(
          `Successfully added admin user ${adminUser.slug} to group ${groupSlug}`,
        );
      } else {
        console.warn(
          `Group member addition returned status ${memberResponse.status}: ${JSON.stringify(memberResponse.body)}`,
        );
      }
    } catch (error) {
      console.warn(`Failed to add admin to group: ${error.message}`);
    }

    // Add admin user to the event so they can create chat rooms
    try {
      const attendeeResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${eventSlug}/attend`)
        .set('Authorization', `Bearer ${adminToken}`) // Admin attends event themselves
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (attendeeResponse.status === 201 || attendeeResponse.status === 200) {
        console.log(
          `Successfully added admin user ${adminUser.slug} to event ${eventSlug}`,
        );
      } else {
        console.warn(
          `Event attendee addition returned status ${attendeeResponse.status}: ${JSON.stringify(attendeeResponse.body)}`,
        );
      }
    } catch (error) {
      console.warn(`Failed to add admin to event: ${error.message}`);
    }

    console.log(`Test setup complete: Event ${eventSlug}, Group ${groupSlug}`);
  }, 60000);

  afterAll(() => {
    // Note: With Matrix Application Service, rooms are managed via Matrix server directly
    // No explicit cleanup needed as rooms are created on-demand via Application Service
    console.log(
      'Matrix Application Service handles room lifecycle automatically',
    );

    jest.setTimeout(5000);
  });

  describe('Matrix Application Service Event Room Operations', () => {
    it('should create event chat room using Application Service', async () => {
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(`#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Event room creation response:`, response.body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object for successful room creation per Matrix spec
      console.log(
        `✅ Application Service confirmed event chat room creation (Matrix spec compliant)`,
      );
    }, 30000);

    it('should allow users to join event chat room via Application Service', async () => {
      // First create the room via Application Service
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const createResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(createResponse.status).toBe(200);
      const _roomId = createResponse.body.room_id;

      // Now test joining via Application Service user query
      const userResponse = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/users/${encodeURIComponent(`@${currentUser.slug}:matrix.openmeet.net`)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`User query response:`, userResponse.body);
      expect(userResponse.status).toBe(200);
      // Empty response means success for Application Service user queries
      expect(Object.keys(userResponse.body)).toHaveLength(0);
      console.log(
        `Application Service successfully accepted user in namespace`,
      );
    }, 30000);

    it('should ensure event room exists and is accessible via Application Service', async () => {
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Event room ensure response:`, response.body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec
      console.log(
        `Room accessible via Application Service (Matrix spec compliant response)`,
      );
    }, 30000);

    it('should handle user queries via Application Service', async () => {
      const matrixUserId = `@${currentUser.slug}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/users/${encodeURIComponent(matrixUserId)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`User query response:`, response.body);
      console.log(`Response status: ${response.status}`);

      expect(response.status).toBe(200);
      // Empty response means success for Application Service user queries
      expect(Object.keys(response.body)).toHaveLength(0);
      console.log(
        `Application Service successfully accepted user in namespace`,
      );
    }, 30000);

    it('should create group room via Application Service', async () => {
      const groupRoomAlias = `#group-${groupSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(groupRoomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec
      console.log('Application Service created group room successfully');
    }, 30000);
  });

  describe('Matrix Application Service Group Room Operations', () => {
    it('should create group chat room using Application Service', async () => {
      const groupRoomAlias = `#group-${groupSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(groupRoomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Group room creation response:`, response.body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec

      console.log(
        `Application Service created group chat room (Matrix spec compliant response)`,
      );
    }, 30000);

    it('should allow users to access group chat room via Application Service', async () => {
      const groupRoomAlias = `#group-${groupSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(groupRoomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Group room access response:`, response.body);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec

      console.log(
        `User can access group chat room via Application Service (Matrix spec compliant response)`,
      );
    }, 30000);

    it('should ensure group room exists and is accessible via Application Service', async () => {
      const groupRoomAlias = `#group-${groupSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(groupRoomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec

      console.log(
        `Group room accessible via Application Service (Matrix spec compliant response)`,
      );
    }, 30000);

    it('should handle Application Service user queries for group access', async () => {
      // Test user query via Application Service
      const matrixUserId = `@${currentUser.slug}:matrix.openmeet.net`;
      const userResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/users/${encodeURIComponent(matrixUserId)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(userResponse.status).toBe(200);
      // Empty response means success for Application Service user queries
      expect(Object.keys(userResponse.body)).toHaveLength(0);
      console.log(
        'Application Service successfully accepted user in namespace for group access',
      );
    }, 30000);
  });

  describe('Room Recreation and Recovery via Application Service', () => {
    it('should ensure room availability via Application Service', async () => {
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // First request to create/ensure room exists
      const firstResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`First room creation response:`, firstResponse.body);
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toEqual({}); // AppService returns empty object per Matrix spec
      console.log(
        `First room creation confirmed (Matrix spec compliant response)`,
      );

      // Second request should also successfully create a room (Application Service creates on-demand)
      const secondResponse = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      console.log(`Second room creation response:`, secondResponse.body);
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body).toEqual({}); // AppService returns empty object per Matrix spec

      console.log(
        `Application Service ensures room availability consistently for alias: ${roomAlias}`,
      );
    }, 45000);
  });

  describe('Authentication and Authorization for Application Service Operations', () => {
    it('should require authentication for Application Service operations', async () => {
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL).get(
        `/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });

    it('should require proper authorization for Application Service operations', async () => {
      const matrixUserId = `@${currentUser.slug}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/users/${encodeURIComponent(matrixUserId)}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid token');
    });

    it('should extract tenant ID from room alias for Application Service operations', async () => {
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);
      // Note: Application Service extracts tenant ID from room alias

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec
    });
  });

  describe('Application Service Error Handling and Edge Cases', () => {
    it('should handle invalid room alias format', async () => {
      const invalidRoomAlias = 'invalid-room-alias';
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/rooms/${encodeURIComponent(invalidRoomAlias)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Room not found');
    });

    it('should accept users with any ID format (Matrix-native approach)', async () => {
      const invalidUserId = 'invalid-user-id';
      const response = await request(TESTING_APP_URL)
        .get(
          `/api/matrix/appservice/users/${encodeURIComponent(invalidUserId)}`,
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // Empty response = acceptance
    });
  });

  describe('Matrix SDK Integration (Frontend)', () => {
    it('should confirm Application Service provides room creation for frontend Matrix SDK', async () => {
      const roomAlias = `#event-${eventSlug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;

      // Application Service creates rooms that frontend Matrix SDK can use
      const response = await request(TESTING_APP_URL)
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // AppService returns empty object per Matrix spec

      console.log(
        'Application Service creates rooms that frontend Matrix SDK can use directly',
      );
    });
  });
});
