import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  createEvent,
  loginAsAdmin,
  updateEvent,
  createTestUser,
  joinGroup,
  updateGroupMemberRole,
  getGroupMembers,
  getCurrentUser,
} from '../utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
  GroupVisibility,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Group Event Permissions (e2e)', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;
  let regularUserToken: string;
  let groupAdminToken: string;
  let groupMemberToken: string;
  let group: any;
  let groupEvent: any;

  // Store user info for cleanup
  let groupAdminUser: any;
  let groupMemberUser: any;
  let regularUser: any;

  // Create test accounts with different permissions
  beforeAll(async () => {
    try {
      // Get admin token first as we'll need it for operations
      adminToken = await loginAsAdmin();

      // Create three test users with unique timestamps to avoid collisions
      const timestamp = Date.now();

      // 1. Group admin user
      groupAdminUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `group.admin.${timestamp}@example.com`,
        'Group',
        'Admin',
      );
      groupAdminToken = groupAdminUser.token;

      // 2. Group member user
      groupMemberUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `group.member.${timestamp}@example.com`,
        'Group',
        'Member',
      );
      groupMemberToken = groupMemberUser.token;

      // 3. Regular user (not in group)
      regularUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `regular.user.${timestamp}@example.com`,
        'Regular',
        'User',
      );
      regularUserToken = regularUser.token;

      // Create a test group as admin
      group = await createGroup(app, adminToken, {
        name: 'Test Group For Event Permissions',
        description: 'A group for testing event permission controls',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Have users join the group
      await joinGroup(app, TESTING_TENANT_ID, group.slug, groupAdminToken);
      await joinGroup(app, TESTING_TENANT_ID, group.slug, groupMemberToken);

      // Get all group members
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );

      // Get admin user details
      const adminDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupAdminToken,
      );

      // Find the admin user's member ID using their slug
      const adminMember = members.find(
        (m) => m.user && m.user.slug === adminDetails.slug,
      );

      if (adminMember) {
        // Update the admin user's role to Admin
        await updateGroupMemberRole(
          app,
          TESTING_TENANT_ID,
          group.slug,
          adminMember.id,
          'admin',
          adminToken,
        );
      } else {
        console.error('Could not find admin user in group members');
      }

      // Create an event in the group as the admin
      groupEvent = await createEvent(app, adminToken, {
        name: 'Group Event For Permission Testing',
        slug: 'group-event-permission-test',
        description: 'An event created to test group-based permissions',
        type: EventType.Hybrid,
        startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
        maxAttendees: 100,
        locationOnline: 'https://example.com/meeting',
        status: EventStatus.Published,
        group: group.id,
        timeZone: 'UTC',
        categories: [], // Empty array to satisfy validation
      });
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  });

  // Clean up created resources
  afterAll(async () => {
    try {
      // Delete the event
      await request(app)
        .delete(`/api/events/${groupEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Delete the group
      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Delete test users (if there's an endpoint for this)
      // This step might require admin privileges or might not be possible
      // through the API depending on the implementation
    } catch (error) {
      console.error('Error cleaning up test resources:', error);
    }
  });

  describe('Event editing permissions for group events', () => {
    it('should allow a group admin to edit an event they did not create', async () => {
      // Verify the group admin can access the event edit endpoint
      const editResponse = await request(app)
        .get(`/api/events/${groupEvent.slug}/edit`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(200);

      // Attempt to update the event as the group admin
      const updatedEvent = await updateEvent(
        app,
        groupAdminToken,
        groupEvent.slug,
        {
          name: 'Updated Group Event Name',
          description:
            'This event was updated by a group admin who did not create it',
        },
      );

      expect(updatedEvent.name).toBe('Updated Group Event Name');
      expect(updatedEvent.description).toBe(
        'This event was updated by a group admin who did not create it',
      );
    });

    it('should not allow a regular group member to edit an event they did not create', async () => {
      // Attempt to access the event edit endpoint as a regular group member
      const editResponse = await request(app)
        .get(`/api/events/${groupEvent.slug}/edit`)
        .set('Authorization', `Bearer ${groupMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(403);

      // Attempt to update the event as a regular group member
      const updateResponse = await request(app)
        .patch(`/api/events/${groupEvent.slug}`)
        .set('Authorization', `Bearer ${groupMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Regular Member Should Not Update',
          description: 'This update should be rejected',
        });

      expect(updateResponse.status).toBe(403);
    });

    it('should not allow a non-group-member to edit a group event', async () => {
      // Attempt to access the event edit endpoint as a non-group user
      const editResponse = await request(app)
        .get(`/api/events/${groupEvent.slug}/edit`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(403);

      // Attempt to update the event as a non-group user
      const updateResponse = await request(app)
        .patch(`/api/events/${groupEvent.slug}`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Non Member Should Not Update',
          description: 'This update should be rejected',
        });

      expect(updateResponse.status).toBe(403);
    });

    it('should always allow the event creator to edit their event', async () => {
      // Verify the original creator (admin) can access the event edit endpoint
      const editResponse = await request(app)
        .get(`/api/events/${groupEvent.slug}/edit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(200);

      // Update the event as the original creator
      const updatedEvent = await updateEvent(app, adminToken, groupEvent.slug, {
        name: 'Original Creator Update',
        description: 'This event was updated by the original creator',
      });

      expect(updatedEvent.name).toBe('Original Creator Update');
      expect(updatedEvent.description).toBe(
        'This event was updated by the original creator',
      );
    });
  });

  describe('Event editing permissions for non-group events', () => {
    let nonGroupEvent: any;

    beforeAll(async () => {
      // Create a regular event not associated with any group
      nonGroupEvent = await createEvent(app, adminToken, {
        name: 'Non-Group Event',
        slug: 'non-group-event-test',
        description: 'An event not associated with any group',
        type: EventType.InPerson,
        startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
        maxAttendees: 50,
        location: 'Test Location',
        status: EventStatus.Published,
        timeZone: 'UTC',
        categories: [], // Empty array to satisfy validation
      });
    });

    afterAll(async () => {
      // Clean up the non-group event
      await request(app)
        .delete(`/api/events/${nonGroupEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should not allow a group admin to edit a non-group event they did not create', async () => {
      // Attempt to access the event edit endpoint as a group admin
      const editResponse = await request(app)
        .get(`/api/events/${nonGroupEvent.slug}/edit`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(403);

      // Attempt to update the event as a group admin
      const updateResponse = await request(app)
        .patch(`/api/events/${nonGroupEvent.slug}`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Group Admin Should Not Update Non-Group Event',
          description: 'This update should be rejected',
        });

      expect(updateResponse.status).toBe(403);
    });
  });
});
