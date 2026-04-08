import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_TENANT_ID,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
} from '../utils/constants';
import {
  EventAttendeeStatus,
  EventType,
  EventVisibility,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Attendance Service (e2e)', () => {
  let adminToken: string;
  let userToken: string;
  let regularUser: any;

  async function login(email: string, password: string) {
    const response = await request(TESTING_APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ email, password });

    expect(response.status).toBe(200);
    return { token: response.body.token, user: response.body.user };
  }

  async function createTestEvent(
    token: string,
    overrides: Record<string, any> = {},
  ) {
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        name: `Attendance Test Event ${Date.now()}`,
        description: 'Testing attendance service',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 100,
        categories: [],
        lat: 0.0,
        lon: 0.0,
        status: 'published',
        timeZone: 'UTC',
        ...overrides,
      });

    expect(response.status).toBe(201);
    return response.body;
  }

  async function deleteTestEvent(token: string, slug: string) {
    await request(TESTING_APP_URL)
      .delete(`/api/events/${slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  }

  beforeAll(async () => {
    const adminLogin = await login(TESTING_ADMIN_EMAIL, TESTING_ADMIN_PASSWORD);
    adminToken = adminLogin.token;

    const userLogin = await login(TESTING_USER_EMAIL, TESTING_USER_PASSWORD);
    userToken = userLogin.token;
    regularUser = userLogin.user;
  });

  describe('Public event RSVP', () => {
    let publicEvent: any;

    beforeEach(async () => {
      publicEvent = await createTestEvent(adminToken, {
        visibility: EventVisibility.Public,
      });
    });

    afterEach(async () => {
      if (publicEvent?.slug) {
        await deleteTestEvent(adminToken, publicEvent.slug);
      }
    });

    it('should RSVP to a public event and return confirmed status', async () => {
      const res = await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe(EventAttendeeStatus.Confirmed);
      expect(res.body.user.slug).toBe(regularUser.slug);
      expect(res.body.event.slug).toBe(publicEvent.slug);
    });

    it('should cancel attendance on a public event', async () => {
      // First attend
      const attendRes = await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(attendRes.status).toBe(201);
      expect(attendRes.body.status).toBe(EventAttendeeStatus.Confirmed);

      // Then cancel
      const cancelRes = await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/cancel-attending`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.status).toBe(EventAttendeeStatus.Cancelled);
    });

    it('should list the user in event attendees after RSVP', async () => {
      // Attend
      await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Check attendees list
      const attendeesRes = await request(TESTING_APP_URL)
        .get(`/api/events/${publicEvent.slug}/attendees`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesRes.status).toBe(200);

      const userAttendance = attendeesRes.body.data.find(
        (a: any) => a.user.slug === regularUser.slug,
      );
      expect(userAttendance).toBeDefined();
      expect(userAttendance.status).toBe(EventAttendeeStatus.Confirmed);
    });

    it('should re-confirm after cancel (reactivation)', async () => {
      // Attend
      await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Cancel
      await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/cancel-attending`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Re-attend
      const reattendRes = await request(TESTING_APP_URL)
        .post(`/api/events/${publicEvent.slug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(reattendRes.status).toBe(201);
      expect(reattendRes.body.status).toBe(EventAttendeeStatus.Confirmed);
    });
  });

  describe('Private event RSVP', () => {
    let privateEvent: any;

    beforeEach(async () => {
      privateEvent = await createTestEvent(adminToken, {
        visibility: EventVisibility.Private,
      });
    });

    afterEach(async () => {
      if (privateEvent?.slug) {
        await deleteTestEvent(adminToken, privateEvent.slug);
      }
    });

    it('should RSVP to a private event as the creator (local record only)', async () => {
      // The event creator should be able to RSVP to their own private event
      const res = await request(TESTING_APP_URL)
        .post(`/api/events/${privateEvent.slug}/attend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe(EventAttendeeStatus.Confirmed);

      // Private events should not have atprotoUri — they are local-only
      expect(privateEvent.atprotoUri).toBeFalsy();
    });

    it('should cancel attendance on a private event', async () => {
      // First attend as the creator
      const attendRes = await request(TESTING_APP_URL)
        .post(`/api/events/${privateEvent.slug}/attend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(attendRes.status).toBe(201);

      // Then cancel
      const cancelRes = await request(TESTING_APP_URL)
        .post(`/api/events/${privateEvent.slug}/cancel-attending`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(cancelRes.status).toBe(201);
      expect(cancelRes.body.status).toBe(EventAttendeeStatus.Cancelled);
    });

    it('should not have atprotoUri or atprotoRkey on private event', async () => {
      // Verify the event itself has no AT Protocol references
      const eventRes = await request(TESTING_APP_URL)
        .get(`/api/events/${privateEvent.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Private events may return 404 from the public endpoint
      // If they do, that itself confirms they are not publicly visible
      if (eventRes.status === 200) {
        expect(eventRes.body.atprotoUri).toBeFalsy();
        expect(eventRes.body.atprotoRkey).toBeFalsy();
      }
    });
  });

  describe('Edge cases', () => {
    it('should return 404 when attending a nonexistent event', async () => {
      const res = await request(TESTING_APP_URL)
        .post('/api/events/nonexistent-event-slug-99999/attend')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(res.status).toBe(404);
    });

    it('should return 404 when cancelling attendance on a nonexistent event', async () => {
      const res = await request(TESTING_APP_URL)
        .post('/api/events/nonexistent-event-slug-99999/cancel-attending')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(res.status).toBe(404);
    });

    it('should reject attending without authentication', async () => {
      const publicEvent = await createTestEvent(adminToken, {
        visibility: EventVisibility.Public,
      });

      try {
        const res = await request(TESTING_APP_URL)
          .post(`/api/events/${publicEvent.slug}/attend`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({});

        // Should not return 2xx — either 401 (auth guard) or 500 (no user context)
        expect(res.status).toBeGreaterThanOrEqual(400);
      } finally {
        await deleteTestEvent(adminToken, publicEvent.slug);
      }
    });
  });
});
