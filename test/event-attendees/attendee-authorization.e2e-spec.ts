import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  getAuthToken,
  createEvent,
  createGroup,
  joinGroup,
  approveMember,
  getGroupMembers,
  updateGroupMemberRole,
} from '../utils/functions';
import { EventType, GroupStatus } from '../../src/core/constants/constant';

// Regression coverage for the attendee-management IDOR:
// the DELETE/PATCH `/events/:slug/attendees/:attendeeId` routes once had their
// `@Permissions(ManageAttendees)` decorator commented out, so any authenticated
// user could remove or mutate any other attendee by id. These tests pin the
// authorization contract so it can't silently regress again.
jest.setTimeout(60000);

describe('Event attendee management authorization (e2e)', () => {
  let organizerToken: string; // creates/owns the events -> ManageAttendees via owner
  let attackerToken: string; // a different, non-organizer authenticated user

  const createdEventSlugs: string[] = [];

  function eventData(overrides = {}) {
    return {
      name: 'Authz Test Event',
      slug: `authz-event-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      description: 'Event for attendee authorization tests',
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://test-online-location.com',
      maxAttendees: 100,
      categories: [1],
      lat: 40.7128,
      lon: -74.006,
      status: 'published',
      timeZone: 'UTC',
      ...overrides,
    };
  }

  async function newEvent(token: string, overrides = {}) {
    const ev = await createEvent(TESTING_APP_URL, token, eventData(overrides));
    createdEventSlugs.push(ev.slug);
    return ev;
  }

  async function attend(token: string, slug: string) {
    const res = await request(TESTING_APP_URL)
      .post(`/api/events/${slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});
    expect(res.status).toBe(201);
    return res.body; // includes attendee `id`
  }

  function deleteAttendee(token: string, slug: string, attendeeId: number) {
    return request(TESTING_APP_URL)
      .delete(`/api/events/${slug}/attendees/${attendeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  }

  function updateAttendee(
    token: string,
    slug: string,
    attendeeId: number,
    body: Record<string, unknown>,
  ) {
    return request(TESTING_APP_URL)
      .patch(`/api/events/${slug}/attendees/${attendeeId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(body);
  }

  function listAttendees(token: string, slug: string) {
    return request(TESTING_APP_URL)
      .get(`/api/events/${slug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  }

  beforeAll(async () => {
    organizerToken = await getAuthToken(
      TESTING_APP_URL,
      TESTING_ADMIN_EMAIL,
      TESTING_ADMIN_PASSWORD,
    );
    attackerToken = await getAuthToken(
      TESTING_APP_URL,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
  });

  afterAll(async () => {
    for (const slug of createdEventSlugs) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${slug}`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  it('should forbid a non-organizer attendee from deleting another attendee (IDOR)', async () => {
    const event = await newEvent(organizerToken);
    const organizerAttendee = await attend(organizerToken, event.slug);
    // attacker is a legitimate attendee, but has no management role
    await attend(attackerToken, event.slug);

    const res = await deleteAttendee(
      attackerToken,
      event.slug,
      organizerAttendee.id,
    );

    expect(res.status).toBe(403);

    // organizer's attendance must still be intact
    const list = await listAttendees(organizerToken, event.slug);
    const stillThere = list.body.data.find(
      (a: { id: number }) => a.id === organizerAttendee.id,
    );
    expect(stillThere).toBeDefined();
  });

  it('should forbid a non-organizer attendee from updating another attendee (IDOR)', async () => {
    const event = await newEvent(organizerToken);
    const organizerAttendee = await attend(organizerToken, event.slug);
    await attend(attackerToken, event.slug);

    const res = await updateAttendee(
      attackerToken,
      event.slug,
      organizerAttendee.id,
      { status: 'cancelled' },
    );

    expect(res.status).toBe(403);
  });

  it('should allow the event owner to delete an attendee (positive control)', async () => {
    const event = await newEvent(organizerToken);
    const attackerAttendee = await attend(attackerToken, event.slug);

    const res = await deleteAttendee(
      organizerToken,
      event.slug,
      attackerAttendee.id,
    );

    expect([200, 204]).toContain(res.status);
  });

  it('should not delete an attendee that belongs to a different event (cross-event IDOR)', async () => {
    // Organizer owns event A (so the permission guard, scoped to A, will pass).
    const eventA = await newEvent(organizerToken);
    // Event B is owned by a different user; attacker attends B there.
    const eventB = await newEvent(attackerToken);
    const attendeeInB = await attend(attackerToken, eventB.slug);

    // Authorized for A, but targeting an attendee id that lives in B.
    const res = await deleteAttendee(
      organizerToken,
      eventA.slug,
      attendeeInB.id,
    );

    // Must NOT succeed: organizer has no authority over event B's roster.
    expect([403, 404]).toContain(res.status);

    // Confirm the attendee in B was not removed.
    const list = await listAttendees(attackerToken, eventB.slug);
    const stillThere = list.body.data.find(
      (a: { id: number }) => a.id === attendeeInB.id,
    );
    expect(stillThere).toBeDefined();
  });

  it('should allow a group admin to delete an attendee on a group event they did not create (CRMC scenario)', async () => {
    // Organizer creates a group and an event under it.
    const group = await createGroup(TESTING_APP_URL, organizerToken, {
      name: `IDOR Test Group ${Date.now()}`,
      description: 'Group for attendee authz test',
      status: GroupStatus.Published,
    });
    const groupEvent = await newEvent(organizerToken, { group: group.id });

    // Second user joins the group, gets approved and promoted to admin.
    const membership = await joinGroup(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      group.slug,
      attackerToken,
    );
    await approveMember(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      group.slug,
      membership.id,
      organizerToken,
    );
    const members = await getGroupMembers(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      group.slug,
      organizerToken,
    );
    const memberRecord = members.find(
      (m: { id: number }) => m.id === membership.id,
    );
    await updateGroupMemberRole(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      group.slug,
      memberRecord.id,
      'admin',
      organizerToken,
    );

    // Organizer attends the group event.
    const organizerAttendee = await attend(organizerToken, groupEvent.slug);

    // Group admin (not event creator) deletes the organizer's attendance.
    const res = await deleteAttendee(
      attackerToken,
      groupEvent.slug,
      organizerAttendee.id,
    );

    // Should succeed: group admins have MANAGE_EVENTS which grants
    // event-scoped operations including attendee management.
    expect([200, 204]).toContain(res.status);
  });
});
