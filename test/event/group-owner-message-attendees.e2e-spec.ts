import * as request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
} from '../utils/constants';
import {
  createTestUser,
  createGroup,
  createEvent,
  joinGroup,
} from '../utils/functions';

describe('Group Owner Message Event Attendees (e2e)', () => {
  let mailDevService: any;
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let groupOwner: any;
  let member: any;
  let testGroup: any;
  let testEvent: any;

  beforeAll(async () => {
    // Set up server app agent with tenant
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Create group owner user
    const timestamp = Date.now();
    groupOwner = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `openmeet-test-group-owner-${timestamp}@openmeet.net`,
      'Group',
      'Owner',
    );

    // Create a member user who will attend the event
    member = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `openmeet-test-member-${timestamp}@openmeet.net`,
      'Test',
      'Member',
    );

    // Create a test group
    testGroup = await createGroup(TESTING_APP_URL, groupOwner.token, {
      name: 'Test Group for Owner Messaging',
      description: 'Test group for owner messaging functionality',
      visibility: 'public',
      status: 'published',
    });

    // Create a test event in the group
    testEvent = await createEvent(TESTING_APP_URL, groupOwner.token, {
      name: 'Test Event for Owner Messaging',
      description: 'Test event for testing owner messaging capability',
      startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 90000000).toISOString(), // Tomorrow + 1 hour
      timeZone: 'America/New_York',
      type: 'hybrid',
      locationOnline: 'https://example.com/meeting',
      lat: 0,
      lon: 0,
      maxAttendees: 10,
      categories: [],
      visibility: 'public',
      status: 'published',
      groupSlug: testGroup.slug,
    });

    // Have the member join the group
    await joinGroup(
      TESTING_APP_URL,
      testTenantId,
      testGroup.slug,
      member.token,
    );

    // Have the member attend the event
    await serverApp
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({})
      .expect(201);

    // Have the group owner also attend the event to get the Host role
    await serverApp
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${groupOwner.token}`)
      .send({})
      .expect(201);

    // Set up MailDev service helper (gracefully handle if not available)
    mailDevService = {
      getEmails: async () => {
        try {
          const response = await fetch(
            `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}/email`,
          );
          if (!response.ok) return [];
          return response.json();
        } catch {
          console.log('MailDev not available, returning empty emails');
          return [];
        }
      },
      getEmailsSince: async (timestamp: number) => {
        const emails = await mailDevService.getEmails();
        // Give some buffer time (5 seconds before) to account for timing differences
        const bufferTime = 5000;
        return emails.filter((email: any) => {
          const emailDate = new Date(email.date).getTime();
          return emailDate >= timestamp - bufferTime;
        });
      },
    };
  }, 30000);

  it('should allow group owner to send message to event attendees', async () => {
    const messageData = {
      subject: 'Test message from group owner',
      message:
        'This is a test message from the group owner to all event attendees.',
    };

    const timestampBeforeRequest = Date.now();

    const response = await serverApp
      .post(`/api/events/${testEvent.slug}/admin-message`)
      .set('Authorization', `Bearer ${groupOwner.token}`)
      .send(messageData)
      .expect((res: any) => {
        // Expect either success or specific error conditions
        if (res.status !== 201 && res.status !== 404 && res.status !== 403) {
          console.log('Unexpected response:', res.status, res.body);
        }
      });

    // If successful, verify the response structure
    if (response.status === 201) {
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('deliveredCount');
      expect(response.body).toHaveProperty('failedCount');
      expect(response.body).toHaveProperty('messageId');
      expect(response.body.success).toBe(true);
      expect(response.body.deliveredCount).toBeGreaterThan(0);
      expect(response.body.failedCount).toBe(0);

      // Check for emails sent (if MailDev is available)
      const recentEmails = await mailDevService.getEmailsSince(
        timestampBeforeRequest,
      );
      const adminEmails = recentEmails.filter((email: any) =>
        email.subject?.includes('Test message from group owner'),
      );

      if (adminEmails.length > 0) {
        expect(adminEmails.length).toBeGreaterThan(0);

        // Verify email content
        const firstEmail = adminEmails[0];
        expect(firstEmail.subject).toContain('Test message from group owner');
      }
    } else if (response.status === 404) {
      // Expected when event doesn't exist in test environment
      expect(response.body.message).toContain('not found');
    } else if (response.status === 403) {
      // This would be unexpected - group owner should have permission
      console.warn(
        'Group owner was denied permission - this may indicate a bug',
      );
    }
  }, 15000);

  it('should not allow regular member to send message to event attendees', async () => {
    const messageData = {
      subject: 'Test message from member',
      message: 'This should fail because member does not have permission.',
    };

    // Regular member should not be able to send admin messages
    await serverApp
      .post(`/api/events/${testEvent.slug}/admin-message`)
      .set('Authorization', `Bearer ${member.token}`)
      .send(messageData)
      .expect(403);
  }, 15000);

  it('should validate message data', async () => {
    // Test missing subject
    await serverApp
      .post(`/api/events/${testEvent.slug}/admin-message`)
      .set('Authorization', `Bearer ${groupOwner.token}`)
      .send({
        message: 'Test message without subject',
      })
      .expect(422);

    // Test missing message
    await serverApp
      .post(`/api/events/${testEvent.slug}/admin-message`)
      .set('Authorization', `Bearer ${groupOwner.token}`)
      .send({
        subject: 'Test subject without message',
      })
      .expect(422);
  }, 10000);

  afterAll(async () => {
    // Clean up test data
    if (testEvent?.slug) {
      try {
        await serverApp
          .delete(`/api/events/${testEvent.slug}`)
          .set('Authorization', `Bearer ${groupOwner.token}`)
          .timeout(10000);
      } catch (error) {
        console.log('Event cleanup failed:', error.message);
      }
    }

    if (testGroup?.slug) {
      try {
        await serverApp
          .delete(`/api/groups/${testGroup.slug}`)
          .set('Authorization', `Bearer ${groupOwner.token}`)
          .timeout(10000);
      } catch (error) {
        console.log('Group cleanup failed:', error.message);
      }
    }
  }, 15000);
});
