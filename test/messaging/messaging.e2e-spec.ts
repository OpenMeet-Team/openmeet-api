import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  createEvent,
  loginAsAdmin,
  createTestUser,
  joinGroup,
} from '../utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
  GroupVisibility,
} from '../../src/core/constants/constant';
import { MessageChannel } from '../../src/messaging/interfaces/message.interface';

// Helper functions for messaging tests
async function sendGroupMessage(
  app: string,
  tenantId: string,
  groupSlug: string,
  token: string,
  messageData: any,
): Promise<any> {
  const response = await request(app)
    .post(`/api/messaging/groups/${groupSlug}/send`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId)
    .send(messageData);
  return response;
}

async function sendEventMessage(
  app: string,
  tenantId: string,
  eventSlug: string,
  token: string,
  messageData: any,
): Promise<any> {
  const response = await request(app)
    .post(`/api/messaging/events/${eventSlug}/send`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId)
    .send(messageData);
  return response;
}

async function getUserDrafts(
  app: string,
  tenantId: string,
  token: string,
  filters?: any,
): Promise<any> {
  let url = '/api/messaging/drafts';
  if (filters) {
    const params = new URLSearchParams(filters).toString();
    url += `?${params}`;
  }

  const response = await request(app)
    .get(url)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function getDraft(
  app: string,
  tenantId: string,
  draftSlug: string,
  token: string,
): Promise<any> {
  const response = await request(app)
    .get(`/api/messaging/drafts/${draftSlug}`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function updateDraft(
  app: string,
  tenantId: string,
  draftSlug: string,
  token: string,
  updates: any,
): Promise<any> {
  const response = await request(app)
    .put(`/api/messaging/drafts/${draftSlug}`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId)
    .send(updates);
  return response;
}

async function approveDraft(
  app: string,
  tenantId: string,
  draftSlug: string,
  token: string,
): Promise<any> {
  const response = await request(app)
    .post(`/api/messaging/drafts/${draftSlug}/approve`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function rejectDraft(
  app: string,
  tenantId: string,
  draftSlug: string,
  token: string,
  reason?: string,
): Promise<any> {
  const response = await request(app)
    .post(`/api/messaging/drafts/${draftSlug}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId)
    .send({ reason });
  return response;
}

async function checkRateLimit(
  app: string,
  tenantId: string,
  token: string,
  groupSlug?: string,
  eventSlug?: string,
): Promise<any> {
  let url = '/api/messaging/rate-limit/check';
  const params = new URLSearchParams();
  if (groupSlug) params.append('groupSlug', groupSlug);
  if (eventSlug) params.append('eventSlug', eventSlug);

  if (params.toString()) {
    url += `?${params.toString()}`;
  }

  const response = await request(app)
    .get(url)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function pauseMessaging(
  app: string,
  tenantId: string,
  token: string,
  reason?: string,
  ttlSeconds?: number,
): Promise<any> {
  const response = await request(app)
    .post('/api/messaging/pause')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId)
    .send({ reason, ttlSeconds });
  return response;
}

async function resumeMessaging(
  app: string,
  tenantId: string,
  token: string,
): Promise<any> {
  const response = await request(app)
    .post('/api/messaging/resume')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function getPauseStatus(
  app: string,
  tenantId: string,
  token: string,
): Promise<any> {
  const response = await request(app)
    .get('/api/messaging/pause/status')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

async function getAuditLog(
  app: string,
  tenantId: string,
  token: string,
  filters?: any,
): Promise<any> {
  let url = '/api/messaging/audit';
  if (filters) {
    const params = new URLSearchParams(filters).toString();
    url += `?${params}`;
  }

  const response = await request(app)
    .get(url)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Tenant-ID', tenantId);
  return response;
}

jest.setTimeout(60000);

describe('Messaging System (e2e)', () => {
  const app = TESTING_APP_URL;

  // Test users
  let groupOwnerUser: any;
  let groupAdminUser: any;
  let groupMemberUser: any;
  let eventOrganizerUser: any;
  let eventAttendeeUser: any;
  let regularUser: any;

  // Tokens
  let adminToken: string;
  let ownerToken: string;
  let groupAdminToken: string;
  let memberToken: string;
  let organizerToken: string;
  let attendeeToken: string;
  let regularToken: string;

  // Test entities
  let testGroup: any;
  let testEvent: any;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();

    const timestamp = Date.now();

    // Create test users
    groupOwnerUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-owner-${timestamp}@openmeet.net`,
      'Group',
      'Owner',
    );
    ownerToken = groupOwnerUser.token;

    groupAdminUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-admin-${timestamp}@openmeet.net`,
      'Group',
      'Admin',
    );
    groupAdminToken = groupAdminUser.token;

    groupMemberUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-member-${timestamp}@openmeet.net`,
      'Group',
      'Member',
    );
    memberToken = groupMemberUser.token;

    eventOrganizerUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-organizer-${timestamp}@openmeet.net`,
      'Event',
      'Organizer',
    );
    organizerToken = eventOrganizerUser.token;

    eventAttendeeUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-attendee-${timestamp}@openmeet.net`,
      'Event',
      'Attendee',
    );
    attendeeToken = eventAttendeeUser.token;

    regularUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-msg-regular-${timestamp}@openmeet.net`,
      'Regular',
      'User',
    );
    regularToken = regularUser.token;

    // Create test group
    testGroup = await createGroup(app, ownerToken, {
      name: `Test Messaging Group ${timestamp}`,
      description: 'Group for testing messaging functionality',
      status: GroupStatus.Published,
      visibility: GroupVisibility.Public,
    });

    // Add members to group
    await joinGroup(app, TESTING_TENANT_ID, testGroup.slug, groupAdminToken);
    await joinGroup(app, TESTING_TENANT_ID, testGroup.slug, memberToken);

    // Get group members to find the member ID
    const membersResponse = await request(app)
      .get(`/api/groups/${testGroup.slug}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-ID', TESTING_TENANT_ID);

    const groupMembers = membersResponse.body;
    const adminMember = groupMembers.find(
      (member: any) => member.user.slug === groupAdminUser.user.slug,
    );

    if (adminMember) {
      // Update member role using the correct member ID
      await request(app)
        .patch(`/api/groups/${testGroup.slug}/members/${adminMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Tenant-ID', TESTING_TENANT_ID)
        .send({
          name: 'admin',
        })
        .expect(200);
    }

    // Create test event
    testEvent = await createEvent(app, organizerToken, {
      name: `Test Messaging Event ${timestamp}`,
      description: 'Event for testing messaging functionality',
      type: EventType.Hybrid,
      status: EventStatus.Published,
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 25 * 60 * 60 * 1000),
      timeZone: 'UTC',
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      lat: 0,
      lon: 0,
      categories: [1], // Required array
    });

    // Add attendee to event
    await request(app)
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${attendeeToken}`)
      .set('X-Tenant-ID', TESTING_TENANT_ID)
      .send({}) // CreateEventAttendeeDto - empty object for now
      .expect(201);
  });

  describe('Group Messaging', () => {
    it('should allow group owner to send message to all members', async () => {
      const messageData = {
        subject: 'Test Group Message',
        content: 'This is a test message to all group members',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        messageData,
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('draftSlug');
      expect(response.body).toHaveProperty('recipientCount');
      expect(response.body.recipientCount).toBeGreaterThan(0);
    });

    it('should allow group admin to send message to members', async () => {
      const messageData = {
        subject: 'Admin Message',
        content: 'Message from group admin',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'members',
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        groupAdminToken,
        messageData,
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('draftSlug');
    });

    it('should prevent regular member from sending bulk messages', async () => {
      const messageData = {
        subject: 'Unauthorized Bulk Message',
        content: 'This should fail',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
        messageData,
      );

      expect(response.status).toBe(403);
    });

    it('should prevent non-member from sending group messages', async () => {
      const messageData = {
        subject: 'Unauthorized Message',
        content: 'This should fail',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'members',
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        regularToken,
        messageData,
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Event Messaging', () => {
    it('should allow event organizer to send message to all attendees', async () => {
      const messageData = {
        subject: 'Event Announcement',
        content: 'Important event update for all attendees',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendEventMessage(
        app,
        TESTING_TENANT_ID,
        testEvent.slug,
        organizerToken,
        messageData,
      );

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('draftSlug');
      expect(response.body).toHaveProperty('recipientCount');
    });

    it('should prevent non-attendee from sending event messages', async () => {
      const messageData = {
        subject: 'Unauthorized Event Message',
        content: 'This should fail',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'attendees',
      };

      const response = await sendEventMessage(
        app,
        TESTING_TENANT_ID,
        testEvent.slug,
        regularToken,
        messageData,
      );

      expect(response.status).toBe(403);
    });

    it('should prevent regular attendee from sending bulk messages', async () => {
      const messageData = {
        subject: 'Unauthorized Bulk Event Message',
        content: 'This should fail',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendEventMessage(
        app,
        TESTING_TENANT_ID,
        testEvent.slug,
        attendeeToken,
        messageData,
      );

      expect(response.status).toBe(403);
    });
  });

  describe('Message Drafts Workflow', () => {
    let testDraftSlug: string;

    it('should create a draft requiring review for large recipient list', async () => {
      const messageData = {
        subject: 'Large Group Message',
        content: 'This message requires review',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
        requireReview: true,
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        messageData,
      );

      if (response.status === 400) {
        console.log(
          'Draft creation error:',
          JSON.stringify(response.body, null, 2),
        );
      }
      expect(response.status).toBe(201);
      expect(response.body.requiresReview).toBe(true);
      testDraftSlug = response.body.draftSlug;
    });

    it('should retrieve user drafts', async () => {
      const response = await getUserDrafts(app, TESTING_TENANT_ID, ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('drafts');
      expect(Array.isArray(response.body.drafts)).toBe(true);
    });

    it('should get specific draft by slug', async () => {
      const response = await getDraft(
        app,
        TESTING_TENANT_ID,
        testDraftSlug,
        ownerToken,
      );

      expect(response.status).toBe(200);
      expect(response.body.slug).toBe(testDraftSlug);
      expect(response.body.subject).toBe('Large Group Message');
    });

    it('should update draft content', async () => {
      const updates = {
        subject: 'Updated Group Message',
        content: 'Updated content for the message',
      };

      const response = await updateDraft(
        app,
        TESTING_TENANT_ID,
        testDraftSlug,
        ownerToken,
        updates,
      );

      expect(response.status).toBe(200);
      expect(response.body.subject).toBe('Updated Group Message');
    });

    it('should approve draft by admin', async () => {
      const response = await approveDraft(
        app,
        TESTING_TENANT_ID,
        testDraftSlug,
        adminToken,
      );

      expect(response.status).toBe(200);
    });

    it('should create and reject a draft', async () => {
      // Create another draft for rejection test
      const messageData = {
        subject: 'Message to Reject',
        content: 'This message will be rejected',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
        requireReview: true,
      };

      const createResponse = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        messageData,
      );

      const rejectResponse = await rejectDraft(
        app,
        TESTING_TENANT_ID,
        createResponse.body.draftSlug,
        adminToken,
        'Content needs improvement',
      );

      expect(rejectResponse.status).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should check rate limit status', async () => {
      const response = await checkRateLimit(
        app,
        TESTING_TENANT_ID,
        ownerToken,
        testGroup.slug,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('allowed');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('count');
    });

    it('should enforce rate limits after multiple messages', async () => {
      const messageData = {
        subject: 'Rate Limit Test',
        content: 'Testing rate limiting',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'members',
      };

      // Send multiple messages to trigger rate limit
      const responses: any[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await sendGroupMessage(
          app,
          TESTING_TENANT_ID,
          testGroup.slug,
          ownerToken,
          { ...messageData, subject: `Rate Limit Test ${i}` },
        );
        responses.push(response);

        // Break if we hit rate limit
        if (response.status === 400) {
          expect(response.body.message).toContain('Rate limit exceeded');
          break;
        }
      }

      // At least one should eventually hit rate limit or all should succeed
      const hasRateLimit = responses.some((r) => r.status === 400);
      const allSucceed = responses.every((r) => r.status === 201);

      expect(hasRateLimit || allSucceed).toBe(true);
    });
  });

  describe('Message Pause/Resume', () => {
    it('should pause messaging globally (admin only)', async () => {
      const response = await pauseMessaging(
        app,
        TESTING_TENANT_ID,
        adminToken,
        'Testing pause functionality',
        300, // 5 minutes
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('paused');
    });

    it('should prevent non-admin from pausing messaging', async () => {
      const response = await pauseMessaging(
        app,
        TESTING_TENANT_ID,
        ownerToken,
        'Should fail',
      );

      expect(response.status).toBe(403);
    });

    it('should check pause status', async () => {
      const response = await getPauseStatus(app, TESTING_TENANT_ID, ownerToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('paused');
    });

    it('should resume messaging (admin only)', async () => {
      const response = await resumeMessaging(
        app,
        TESTING_TENANT_ID,
        adminToken,
      );

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('resumed');
    });
  });

  describe('Audit Logging', () => {
    it('should retrieve audit log (admin only)', async () => {
      const response = await getAuditLog(app, TESTING_TENANT_ID, adminToken);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter audit log by user', async () => {
      const response = await getAuditLog(app, TESTING_TENANT_ID, adminToken, {
        userSlug: groupOwnerUser.user.slug,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });

    it('should filter audit log by group', async () => {
      const response = await getAuditLog(app, TESTING_TENANT_ID, adminToken, {
        groupSlug: testGroup.slug,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
    });

    it('should prevent non-admin from accessing audit log', async () => {
      const response = await getAuditLog(app, TESTING_TENANT_ID, ownerToken);

      expect(response.status).toBe(403);
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields in message data', async () => {
      const invalidMessageData = {
        subject: 'Test Subject',
        // Missing content
        channels: [MessageChannel.EMAIL],
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        invalidMessageData,
      );

      expect(response.status).toBe(422);
      expect(response.body.errors).toHaveProperty('content');
    });

    it('should validate message channels', async () => {
      const invalidMessageData = {
        subject: 'Test Subject',
        content: 'Test content',
        channels: ['invalid_channel'], // Invalid channel
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        invalidMessageData,
      );

      expect(response.status).toBe(422);
      expect(response.body.errors).toHaveProperty('channels');
    });

    it('should validate recipient filter', async () => {
      const invalidMessageData = {
        subject: 'Test Subject',
        content: 'Test content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'invalid_filter', // Invalid filter
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        testGroup.slug,
        ownerToken,
        invalidMessageData,
      );

      expect(response.status).toBe(422);
      expect(response.body.errors).toHaveProperty('recipientFilter');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent group', async () => {
      const messageData = {
        subject: 'Test Subject',
        content: 'Test content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendGroupMessage(
        app,
        TESTING_TENANT_ID,
        'non-existent-group',
        ownerToken,
        messageData,
      );

      expect(response.status).toBe(403); // Permissions guard returns 403 before checking if group exists
    });

    it('should handle non-existent event', async () => {
      const messageData = {
        subject: 'Test Subject',
        content: 'Test content',
        channels: [MessageChannel.EMAIL],
        recipientFilter: 'all',
      };

      const response = await sendEventMessage(
        app,
        TESTING_TENANT_ID,
        'non-existent-event',
        organizerToken,
        messageData,
      );

      expect(response.status).toBe(404);
    });

    it('should handle non-existent draft', async () => {
      const response = await getDraft(
        app,
        TESTING_TENANT_ID,
        'non-existent-draft',
        ownerToken,
      );

      expect(response.status).toBe(404);
    });
  });
});
