import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  createEvent,
  loginAsAdmin,
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

// Helper functions for the tests
async function createAndLoginUser(
  app: string,
  tenantId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<any> {
  return await createTestUser(app, tenantId, email, firstName, lastName);
}

async function addUserToGroup(
  app: string,
  tenantId: string,
  groupSlug: string,
  userToken: string,
): Promise<any> {
  return await joinGroup(app, tenantId, groupSlug, userToken);
}

jest.setTimeout(60000);

describe('Group Role Management and Event Permissions (e2e)', () => {
  const app = TESTING_APP_URL;

  // Test users - each test gets independent users to avoid interference
  let groupOwnerUser: any;
  let groupAdminUser: any;
  let groupMemberUser: any;
  let groupGuestUser: any;
  let nonGroupUser: any;

  // Tokens for different roles
  let ownerToken: string;
  let adminToken: string;
  let groupAdminToken: string;

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
    ownerToken = groupOwnerUser.token;

    groupAdminUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-admin-${timestamp}@openmeet.net`,
      'Group',
      'Admin',
    );
    groupAdminToken = groupAdminUser.token;

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
        'You must be a member of the',
      );
      expect(response.body.message).toContain('group to attend this event');
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

  describe('Role Hierarchy and Edge Cases', () => {
    let secondAdminUser: any;
    let moderatorUser: any;
    let secondAdminEmail: string;
    let moderatorEmail: string;

    beforeAll(async () => {
      // Create unique timestamp for this test suite
      const hierarchyTimestamp = Date.now() + Math.floor(Math.random() * 1000);

      // Create a second admin user to test admin-to-admin interactions
      secondAdminEmail = `openmeet-test-second-admin-${hierarchyTimestamp}@openmeet.net`;
      secondAdminUser = await createAndLoginUser(
        app,
        TESTING_TENANT_ID,
        secondAdminEmail,
        'SecondAdmin',
        'User',
      );
      // Create a moderator user
      moderatorEmail = `openmeet-test-moderator-${hierarchyTimestamp}@openmeet.net`;
      moderatorUser = await createAndLoginUser(
        app,
        TESTING_TENANT_ID,
        moderatorEmail,
        'Moderator',
        'User',
      );

      // Add them to the group and set their roles
      await addUserToGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        secondAdminUser.token,
      );
      await addUserToGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        moderatorUser.token,
      );

      // Get their group member IDs and set roles
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );

      // Since the group members API doesn't return email, let's use slug to match
      const secondAdminMember = members.find(
        (m) => m.user?.slug === secondAdminUser.slug,
      );
      const moderatorMember = members.find(
        (m) => m.user?.slug === moderatorUser.slug,
      );

      if (!secondAdminMember) {
        console.error(
          'Could not find second admin member with slug:',
          secondAdminUser.slug,
        );
        console.error(
          'Available members:',
          members.map((m) => ({
            id: m.id,
            slug: m.user?.slug,
            role: m.groupRole?.name,
          })),
        );
        throw new Error('Second admin member not found');
      }

      if (!moderatorMember) {
        console.error(
          'Could not find moderator member with slug:',
          moderatorUser.slug,
        );
        console.error(
          'Available members:',
          members.map((m) => ({
            id: m.id,
            slug: m.user?.slug,
            role: m.groupRole?.name,
          })),
        );
        throw new Error('Moderator member not found');
      }

      // Owner sets second admin role
      await request(app)
        .patch(`/api/groups/${group.slug}/members/${secondAdminMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' })
        .expect(200);

      // Owner sets moderator role
      await request(app)
        .patch(`/api/groups/${group.slug}/members/${moderatorMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'moderator' })
        .expect(200);
    });

    it('should allow admin to change another admin to member (regression test)', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        groupAdminToken,
      );
      const secondAdminMember = members.find(
        (m) => m.user?.slug === secondAdminUser.slug,
      );

      expect(secondAdminMember).toBeDefined();
      expect(secondAdminMember.groupRole?.name).toBe('admin');

      // First admin changes second admin to member
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${secondAdminMember.id}`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole?.name).toBe('member');
    });

    it('should NOT allow admin to change owner role (hierarchy protection)', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        groupAdminToken,
      );
      const ownerMember = members.find((m) => m.groupRole?.name === 'owner');

      expect(ownerMember).toBeDefined();

      // Admin tries to change owner to member - this should fail
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${ownerMember.id}`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      // This should fail with 403 Forbidden (hierarchy protection)
      // TODO: Currently this probably succeeds - we need to implement hierarchy validation
      expect(response.status).toBe(403);
    });

    it('should NOT allow admin to promote someone to owner (hierarchy protection)', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        groupAdminToken,
      );
      const memberToPromote = members.find(
        (m) =>
          m.groupRole?.name === 'member' &&
          m.user?.slug !== secondAdminUser.slug,
      );

      expect(memberToPromote).toBeDefined();

      // Admin tries to promote member to owner - this should fail
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${memberToPromote.id}`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'owner' });

      // This should fail with 403 Forbidden (only owner can create other owners)
      expect(response.status).toBe(403);
    });

    it('should allow owner to change admin roles', async () => {
      const testTimestamp = Date.now() + Math.floor(Math.random() * 10000);

      // Create a new admin user specifically for this test
      const testAdminUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `openmeet-test-admin-change-${testTimestamp}@openmeet.net`,
        'TestAdmin',
        'ForChange',
      );

      // Add them to the group
      await addUserToGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        testAdminUser.token,
      );

      // Get their member record
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const newMember = members.find(
        (m) => m.user?.slug === testAdminUser.slug,
      );

      expect(newMember).toBeDefined();

      // Owner makes them an admin first
      await request(app)
        .patch(`/api/groups/${group.slug}/members/${newMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' })
        .expect(200);

      // Owner changes admin to moderator
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${newMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'moderator' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole?.name).toBe('moderator');
    });

    it('should allow owner to promote member to admin', async () => {
      // First restore a member to test promotion
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const memberToPromote = members.find(
        (m) => m.user?.slug === secondAdminUser.slug,
      );

      expect(memberToPromote).toBeDefined();

      // Owner promotes member to admin
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${memberToPromote.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole?.name).toBe('admin');
    });

    it('should allow admin to promote moderator to admin (same level promotion)', async () => {
      const testTimestamp = Date.now() + Math.floor(Math.random() * 10000);

      // Create a new user specifically for this test
      const testModeratorUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `openmeet-test-mod-promote-${testTimestamp}@openmeet.net`,
        'TestMod',
        'ForPromotion',
      );

      // Add them to the group
      await addUserToGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        testModeratorUser.token,
      );

      // Get their member record
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const newMember = members.find(
        (m) => m.user?.slug === testModeratorUser.slug,
      );

      expect(newMember).toBeDefined();

      // Owner makes them a moderator first
      await request(app)
        .patch(`/api/groups/${group.slug}/members/${newMember.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'moderator' })
        .expect(200);

      // Verify the admin user still has admin role (not changed by previous tests)
      const currentMembers = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const adminUserMember = currentMembers.find(
        (m) => m.user?.slug === groupAdminUser.slug,
      );
      expect(adminUserMember).toBeDefined();
      expect(adminUserMember.groupRole?.name).toBe('admin');

      // Now admin promotes moderator to admin - this should succeed
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${newMember.id}`)
        .set('Authorization', `Bearer ${groupAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole?.name).toBe('admin');
    });

    it('should NOT allow moderator to change admin roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const adminMember = members.find((m) => m.groupRole?.name === 'admin');

      expect(adminMember).toBeDefined();

      // Moderator tries to change admin role - this should fail
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${adminMember.id}`)
        .set('Authorization', `Bearer ${moderatorUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      // Should fail - moderators can't manage admin roles
      expect(response.status).toBe(403);
    });

    it('should allow moderator to manage member and guest roles only', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const guestMember = members.find((m) => m.groupRole?.name === 'guest');

      expect(guestMember).toBeDefined();

      // Moderator changes guest to member - this should succeed
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${guestMember.id}`)
        .set('Authorization', `Bearer ${moderatorUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'member' });

      expect(response.status).toBe(200);
      expect(response.body.groupRole?.name).toBe('member');
    });

    it('should NOT allow member to change to admin role (no self-promotion)', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const memberDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupMemberUser.token,
      );
      const memberRecord = members.find(
        (m) => m.user?.slug === memberDetails.slug,
      );

      expect(memberRecord).toBeDefined();

      // Member tries to promote themselves to admin
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${memberRecord.id}`)
        .set('Authorization', `Bearer ${groupMemberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'admin' });

      // Should fail - members can't change roles
      expect(response.status).toBe(403);
    });

    it('should validate role names and reject invalid roles', async () => {
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerToken,
      );
      const memberToUpdate = members.find(
        (m) => m.groupRole?.name === 'member',
      );

      expect(memberToUpdate).toBeDefined();

      // Owner tries to set invalid role
      const response = await request(app)
        .patch(`/api/groups/${group.slug}/members/${memberToUpdate.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'super-admin' });

      // Should fail with 422 (validation error - invalid enum value)
      expect(response.status).toBe(422);
    });
  });
});
