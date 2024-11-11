import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_TENANT_ID,
  TESTING_ADMIN_ID,
} from '../utils/constants';

describe('EventAttendeeController (e2e)', () => {
  let token;
  let testEvent;

  async function loginAsTester() {
    const loginResponse = await request(TESTING_APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  async function createEvent(token) {
    const eventResponse = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        name: 'Test Event',
        slug: 'test-event',
        description: 'A test event',
        startDate: '2024-12-31T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        type: 'hybrid',
        location: 'Test Location',
        locationOnline: 'https://test-online-location.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: 'draft',
        // group: 1,
      });

    expect(eventResponse.status).toBe(201);
    return eventResponse.body;
  }

  async function attendEvent(token, eventId) {
    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${eventId}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        eventId,
      });

    expect(attendResponse.status).toBe(201);
    return attendResponse.body;
  }

  beforeEach(async () => {
    token = await loginAsTester();
    testEvent = await createEvent(token);
    await attendEvent(token, testEvent.id);
  });

  afterEach(async () => {
    if (testEvent && testEvent.id) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  it('should retrieve the events the user is attending', async () => {
    const getMyEventsResponse = await request(TESTING_APP_URL)
      .get('/api/events/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getMyEventsResponse.status).toBe(200);
    // expect(getMyEventsResponse.body).toHaveLength(1);
    // expect(getMyEventsResponse.body[0].event.id).toBe(testEvent.id);
  });

  it('should retrieve attendees of an event', async () => {
    const getEventAttendeesResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${testEvent.id}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getEventAttendeesResponse.status).toBe(200);

    const isTesterAttending = getEventAttendeesResponse.body.data.some(
      (attendee) => attendee.user.id === TESTING_ADMIN_ID,
    );
    expect(isTesterAttending).toBe(true);
  });

  // it('should allow the user to cancel attendance', async () => {
  //   const cancelAttendanceResponse = await request(APP_URL)
  //     .delete(`/api/event-attendees/cancel/1/${testEvent.id}`) // assuming tester has user ID 1
  //     .set('Authorization', `Bearer ${token}`)
  //     .set('tenant-id', '1');

  //   expect(cancelAttendanceResponse.status).toBe(200);

  //   // Verify user is no longer attending the event
  //   const getEventAttendeesResponse = await request(APP_URL)
  //     .get(`/api/event-attendees/${testEvent.id}`)
  //     .set('Authorization', `Bearer ${token}`)
  //     .set('tenant-id', '1');

  //   const isTesterStillAttending = getEventAttendeesResponse.body.data.some(
  //     (attendee) => attendee.user.id === 1,
  //   );
  //   expect(isTesterStillAttending).toBe(false);
  // });
});
