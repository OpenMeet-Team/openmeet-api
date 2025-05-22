import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from './utils/constants';
import {
  createGroup,
  createEvent,
  loginAsAdmin,
  createTestUser,
  joinGroup,
  updateGroupMemberRole,
  getGroupMembers,
  getCurrentUser,
} from './utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
  GroupVisibility,
} from '../src/core/constants/constant';

jest.setTimeout(60000);

describe('Group Role Management and Event Permissions (e2e)', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;

  // Test users - each test gets independent users to avoid interference
  let groupOwnerUser: any;
  let groupAdminUser: any;
  let groupMemberUser: any;
  let groupGuestUser: any;
  let nonGroupUser: any;

  let group: any;
  let groupEventWithMembershipRequired: any;
  let groupEventNoMembershipRequired: any;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();

    // Create unique timestamp to avoid user conflicts
    const timestamp = Date.now();

    // Create test users with openmeet.net emails
    groupOwnerUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-owner-${timestamp}@openmeet.net`,
      'Group',
      'Owner',
    );

    groupAdminUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-admin-${timestamp}@openmeet.net`,
      'Group',
      'Admin',
    );

    groupMemberUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-member-${timestamp}@openmeet.net`,
      'Group',
      'Member',
    );

    groupGuestUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-guest-${timestamp}@openmeet.net`,
      'Group',
      'Guest',
    );

    nonGroupUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-nongroup-${timestamp}@openmeet.net`,
      'Non',
      'Group',
    );

    // Create test group as admin
    group = await createGroup(app, adminToken, {
      name: `Test Group ${timestamp}`,
      slug: `test-group-${timestamp}`,
      description: 'A group for testing role management and event permissions',
      status: GroupStatus.Published,
      visibility: GroupVisibility.Public,
      allowAutoApproval: true,
    });

    // Have users join the group
    await joinGroup(app, TESTING_TENANT_ID, group.slug, groupOwnerUser.token);
    await joinGroup(app, TESTING_TENANT_ID, group.slug, groupAdminUser.token);
    await joinGroup(app, TESTING_TENANT_ID, group.slug, groupMemberUser.token);
    await joinGroup(app, TESTING_TENANT_ID, group.slug, groupGuestUser.token);

    // Set up proper roles using admin token
    const members = await getGroupMembers(
      app,
      TESTING_TENANT_ID,
      group.slug,
      adminToken,
    );

    const ownerDetails = await getCurrentUser(
      app,
      TESTING_TENANT_ID,
      groupOwnerUser.token,
    );
    const adminDetails = await getCurrentUser(
      app,
      TESTING_TENANT_ID,
      groupAdminUser.token,
    );
    const memberDetails = await getCurrentUser(
      app,
      TESTING_TENANT_ID,
      groupMemberUser.token,
    );
    const guestDetails = await getCurrentUser(
      app,
      TESTING_TENANT_ID,
      groupGuestUser.token,
    );

    const ownerMember = members.find(
      (m) => m.user && m.user.slug === ownerDetails.slug,
    );
    const adminMember = members.find(
      (m) => m.user && m.user.slug === adminDetails.slug,
    );
    const memberMember = members.find(
      (m) => m.user && m.user.slug === memberDetails.slug,
    );
    const guestMember = members.find(
      (m) => m.user && m.user.slug === guestDetails.slug,
    );

    // Set roles (using admin token which has permissions)
    if (ownerMember) {
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerMember.id,
        'owner',
        adminToken,
      );
    }
    if (adminMember) {
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminMember.id,
        'admin',
        adminToken,
      );
    }
    if (memberMember) {
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        memberMember.id,
        'member',
        adminToken,
      );
    }
    if (guestMember) {
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        guestMember.id,
        'guest',
        adminToken,
      );
    }

    // Create events for testing
    groupEventWithMembershipRequired = await createEvent(app, adminToken, {
      name: `Group Event Membership Required ${timestamp}`,
      slug: `group-event-req-${timestamp}`,
      description: 'Event requiring group membership',
      type: EventType.Hybrid,
      startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      status: EventStatus.Published,
      group: group.id,
      requireGroupMembership: true, // This is the key setting
      timeZone: 'UTC',
      categories: [],
    });

    groupEventNoMembershipRequired = await createEvent(app, adminToken, {
      name: `Group Event No Membership Required ${timestamp}`,
      slug: `group-event-no-req-${timestamp}`,
      description: 'Group event not requiring membership',
      type: EventType.Hybrid,
      startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      status: EventStatus.Published,
      group: group.id,
      requireGroupMembership: false, // This allows anyone to join
      timeZone: 'UTC',
      categories: [],
    });
  });

  afterAll(async () => {
    try {
      // Cleanup events
      if (groupEventWithMembershipRequired) {
        await request(app)
          .delete(`/api/events/${groupEventWithMembershipRequired.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }

      if (groupEventNoMembershipRequired) {
        await request(app)
          .delete(`/api/events/${groupEventNoMembershipRequired.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }

      // Cleanup group
      if (group) {
        await request(app)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    } catch (error) {
      console.error('Error cleaning up test resources:', error);
    }
  });

  describe('Role Management Permissions', () => {
    it('should allow group owners to change member roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        groupOwnerUser.token,
      );
      const memberDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupMemberUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === memberDetails.slug,
      );

      expect(targetMember).toBeDefined();

      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${groupOwnerUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'moderator' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole.name).toBe('moderator');

      // Reset the member back to 'member' role for other tests
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        targetMember.id,
        'member',
        adminToken,
      );
    });

    it('should allow group admins to change member roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        groupAdminUser.token,
      );
      const guestDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupGuestUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === guestDetails.slug,
      );

      expect(targetMember).toBeDefined();

      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${groupAdminUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole.name).toBe('member');

      // Reset the guest back to 'guest' role for other tests
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        targetMember.id,
        'guest',
        adminToken,
      );
    });

    it('should allow changing guest to member role', async () => {
      const timestamp = Date.now();

      // Create a test user for this test
      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `roletest1-${timestamp}@test.com`,
        'Role Test User 1',
        'password123!',
      );

      // Join the group (defaults to guest)
      await joinGroup(app, TESTING_TENANT_ID, group.slug, testUser.token);

      // Get the member record
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );

      const userRecord = members.find((m) => m.user?.slug === testUser.slug);
      expect(userRecord).toBeDefined();
      expect(userRecord.groupRole.name).toBe('guest');

      // Try to change guest to member
      const updateResponse = await request(app)
        .patch(`/api/groups/${group.slug}/members/${userRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.groupRole.name).toBe('member');
    });

    it('should allow changing admin to member role', async () => {
      const timestamp = Date.now();

      // Create a test user for this test
      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `roletest2-${timestamp}@test.com`,
        'Role Test User 2',
        'password123!',
      );

      // Join the group (defaults to guest)
      await joinGroup(app, TESTING_TENANT_ID, group.slug, testUser.token);

      // Get the member record
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );

      const userRecord = members.find((m) => m.user?.slug === testUser.slug);
      expect(userRecord).toBeDefined();

      // Change to admin first
      await request(app)
        .patch(`/api/groups/${group.slug}/members/${userRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      // Now try to change admin back to member
      const updateResponse = await request(app)
        .patch(`/api/groups/${group.slug}/members/${userRecord.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.groupRole.name).toBe('member');
    });

    it('should NOT allow regular members to change roles', async () => {
      // First, let's verify what role the groupMemberUser actually has
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );
      const guestDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupGuestUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === guestDetails.slug,
      );

      expect(targetMember).toBeDefined();

      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${groupMemberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(response.status).toBe(403);
    });

    it('should NOT allow guests to change roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );
      const memberDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupMemberUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === memberDetails.slug,
      );

      expect(targetMember).toBeDefined();

      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${groupGuestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      expect(response.status).toBe(403);
    });

    it('should NOT allow non-group members to change roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );
      const memberDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupMemberUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === memberDetails.slug,
      );

      expect(targetMember).toBeDefined();

      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${nonGroupUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      expect(response.status).toBe(403);
    });
  });

  describe('Event Signup Permissions with requireGroupMembership', () => {
    it('should allow group members to attend events with requireGroupMembership=true', async () => {
      const response = await request(app)
        .post(`/api/events/${groupEventWithMembershipRequired.slug}/attend`)
        .set('Authorization', `Bearer ${groupMemberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(201);
    });

    it('should NOT allow guests to attend events with requireGroupMembership=true', async () => {
      const response = await request(app)
        .post(`/api/events/${groupEventWithMembershipRequired.slug}/attend`)
        .set('Authorization', `Bearer ${groupGuestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'Guests are not allowed to attend this event',
      );
    });

    it('should NOT allow non-group members to attend events with requireGroupMembership=true', async () => {
      const response = await request(app)
        .post(`/api/events/${groupEventWithMembershipRequired.slug}/attend`)
        .set('Authorization', `Bearer ${nonGroupUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(
        'You must be a member of this group to attend this event',
      );
    });

    it('should allow anyone to attend events with requireGroupMembership=false', async () => {
      const responses = await Promise.all([
        request(app)
          .post(`/api/events/${groupEventNoMembershipRequired.slug}/attend`)
          .set('Authorization', `Bearer ${groupMemberUser.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID),
        request(app)
          .post(`/api/events/${groupEventNoMembershipRequired.slug}/attend`)
          .set('Authorization', `Bearer ${groupGuestUser.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID),
        request(app)
          .post(`/api/events/${groupEventNoMembershipRequired.slug}/attend`)
          .set('Authorization', `Bearer ${nonGroupUser.token}`)
          .set('x-tenant-id', TESTING_TENANT_ID),
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
      });
    });
  });

  describe('Group Member Removal Permissions', () => {
    it('should NOT allow unauthorized users to remove group members (testing security bug)', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );
      const guestDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupGuestUser.token,
      );
      const targetMember = members.find(
        (m) => m.user && m.user.slug === guestDetails.slug,
      );

      expect(targetMember).toBeDefined();

      // Test that a regular member cannot remove another member
      const response = await request(app)
        .delete(`/api/groups/${group.slug}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${groupMemberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // This should fail but currently the endpoint is @Public() - this is the bug!
      expect(response.status).toBe(403);
    });
  });
});
