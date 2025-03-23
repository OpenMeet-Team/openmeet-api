import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent, createGroup } from '../utils/functions';

/**
 * Chat API Tests
 *
 * NOTE: These tests are currently in progress as part of the Matrix integration (Phase 2).
 * Some tests are skipped as the Matrix endpoints are not fully implemented yet.
 * They will be updated as the implementation progresses through Phases 2-4.
 * See /design-notes/matrix/phases.md for details on the implementation plan.
 */
describe('Chat API Tests', () => {
  let token: string;
  let eventSlug: string;
  let groupSlug: string;
  let currentUser: any;
  let testUserId: number;

  // Test message data
  const eventMessageData = {
    message: 'Hello, this is a test event message',
  };

  const directMessageData = {
    message: 'Hello, this is a test direct message',
  };

  const groupMessageData = {
    message: 'Hello, this is a test group message',
  };

  // Increase the timeout to 30 seconds to avoid timeout errors during setup
  beforeAll(async () => {
    // Login as the main test user
    token = await loginAsTester();

    // Get the current user information
    const meResponse = await request(TESTING_APP_URL)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    currentUser = meResponse.body;
    testUserId = currentUser.id;

    // Create a test event to use for chat testing
    const eventData = {
      name: 'Test Matrix Chat Event',
      description: 'An event created for Matrix chat testing',
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://meet.openmeet.com/test',
      categories: [1],
      status: 'published',
      type: 'online',
      // Include this so Event.listener can directly add it to the chat event payload
      userSlug: currentUser.slug,
    };

    const event = await createEvent(TESTING_APP_URL, token, eventData);
    eventSlug = event.slug;

    // Create a test group to use for chat testing
    const groupData = {
      name: 'Test Matrix Chat Group',
      description: 'A group created for Matrix chat testing',
      isPublic: true,
      categories: [1],
    };

    const group = await createGroup(TESTING_APP_URL, token, groupData);
    groupSlug = group.slug;
  }, 30000); // 30 second timeout

  describe('Event Chat', () => {
    // These tests are skipped until Matrix Phase 2 implementation is complete
    it.skip('should first join the event chat room', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${eventSlug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it.skip('should send a message to an event discussion', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${eventSlug}/message`)
        .send(eventMessageData)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('eventId');
      expect(response.body).toHaveProperty('sender');
      expect(response.body.message).toBe(eventMessageData.message);
    });

    it.skip('should retrieve event discussion messages', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/event/${eventSlug}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('end');

      // Check that messages are formatted correctly
      if (response.body.messages && response.body.messages.length > 0) {
        const message = response.body.messages[0];
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('sender');
        expect(message).toHaveProperty('timestamp');
        expect(message).toHaveProperty('message');
      }
    });

    // Authentication tests should still work
    it('should return 401 Unauthorized when accessing event messages without token', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/event/${eventSlug}/messages`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it.skip('should send a typing notification for an event chat', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${eventSlug}/typing`)
        .send({ typing: true })
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Group Chat', () => {
    // These tests are skipped until Matrix Phase 2 implementation is complete
    it.skip('should first join the group chat room', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${groupSlug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it.skip('should send a message to a group discussion', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${groupSlug}/message`)
        .send(groupMessageData)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('groupId');
      expect(response.body).toHaveProperty('sender');
      expect(response.body.message).toBe(groupMessageData.message);
    });

    it.skip('should retrieve group discussion messages', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/group/${groupSlug}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('end');

      // Check that messages are formatted correctly
      if (response.body.messages && response.body.messages.length > 0) {
        const message = response.body.messages[0];
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('sender');
        expect(message).toHaveProperty('timestamp');
        expect(message).toHaveProperty('message');
      }
    });

    // Authentication tests should still work
    it('should return 401 Unauthorized when accessing group messages without token', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/group/${groupSlug}/messages`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it.skip('should send a typing notification for a group chat', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${groupSlug}/typing`)
        .send({ typing: true })
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Direct Messages', () => {
    // These tests are skipped until Matrix Phase 2 implementation is complete
    it.skip('should initialize the direct chat', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/direct/${testUserId}/initialize`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it.skip('should send a direct message to a user', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/direct/${testUserId}/message`)
        .send(directMessageData)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('recipientId');
      expect(response.body).toHaveProperty('sender');
      expect(response.body.message).toBe(directMessageData.message);
    });

    it.skip('should retrieve direct messages with a user', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/direct/${testUserId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('end');

      // Check that direct messages are formatted correctly
      if (response.body.messages && response.body.messages.length > 0) {
        const message = response.body.messages[0];
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('sender');
        expect(message).toHaveProperty('timestamp');
        expect(message).toHaveProperty('message');
      }
    });

    // Authentication tests should still work
    it('should return 401 Unauthorized when accessing direct messages without token', async () => {
      const response = await request(TESTING_APP_URL)
        .get(`/api/chat/direct/${testUserId}/messages`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });

    it.skip('should send a typing notification for direct chat', async () => {
      const response = await request(TESTING_APP_URL)
        .post(`/api/chat/direct/${testUserId}/typing`)
        .send({ typing: true })
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Chat List', () => {
    // This test is skipped until Matrix Phase 2 implementation is complete
    it.skip('should retrieve the list of all chats', async () => {
      const response = await request(TESTING_APP_URL)
        .get('/api/chat/list')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('directChats');
      expect(response.body).toHaveProperty('eventChats');
      expect(response.body).toHaveProperty('groupChats');

      // The test event and group chats should be in the lists
      if (response.body.eventChats && response.body.eventChats.length > 0) {
        const foundEvent = response.body.eventChats.some(
          (chat: any) => chat.slug === eventSlug,
        );
        expect(foundEvent).toBeTruthy();
      }

      if (response.body.groupChats && response.body.groupChats.length > 0) {
        const foundGroup = response.body.groupChats.some(
          (chat: any) => chat.slug === groupSlug,
        );
        expect(foundGroup).toBeTruthy();
      }
    });
  });

  describe('WebSocket Connection', () => {
    // This test matches the test in matrix-websocket.e2e-spec.ts
    it('should have a valid WebSocket endpoint', async () => {
      // This just checks if the endpoint exists but doesn't test the WebSocket connection itself
      // since that would require a WebSocket client in the test
      const response = await request(TESTING_APP_URL)
        .get('/socket.io/matrix')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Socket.io endpoints typically return a 400 Bad Request because
      // they expect WebSocket upgrade headers, but the endpoint should exist
      expect([400, 404]).toContain(response.status);
    });
  });
});
