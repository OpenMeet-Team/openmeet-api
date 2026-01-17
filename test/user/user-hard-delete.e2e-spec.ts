import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createTestUser,
  createGroup,
  createEvent,
  joinGroup,
  approveMember,
  updateGroupMemberRole,
  loginAsAdmin,
} from '../utils/functions';
import {
  GroupStatus,
  GroupVisibility,
  EventStatus,
  EventType,
} from '../../src/core/constants/constant';

/**
 * E2E tests for user hard deletion functionality.
 *
 * These tests verify:
 * 1. Basic user deletion
 * 2. Group ownership transfer when user is deleted
 * 3. Group deletion when no eligible successor exists
 * 4. Events in groups have userId set to NULL after deletion
 * 5. Standalone events are deleted with the user
 * 6. Deterministic successor selection (role priority, then join date)
 */
describe('User Hard Delete E2E Tests', () => {
  const app = TESTING_APP_URL;
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await loginAsAdmin();
  });

  describe('Basic User Deletion', () => {
    it('should hard delete a user with no groups or events', async () => {
      // Create a test user
      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `delete-basic-${Date.now()}@test.openmeet.net`,
        'Delete',
        'BasicUser',
      );

      // Verify user exists
      const getUserResponse = await request(app)
        .get(`/api/v1/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(getUserResponse.status).toBe(200);
      expect(getUserResponse.body.id).toBe(testUser.id);

      // Delete the user
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify user no longer exists (endpoint returns null with 200, not 404)
      const getDeletedUserResponse = await request(app)
        .get(`/api/v1/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // The endpoint returns 200 with empty body for deleted users
      expect(getDeletedUserResponse.status).toBe(200);
      expect(getDeletedUserResponse.body).toEqual({});
    });
  });

  describe('Group Ownership Transfer', () => {
    it('should transfer group ownership to admin when owner is deleted', async () => {
      // Create owner user
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner-transfer-${Date.now()}@test.openmeet.net`,
        'Owner',
        'ToDelete',
      );

      // Create admin user who will become the new owner
      const adminUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `admin-successor-${Date.now()}@test.openmeet.net`,
        'Admin',
        'Successor',
      );

      // Create a group as the owner
      const group = await createGroup(app, ownerUser.token, {
        name: `Transfer Test Group ${Date.now()}`,
        description: 'Group for testing ownership transfer',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Admin joins the group
      const joinResult = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminUser.token,
      );

      // Owner approves admin
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        joinResult.id,
        ownerUser.token,
      );

      // Promote admin user to admin role
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        joinResult.id,
        'admin',
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify group still exists (use system admin token to check)
      const groupResponse = await request(app)
        .get(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(groupResponse.status).toBe(200);

      // Verify ownership was transferred to admin user
      expect(groupResponse.body.createdBy.id).toBe(adminUser.id);

      // Verify the successor's role was elevated to owner
      const membersResponse = await request(app)
        .get(`/api/groups/${group.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(membersResponse.status).toBe(200);
      const successorMember = membersResponse.body.find(
        (m: any) => m.user.id === adminUser.id,
      );
      expect(successorMember).toBeDefined();
      expect(successorMember.groupRole.name.toLowerCase()).toBe('owner');

      // Cleanup: delete the group (use system admin)
      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should delete group when owner is deleted and no eligible successor exists', async () => {
      // Create owner user
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner-nosucc-${Date.now()}@test.openmeet.net`,
        'Owner',
        'NoSuccessor',
      );

      // Create regular member (not admin/moderator)
      const regularMember = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `regular-member-${Date.now()}@test.openmeet.net`,
        'Regular',
        'Member',
      );

      // Create a group as the owner
      const group = await createGroup(app, ownerUser.token, {
        name: `No Successor Group ${Date.now()}`,
        description: 'Group with no eligible successor',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Regular member joins the group
      const joinResult = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        regularMember.token,
      );

      // Owner approves member (but doesn't promote to admin)
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        joinResult.id,
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify group no longer exists
      const groupResponse = await request(app)
        .get(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${regularMember.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(groupResponse.status).toBe(404);
    });
  });

  describe('Event Handling', () => {
    it('should set userId to NULL for events in groups when owner is deleted', async () => {
      // Create owner user
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner-event-${Date.now()}@test.openmeet.net`,
        'Owner',
        'WithEvent',
      );

      // Create admin user
      const adminUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `admin-event-${Date.now()}@test.openmeet.net`,
        'Admin',
        'EventTest',
      );

      // Create a group
      const group = await createGroup(app, ownerUser.token, {
        name: `Event Test Group ${Date.now()}`,
        description: 'Group for testing event handling',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Create an event in the group
      const event = await createEvent(app, ownerUser.token, {
        name: `Test Event ${Date.now()}`,
        description: 'Event to test null userId',
        type: EventType.InPerson,
        location: 'Test Location',
        status: EventStatus.Published,
        group: group.id,
      });

      // Admin joins and gets promoted
      const joinResult = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminUser.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        joinResult.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        joinResult.id,
        'admin',
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify event still exists
      const eventResponse = await request(app)
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(eventResponse.status).toBe(200);
      expect(eventResponse.body.slug).toBe(event.slug);

      // Verify userId is NULL (user field should be null or undefined)
      expect(eventResponse.body.user).toBeNull();

      // Cleanup
      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should delete standalone events (not in a group) when user is deleted', async () => {
      // Create user
      const testUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `standalone-event-${Date.now()}@test.openmeet.net`,
        'Standalone',
        'EventUser',
      );

      // Create a standalone event (no group)
      const event = await createEvent(app, testUser.token, {
        name: `Standalone Event ${Date.now()}`,
        description: 'Event without a group',
        type: EventType.Online,
        locationOnline: 'https://meet.example.com',
        status: EventStatus.Published,
        // No group field - this is a standalone event
      });

      // Verify event exists
      const eventCheckResponse = await request(app)
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(eventCheckResponse.status).toBe(200);

      // Delete the user
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${testUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify event no longer exists
      const eventDeletedResponse = await request(app)
        .get(`/api/events/${event.slug}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(eventDeletedResponse.status).toBe(404);
    });
  });

  describe('Deterministic Successor Selection', () => {
    it('should prefer admin over moderator for group ownership', async () => {
      // Create owner
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner-priority-${Date.now()}@test.openmeet.net`,
        'Owner',
        'Priority',
      );

      // Create moderator (joins first)
      const moderatorUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `moderator-priority-${Date.now()}@test.openmeet.net`,
        'Organizer',
        'Priority',
      );

      // Create admin (joins second)
      const adminUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `admin-priority-${Date.now()}@test.openmeet.net`,
        'Admin',
        'Priority',
      );

      // Create group
      const group = await createGroup(app, ownerUser.token, {
        name: `Priority Test Group ${Date.now()}`,
        description: 'Testing role priority for succession',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Organizer joins first
      const moderatorJoin = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        moderatorUser.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        moderatorJoin.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        moderatorJoin.id,
        'moderator',
        ownerUser.token,
      );

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Admin joins second
      const adminJoin = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminUser.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminJoin.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminJoin.id,
        'admin',
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify ownership transferred to admin (not moderator), even though moderator joined first
      // Use system admin token to check since the successor's token may not have refreshed permissions
      const groupResponse = await request(app)
        .get(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(groupResponse.status).toBe(200);
      expect(groupResponse.body.createdBy.id).toBe(adminUser.id);

      // Verify the successor's role was elevated to owner
      const membersResponse = await request(app)
        .get(`/api/groups/${group.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(membersResponse.status).toBe(200);
      const successorMember = membersResponse.body.find(
        (m: any) => m.user.id === adminUser.id,
      );
      expect(successorMember).toBeDefined();
      expect(successorMember.groupRole.name.toLowerCase()).toBe('owner');

      // Cleanup
      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });

    it('should use join date as tiebreaker when roles are equal', async () => {
      // Create owner
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner-tiebreak-${Date.now()}@test.openmeet.net`,
        'Owner',
        'Tiebreak',
      );

      // Create first admin (joins first)
      const firstAdmin = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `first-admin-${Date.now()}@test.openmeet.net`,
        'First',
        'Admin',
      );

      // Create second admin (joins second)
      const secondAdmin = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `second-admin-${Date.now()}@test.openmeet.net`,
        'Second',
        'Admin',
      );

      // Create group
      const group = await createGroup(app, ownerUser.token, {
        name: `Tiebreak Test Group ${Date.now()}`,
        description: 'Testing join date tiebreaker',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // First admin joins
      const firstAdminJoin = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        firstAdmin.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        firstAdminJoin.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        firstAdminJoin.id,
        'admin',
        ownerUser.token,
      );

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second admin joins
      const secondAdminJoin = await joinGroup(
        app,
        TESTING_TENANT_ID,
        group.slug,
        secondAdmin.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        group.slug,
        secondAdminJoin.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        secondAdminJoin.id,
        'admin',
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify ownership transferred to first admin (earlier join date)
      // Use system admin token to check
      const groupResponse = await request(app)
        .get(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(groupResponse.status).toBe(200);
      expect(groupResponse.body.createdBy.id).toBe(firstAdmin.id);

      // Verify the successor's role was elevated to owner
      const membersResponse = await request(app)
        .get(`/api/groups/${group.slug}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(membersResponse.status).toBe(200);
      const successorMember = membersResponse.body.find(
        (m: any) => m.user.id === firstAdmin.id,
      );
      expect(successorMember).toBeDefined();
      expect(successorMember.groupRole.name.toLowerCase()).toBe('owner');

      // Cleanup
      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });

  describe('Edge Cases', () => {
    it('should handle user deletion when user has multiple groups with different succession scenarios', async () => {
      // Create owner
      const ownerUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `multi-group-owner-${Date.now()}@test.openmeet.net`,
        'Multi',
        'GroupOwner',
      );

      // Create successor for first group
      const successor = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `multi-group-successor-${Date.now()}@test.openmeet.net`,
        'Multi',
        'Successor',
      );

      // Create first group (with successor)
      const groupWithSuccessor = await createGroup(app, ownerUser.token, {
        name: `Multi Group With Successor ${Date.now()}`,
        description: 'Group that will be transferred',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Create second group (no successor - will be deleted)
      const groupNoSuccessor = await createGroup(app, ownerUser.token, {
        name: `Multi Group No Successor ${Date.now()}`,
        description: 'Group that will be deleted',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Add successor to first group
      const successorJoin = await joinGroup(
        app,
        TESTING_TENANT_ID,
        groupWithSuccessor.slug,
        successor.token,
      );
      await approveMember(
        app,
        TESTING_TENANT_ID,
        groupWithSuccessor.slug,
        successorJoin.id,
        ownerUser.token,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        groupWithSuccessor.slug,
        successorJoin.id,
        'admin',
        ownerUser.token,
      );

      // Delete the owner
      const deleteResponse = await request(app)
        .delete(`/api/v1/users/${ownerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(204);

      // Verify first group still exists with new owner (use system admin token)
      const group1Response = await request(app)
        .get(`/api/groups/${groupWithSuccessor.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(group1Response.status).toBe(200);
      expect(group1Response.body.createdBy.id).toBe(successor.id);

      // Verify second group was deleted
      const group2Response = await request(app)
        .get(`/api/groups/${groupNoSuccessor.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(group2Response.status).toBe(404);

      // Cleanup
      await request(app)
        .delete(`/api/groups/${groupWithSuccessor.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    });
  });
});
