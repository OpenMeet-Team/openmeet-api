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
  let group: any;
  let groupRestrictedEvent: any;

  beforeAll(async () => {
    try {
      adminToken = await loginAsAdmin();
      const timestamp = Date.now();

      // Create a group
      group = await createGroup(app, adminToken, {
        name: `Test Group ${timestamp}`,
        slug: `test-group-${timestamp}`,
        description: 'A test group for role management',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
        allowAutoApproval: true,
      });

      // Create an event that requires group membership
      groupRestrictedEvent = await createEvent(app, adminToken, {
        name: 'Group Members Only Event',
        slug: `group-members-only-${timestamp}`,
        description: 'An event that requires group membership',
        type: EventType.Online,
        startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
        endDate: new Date(new Date().getTime() + 25 * 60 * 60 * 1000),
        maxAttendees: 50,
        locationOnline: 'https://example.com/meeting',
        status: EventStatus.Published,
        group: group.id,
        requireGroupMembership: true,
        timeZone: 'UTC',
        categories: [],
      });
    } catch (error) {
      console.error('Error in test setup:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      // Clean up
      await request(app)
        .delete(`/api/events/${groupRestrictedEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      await request(app)
        .delete(`/api/groups/${group.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    } catch (error) {
      console.error('Error cleaning up test resources:', error);
    }
  });

  describe('Role Management Issues', () => {
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
  });

  describe('Event Group Membership Requirements', () => {
    it('should allow group members to attend events requiring group membership', async () => {
      const timestamp = Date.now();

      // Create a test user and make them a member
      const memberUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `eventtest1-${timestamp}@test.com`,
        'Event Test Member',
        'password123!',
      );

      // Join the group and change to member role
      await joinGroup(app, TESTING_TENANT_ID, group.slug, memberUser.token);

      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );

      const memberRecord = members.find(
        (m) => m.user?.slug === memberUser.slug,
      );
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        memberRecord.id,
        'member',
        adminToken,
      );

      // Now try to attend the event
      const attendResponse = await request(app)
        .post(`/api/events/${groupRestrictedEvent.slug}/attend`)
        .set('Authorization', `Bearer ${memberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(attendResponse.status).toBe(201);
    });

    it('should NOT allow guests to attend events requiring group membership', async () => {
      const timestamp = Date.now();

      // Create a test user and keep them as guest
      const guestUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `eventtest2-${timestamp}@test.com`,
        'Event Test Guest',
        'password123!',
      );

      // Join the group (defaults to guest role)
      await joinGroup(app, TESTING_TENANT_ID, group.slug, guestUser.token);

      // Try to attend the event as a guest
      const attendResponse = await request(app)
        .post(`/api/events/${groupRestrictedEvent.slug}/attend`)
        .set('Authorization', `Bearer ${guestUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // This should fail - guests should not be allowed
      expect(attendResponse.status).toBe(400);
      expect(attendResponse.body.message).toContain('Guests are not allowed');
    });

    it('should NOT allow non-members to attend events requiring group membership', async () => {
      const timestamp = Date.now();

      // Create a test user but don't add them to the group
      const nonMemberUser = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `eventtest3-${timestamp}@test.com`,
        'Event Test NonMember',
        'password123!',
      );

      // Try to attend the event without being a group member
      const attendResponse = await request(app)
        .post(`/api/events/${groupRestrictedEvent.slug}/attend`)
        .set('Authorization', `Bearer ${nonMemberUser.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // This should fail - non-members should not be allowed
      expect(attendResponse.status).toBe(400);
      expect(attendResponse.body.message).toContain(
        'must be a member of this group',
      );
    });
  });
});
