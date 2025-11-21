import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createTestUser,
  createGroup,
  joinGroup,
  approveMember,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(120000);

/**
 * E2E Tests for Issue #8: RSVP Pre-Access Check for Private Events
 *
 * These tests verify that the RSVP endpoint enforces access control
 * for private events, preventing unauthorized users from RSVPing.
 */
describe('Private Event RSVP Access Control (Issue #8)', () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
  });

  /**
   * High-Value Test 1: Non-invited user cannot RSVP to private event
   *
   * Security Impact: Prevents unauthorized users from adding themselves
   * to private events by directly calling the RSVP endpoint.
   */
  describe('Non-invited user access', () => {
    it('should deny RSVP to private event for non-invited users', async () => {
      // Create a regular user (not invited)
      const uninvitedUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `uninvited-${Date.now()}@test.com`,
        'Uninvited',
        'User',
      );

      // Admin creates a private event (not in a group)
      const privateEvent = await createEvent(TESTING_APP_URL, adminToken, {
        name: `Private Event - ${Date.now()}`,
        slug: `private-event-${Date.now()}`,
        description: 'This is a private event',
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
        type: EventType.Hybrid,
        location: 'Private Location',
        locationOnline: 'https://private-event.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'published',
        visibility: 'private', // Private event
        timeZone: 'America/New_York',
      });

      // Uninvited user tries to RSVP to the private event
      const rsvpResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${privateEvent.slug}/attend`)
        .set('Authorization', `Bearer ${uninvitedUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Should be denied with 403 Forbidden
      expect(rsvpResponse.status).toBe(403);
      expect(rsvpResponse.body.message).toContain(
        'You must be invited to RSVP to this private event',
      );

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${privateEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });

  /**
   * High-Value Test 2: Group member can RSVP to private group event
   *
   * Business Value: Ensures group members can participate in private
   * group events without needing explicit invitations.
   *
   * Note: Using a PUBLIC group with a PRIVATE event to simplify the test.
   * The key is testing that group membership grants access to private events.
   */
  describe('Group member access', () => {
    it('should allow group members to RSVP to private group events', async () => {
      // Create a regular user (will be a group member)
      const groupMember = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `group-member-${Date.now()}@test.com`,
        'Group',
        'Member',
      );

      // Admin creates a PUBLIC group (easier to join for testing)
      const testGroup = await createGroup(
        TESTING_APP_URL,
        adminToken,
        {
          name: `Test Group - ${Date.now()}`,
          slug: `test-group-${Date.now()}`,
          description: 'This is a test group',
          visibility: 'public', // Public group for easier test setup
        },
        TESTING_TENANT_ID,
      );

      // Admin directly adds the user as a group member
      // This bypasses the join/approval flow to focus the test on Issue #8
      const addMemberResponse = await request(TESTING_APP_URL)
        .post(`/api/groups/${testGroup.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          userId: groupMember.user.id,
        });

      // If direct add isn't available, use join + approve flow
      if (
        addMemberResponse.status === 404 ||
        addMemberResponse.status === 405
      ) {
        await joinGroup(
          TESTING_APP_URL,
          TESTING_TENANT_ID,
          testGroup.slug,
          groupMember.token,
        );

        const membersResponse = await request(TESTING_APP_URL)
          .get(`/api/groups/${testGroup.slug}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        const memberToApprove = membersResponse.body.find(
          (m: any) => m.user.id === groupMember.user.id,
        );

        if (memberToApprove) {
          await approveMember(
            TESTING_APP_URL,
            TESTING_TENANT_ID,
            testGroup.slug,
            memberToApprove.id,
            adminToken,
          );
        }
      }

      // Admin creates a PRIVATE event in the group
      // This is what we're testing: group members can RSVP to private events
      const privateGroupEvent = await createEvent(TESTING_APP_URL, adminToken, {
        name: `Private Group Event - ${Date.now()}`,
        slug: `private-group-event-${Date.now()}`,
        description: 'This is a private event in a group',
        startDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
        type: EventType.Hybrid,
        location: 'Private Group Location',
        locationOnline: 'https://private-group-event.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'published',
        visibility: 'private', // PRIVATE event - this is what we're testing!
        group: testGroup.id, // In the test group
        timeZone: 'America/New_York',
      });

      // Verify the user is actually a group member before RSVP
      const verifyMembersResponse = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroup.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const isMember = verifyMembersResponse.body.some(
        (m: any) => m.user.id === groupMember.user.id,
      );
      console.log(`User ${groupMember.user.id} is group member:`, isMember);
      console.log(
        `Group members:`,
        verifyMembersResponse.body.map((m: any) => ({
          userId: m.user.id,
          role: m.role?.name,
        })),
      );

      // Group member should be able to RSVP to the private group event
      const rsvpResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${privateGroupEvent.slug}/attend`)
        .set('Authorization', `Bearer ${groupMember.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      console.log(`RSVP response status:`, rsvpResponse.status);
      console.log(`RSVP response body:`, rsvpResponse.body);

      // Should succeed with 200/201
      expect([200, 201]).toContain(rsvpResponse.status);
      expect(rsvpResponse.body).toBeDefined();

      // Verify the user is now an attendee
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${privateGroupEvent.slug}/attendees`)
        .set('Authorization', `Bearer ${groupMember.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const attendeesList =
        attendeesResponse.body.data || attendeesResponse.body;
      const isAttendee = attendeesList.some(
        (attendee: any) => attendee.user?.slug === groupMember.user.slug,
      );
      expect(isAttendee).toBe(true);

      // Cleanup
      await request(TESTING_APP_URL)
        .delete(`/api/events/${privateGroupEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });
});
