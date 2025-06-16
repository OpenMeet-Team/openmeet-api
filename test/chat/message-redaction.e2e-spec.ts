import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  createGroup,
  createTestUser,
  sendEventMessage,
  sendGroupMessage,
  redactEventMessage,
  redactGroupMessage,
  addUserToEvent,
  addUserToGroup,
} from '../utils/functions';
import { TESTING_APP_URL } from '../utils/constants';

/**
 * Message Redaction E2E Tests
 *
 * These tests validate message redaction functionality with proper permissions:
 * - Users can redact their own messages
 * - Event hosts can redact attendee/guest messages
 * - Group admins can redact member messages
 * - Regular users cannot redact others' messages
 *
 * Each test is independent and can run in any order.
 */
jest.setTimeout(120000);

describe('Message Redaction E2E Tests', () => {
  describe('User Self-Redaction in Events', () => {
    it('should allow a user to redact their own event message', async () => {
      // Setup: Create event and user
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('self-redact-event-user');

      const eventData = {
        title: 'Self Redaction Test Event',
        description: 'Testing user self-redaction',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );
      await addUserToEvent(eventSlug, userInfo.user.slug, hostToken);

      // Test: Send message and redact it
      const messageId = await sendEventMessage(
        eventSlug,
        'Message to self-redact',
        userInfo.token,
        TESTING_APP_URL,
      );
      const response = await redactEventMessage(
        eventSlug,
        messageId,
        userInfo.token,
        'Self-redacting message',
        TESTING_APP_URL,
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });
  });

  describe('User Self-Redaction in Groups', () => {
    it('should allow a user to redact their own group message', async () => {
      // Setup: Create group and user
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('self-redact-group-user');

      const groupData = {
        name: 'Self Redaction Test Group',
        description: 'Testing user self-redaction in groups',
        visibility: 'public',
      };

      const group = await createGroup(TESTING_APP_URL, hostToken, groupData);
      await addUserToGroup(group.slug, userInfo.user.slug, hostToken);

      // Test: Send message and redact it
      const messageId = await sendGroupMessage(
        group.slug,
        'Group message to self-redact',
        userInfo.token,
      );
      const response = await redactGroupMessage(
        group.slug,
        messageId,
        userInfo.token,
        'Self-redacting group message',
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });
  });

  describe('Host Moderation in Events', () => {
    it('should allow event host to redact attendee messages', async () => {
      // Setup: Create event with host and attendee
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('event-attendee-user');

      const eventData = {
        title: 'Host Moderation Test Event',
        description: 'Testing host moderation',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );
      await addUserToEvent(eventSlug, userInfo.user.slug, hostToken);

      // Test: User sends message, host redacts it
      const messageId = await sendEventMessage(
        eventSlug,
        'Attendee message to be moderated',
        userInfo.token,
      );
      const response = await redactEventMessage(
        eventSlug,
        messageId,
        hostToken,
        'Host moderating content',
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });
  });

  describe('Group Admin Moderation', () => {
    it('should allow group creator to redact member messages', async () => {
      // Setup: Create group with creator and member
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('group-member-user');

      const groupData = {
        name: 'Group Moderation Test',
        description: 'Testing group admin moderation',
        visibility: 'public',
      };

      const group = await createGroup(TESTING_APP_URL, hostToken, groupData);
      await addUserToGroup(group.slug, userInfo.user.slug, hostToken);

      // Test: Member sends message, creator redacts it
      const messageId = await sendGroupMessage(
        group.slug,
        'Member message to be moderated',
        userInfo.token,
      );
      const response = await redactGroupMessage(
        group.slug,
        messageId,
        hostToken,
        'Group admin moderating content',
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });
  });

  describe('Admin Permissions', () => {
    it('should allow admin to redact any event message', async () => {
      // Setup: Create event with regular host, admin redacts
      const hostToken = await loginAsTester();
      const adminToken = await loginAsAdmin();

      const eventData = {
        title: 'Admin Moderation Test Event',
        description: 'Testing admin global moderation',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );

      // Test: Host sends message, admin redacts it
      const messageId = await sendEventMessage(
        eventSlug,
        'Host message for admin to moderate',
        hostToken,
      );
      const response = await redactEventMessage(
        eventSlug,
        messageId,
        adminToken,
        'Admin moderating content',
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });

    it('should allow admin to redact any group message', async () => {
      // Setup: Create group with regular creator, admin redacts
      const hostToken = await loginAsTester();
      const adminToken = await loginAsAdmin();

      const groupData = {
        name: 'Admin Group Moderation Test',
        description: 'Testing admin global moderation in groups',
        visibility: 'public',
      };

      const group = await createGroup(TESTING_APP_URL, hostToken, groupData);

      // Test: Creator sends message, admin redacts it
      const messageId = await sendGroupMessage(
        group.slug,
        'Creator message for admin to moderate',
        hostToken,
      );
      const response = await redactGroupMessage(
        group.slug,
        messageId,
        adminToken,
        'Admin moderating group content',
      );

      // Verify
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.redactionEventId).toBeDefined();
    });
  });

  describe('Permission Denials', () => {
    it('should NOT allow regular user to redact host event messages', async () => {
      // Setup: Create event with host and user
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('permission-test-user');

      const eventData = {
        title: 'Permission Denial Test Event',
        description: 'Testing permission denials',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );
      await addUserToEvent(eventSlug, userInfo.user.slug, hostToken);

      // Test: Host sends message, user tries to redact it
      const messageId = await sendEventMessage(
        eventSlug,
        'Host message user cannot redact',
        hostToken,
      );
      const response = await redactEventMessage(
        eventSlug,
        messageId,
        userInfo.token,
        'User trying to redact host message',
      );

      // Verify permission is denied
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });

    it('should NOT allow regular member to redact group creator messages', async () => {
      // Setup: Create group with creator and member
      const hostToken = await loginAsTester();
      const userInfo = await createTestUser('group-permission-test-user');

      const groupData = {
        name: 'Group Permission Denial Test',
        description: 'Testing group permission denials',
        visibility: 'public',
      };

      const group = await createGroup(TESTING_APP_URL, hostToken, groupData);
      await addUserToGroup(group.slug, userInfo.user.slug, hostToken);

      // Test: Creator sends message, member tries to redact it
      const messageId = await sendGroupMessage(
        group.slug,
        'Creator message member cannot redact',
        hostToken,
      );
      const response = await redactGroupMessage(
        group.slug,
        messageId,
        userInfo.token,
        'Member trying to redact creator message',
      );

      // Verify permission is denied
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });
  });

  describe('Error Cases', () => {
    it('should return error for non-existent message in event', async () => {
      // Setup: Create event
      const hostToken = await loginAsTester();

      const eventData = {
        title: 'Error Test Event',
        description: 'Testing error cases',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );

      // Test: Try to redact non-existent message
      const response = await redactEventMessage(
        eventSlug,
        '$fake-message-id:matrix.server.com',
        hostToken,
        'Testing non-existent message',
      );

      // Verify error handling
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    it('should return error for non-existent event', async () => {
      // Setup: Get token
      const hostToken = await loginAsTester();

      // Test: Try to redact message in non-existent event
      const response = await redactEventMessage(
        'non-existent-event',
        '$fake-message-id:matrix.server.com',
        hostToken,
        'Testing non-existent event',
      );

      // Verify error handling
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication for event message redaction', async () => {
      // Setup: Create event
      const hostToken = await loginAsTester();

      const eventData = {
        title: 'Auth Test Event',
        description: 'Testing authentication requirement',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        location: 'Test Location',
        visibility: 'public',
      };

      const eventSlug = await createEvent(
        TESTING_APP_URL,
        hostToken,
        eventData,
      );

      // Test: Try to redact without authentication
      const response = await redactEventMessage(
        eventSlug,
        '$fake-message-id:matrix.server.com',
        '',
        'Testing without auth',
      );

      // Verify authentication is required
      expect(response.status).toBe(401);
    });
  });
});
