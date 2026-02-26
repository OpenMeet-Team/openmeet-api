import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createEvent,
  createTestUser,
  createGroup,
  joinGroup,
  updateGroupMemberRole,
  getGroupMembers,
  getCurrentUser,
  loginAsAdmin,
  updateEvent,
} from '../utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
  GroupVisibility,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Event Creator - No Auto-RSVP (e2e)', () => {
  const app = TESTING_APP_URL;

  describe('Event creation does not auto-RSVP the creator', () => {
    let creatorToken: string;
    let event: any;

    beforeAll(async () => {
      const timestamp = Date.now();
      const creator = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `creator.${timestamp}@example.com`,
        'Event',
        'Creator',
      );
      creatorToken = creator.token;

      event = await createEvent(app, creatorToken, {
        name: `No Auto-RSVP Test ${timestamp}`,
        description: 'Verify creator is not auto-added as attendee',
        type: EventType.InPerson,
        location: 'Test Location',
        status: EventStatus.Published,
        categories: [],
        timeZone: 'UTC',
      });
    });

    afterAll(async () => {
      if (event?.slug) {
        await request(app)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    });

    it('should not have the creator in the attendees list', async () => {
      const attendeesResponse = await request(app)
        .get(`/api/events/${event.slug}/attendees`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      // Attendees list should be empty — creator is not auto-RSVP'd
      const attendees = attendeesResponse.body.data || attendeesResponse.body;
      expect(attendees).toHaveLength(0);
    });
  });

  describe('Event creator can still manage their event without being an attendee', () => {
    let creatorToken: string;
    let event: any;

    beforeAll(async () => {
      const timestamp = Date.now();
      const creator = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `owner.${timestamp}@example.com`,
        'Event',
        'Owner',
      );
      creatorToken = creator.token;

      event = await createEvent(app, creatorToken, {
        name: `Owner Edit Test ${timestamp}`,
        description: 'Original description',
        type: EventType.Hybrid,
        locationOnline: 'https://example.com/meeting',
        status: EventStatus.Published,
        categories: [],
        timeZone: 'UTC',
      });
    });

    afterAll(async () => {
      // Event may already be deleted by the delete test
    });

    it('should allow the creator to edit their event', async () => {
      const updatedEvent = await updateEvent(app, creatorToken, event.slug, {
        name: 'Updated by Owner',
        description: 'Updated without being an attendee',
      });

      expect(updatedEvent.name).toBe('Updated by Owner');
      expect(updatedEvent.description).toBe(
        'Updated without being an attendee',
      );
    });

    it('should allow the creator to access the edit endpoint', async () => {
      const editResponse = await request(app)
        .get(`/api/events/${event.slug}/edit`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(200);
    });

    it('should allow the creator to delete their event', async () => {
      const deleteResponse = await request(app)
        .delete(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(deleteResponse.status).toBe(200);

      // Verify it's gone
      const getResponse = await request(app)
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${creatorToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(getResponse.status).toBe(404);
    });
  });

  describe('Non-creator cannot edit events they do not own', () => {
    let creatorToken: string;
    let strangerToken: string;
    let event: any;

    beforeAll(async () => {
      const timestamp = Date.now();
      const creator = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `maker.${timestamp}@example.com`,
        'Event',
        'Maker',
      );
      creatorToken = creator.token;

      const stranger = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `stranger.${timestamp}@example.com`,
        'Random',
        'Stranger',
      );
      strangerToken = stranger.token;

      event = await createEvent(app, creatorToken, {
        name: `Permission Denied Test ${timestamp}`,
        description: 'Only the creator should edit this',
        type: EventType.InPerson,
        location: 'Test Location',
        status: EventStatus.Published,
        categories: [],
        timeZone: 'UTC',
      });
    });

    afterAll(async () => {
      if (event?.slug) {
        await request(app)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    });

    it('should reject edit access for a non-creator', async () => {
      const editResponse = await request(app)
        .get(`/api/events/${event.slug}/edit`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(editResponse.status).toBe(403);
    });

    it('should reject update from a non-creator', async () => {
      const updateResponse = await request(app)
        .patch(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'Unauthorized Update' });

      expect(updateResponse.status).toBe(403);
    });
  });

  describe('Group admin can edit group events they did not create', () => {
    let adminToken: string;
    let groupAdminToken: string;
    let creatorToken: string;
    let group: any;
    let groupEvent: any;

    beforeAll(async () => {
      const timestamp = Date.now();
      adminToken = await loginAsAdmin();

      // Creator: makes the event
      const creator = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `grp.creator.${timestamp}@example.com`,
        'Group',
        'Creator',
      );
      creatorToken = creator.token;

      // Group admin: should be able to edit the event via group permissions
      const groupAdmin = await createTestUser(
        app,
        TESTING_TENANT_ID,
        `grp.admin.${timestamp}@example.com`,
        'Group',
        'Admin',
      );
      groupAdminToken = groupAdmin.token;

      // Create group as platform admin
      group = await createGroup(app, adminToken, {
        name: `Permission Test Group ${timestamp}`,
        description: 'Testing group admin can edit events',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
      });

      // Both users join the group
      await joinGroup(app, TESTING_TENANT_ID, group.slug, creatorToken);
      await joinGroup(app, TESTING_TENANT_ID, group.slug, groupAdminToken);

      // Promote groupAdmin to admin role
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        group.slug,
        adminToken,
      );

      const adminDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        groupAdminToken,
      );

      const adminMember = members.find(
        (m) => m.user && m.user.slug === adminDetails.slug,
      );

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

      // Creator creates event in the group
      groupEvent = await createEvent(app, creatorToken, {
        name: `Group Admin Edit Test ${timestamp}`,
        description: 'Created by one user, editable by group admin',
        type: EventType.Hybrid,
        locationOnline: 'https://example.com/meeting',
        status: EventStatus.Published,
        group: group.id,
        categories: [],
        timeZone: 'UTC',
      });
    });

    afterAll(async () => {
      if (groupEvent?.slug) {
        await request(app)
          .delete(`/api/events/${groupEvent.slug}`)
          .set('Authorization', `Bearer ${creatorToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
      if (group?.slug) {
        await request(app)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    });

    it('should allow a group admin to edit an event they did not create', async () => {
      const updatedEvent = await updateEvent(
        app,
        groupAdminToken,
        groupEvent.slug,
        {
          name: 'Updated by Group Admin',
          description: 'Group admin edited this event',
        },
      );

      expect(updatedEvent.name).toBe('Updated by Group Admin');
      expect(updatedEvent.description).toBe(
        'Group admin edited this event',
      );
    });
  });
});
