import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
  addUserToEvent,
  addUserToGroup,
} from '../utils/functions';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import request from 'supertest';

/**
 * Message Redaction E2E Tests
 *
 * These tests validate message redaction functionality with proper permissions:
 * - Users can redact their own messages
 * - Event hosts can redact attendee/guest messages  
 * - Group admins can redact member messages
 * - Regular users cannot redact others' messages
 *
 * Tests use shared credentials to minimize Matrix API calls and reduce 429 rate limiting.
 */
jest.setTimeout(180000);

// Shared test data - created once and reused across tests
let sharedHostToken: string;
let sharedAdminToken: string;
let sharedTestUser: any;
let sharedEvent: any;
let sharedGroup: any;

describe('Message Redaction E2E Tests', () => {
  // Setup shared credentials and entities once before all tests
  beforeAll(async () => {
    try {
      // Create shared credentials
      sharedHostToken = await loginAsTester();
      sharedAdminToken = await loginAsAdmin();
      
      // Create a single test user to reuse across tests
      sharedTestUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `shared-test-user-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
        'Shared',
        'TestUser'
      );

      // Create shared event and group for reuse
      const eventData = {
        name: 'Shared Redaction Test Event',
        description: 'Testing message redaction',
        type: 'hybrid',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000),
        maxAttendees: 100,
        categories: [1],
        lat: 0,
        lon: 0,
        timeZone: 'UTC',
      };

      sharedEvent = await createEvent(TESTING_APP_URL, sharedHostToken, eventData);
      await addUserToEvent(sharedEvent.slug, sharedTestUser.user.slug, sharedHostToken);

      const groupData = {
        name: 'Shared Redaction Test Group',
        description: 'Testing message redaction in groups',
        visibility: 'public',
      };

      sharedGroup = await createGroup(TESTING_APP_URL, sharedHostToken, groupData);
      await addUserToGroup(sharedGroup.slug, sharedTestUser.user.slug, sharedHostToken);
    } catch (error) {
      console.error('Setup failed:', error);
      throw error;
    }
  });


  describe('User Self-Redaction', () => {
    it('should allow a user to redact their own event message', async () => {
      // Join the room first
      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${sharedEvent.slug}/join`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      
      expect([200, 201].includes(joinResponse.status)).toBe(true);

      // Wait for Matrix room join to propagate (increase from default 1 second)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Send a message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${sharedEvent.slug}/message`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Message to self-redact in event' });

      expect(messageResponse.status).toBe(200);
      const messageId = messageResponse.body.id;
        
      // Redact the message
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/event/${sharedEvent.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Self-redacting event message' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });

    it('should allow a user to redact their own group message', async () => {
      // Join the room first
      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${sharedGroup.slug}/join`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      
      expect([200, 201].includes(joinResponse.status)).toBe(true);

      // Wait for Matrix room join to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Send a message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${sharedGroup.slug}/message`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Message to self-redact in group' });

      expect(messageResponse.status).toBe(201);
      const messageId = messageResponse.body.id;
        
      // Redact the message
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/group/${sharedGroup.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Self-redacting group message' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });
  });

  describe('Host/Admin Moderation', () => {
    it('should allow event host to redact attendee messages', async () => {
      // User sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${sharedEvent.slug}/message`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Attendee message to be moderated' });

      expect(messageResponse.status).toBe(200);
      const messageId = messageResponse.body.id;
        
      // Host redacts it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/event/${sharedEvent.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Host moderating content' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });

    it('should allow group creator to redact member messages', async () => {
      // Member sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${sharedGroup.slug}/message`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Member message to be moderated' });

      expect(messageResponse.status).toBe(201);
      const messageId = messageResponse.body.id;
        
      // Creator redacts it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/group/${sharedGroup.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Group admin moderating content' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });

    it('should allow admin to redact any event message', async () => {
      // Host sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${sharedEvent.slug}/message`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Host message for admin to moderate' });

      expect(messageResponse.status).toBe(200);
      const messageId = messageResponse.body.id;
        
      // Admin redacts it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/event/${sharedEvent.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Admin moderating content' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });

    it('should allow admin to redact any group message', async () => {
      // Creator sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${sharedGroup.slug}/message`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Creator message for admin to moderate' });

      expect(messageResponse.status).toBe(201);
      const messageId = messageResponse.body.id;
        
      // Admin redacts it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/group/${sharedGroup.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Admin moderating group content' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(true);
      expect(redactionResponse.body.redactionEventId).toBeDefined();
    });
  });

  describe('Permission Denials', () => {
    it('should NOT allow regular user to redact host event messages', async () => {
      // Host sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${sharedEvent.slug}/message`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Host message user cannot redact' });

      expect(messageResponse.status).toBe(200);
      const messageId = messageResponse.body.id;
        
      // User tries to redact it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/event/${sharedEvent.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'User trying to redact host message' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(false);
      expect(redactionResponse.body.message).toMatch(/permission|not allowed|unauthorized/i);
    });

    it('should NOT allow regular member to redact group creator messages', async () => {
      // Creator sends message
      const messageResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${sharedGroup.slug}/message`)
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ message: 'Creator message member cannot redact' });

      expect(messageResponse.status).toBe(201);
      const messageId = messageResponse.body.id;
        
      // Member tries to redact it
      const redactionResponse = await request(TESTING_APP_URL)
        .delete(`/api/chat/group/${sharedGroup.slug}/message/${messageId}`)
        .set('Authorization', `Bearer ${sharedTestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Member trying to redact creator message' });

      expect(redactionResponse.status).toBe(200);
      expect(redactionResponse.body.success).toBe(false);
      expect(redactionResponse.body.message).toMatch(/permission|not allowed|unauthorized|no Matrix credentials/i);
    });
  });

  describe('Error Cases', () => {
    it('should return error for non-existent event', async () => {
      const response = await request(TESTING_APP_URL)
        .delete('/api/chat/event/non-existent-event/message/$fake-message-id:matrix.server.com')
        .set('Authorization', `Bearer ${sharedHostToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Testing non-existent event' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication for event message redaction', async () => {
      const response = await request(TESTING_APP_URL)
        .delete(`/api/chat/event/${sharedEvent.slug}/message/$fake-message-id:matrix.server.com`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ reason: 'Testing without auth' });

      expect(response.status).toBe(401);
    });
  });
});