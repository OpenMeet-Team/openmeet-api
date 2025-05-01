import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { EventType } from '../../src/core/constants/constant';

// Set a global timeout for this entire test file
jest.setTimeout(60000);

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
        type: EventType.Hybrid,
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

  async function attendEvent(token, eventSlug) {
    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${eventSlug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});

    return attendResponse;
  }

  beforeEach(async () => {
    token = await loginAsTester();
    testEvent = await createEvent(token);
  });

  afterEach(async () => {
    if (testEvent && testEvent.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${testEvent.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  it('should retrieve the events the user is attending, hosting or has permission to view', async () => {
    const getMyEventsResponse = await request(TESTING_APP_URL)
      .get('/api/events/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getMyEventsResponse.status).toBe(200);
    // expect(getMyEventsResponse.body).toHaveLength(1);
    // expect(getMyEventsResponse.body[0].event.id).toBe(testEvent.id);
  });

  it('should retrieve attendees of an event', async () => {
    // creating or joining event should grant us this permission
    const getEventAttendeesResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${testEvent.slug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getEventAttendeesResponse.status).toBe(200);
  });

  it('should allow a user to attend an event', async () => {
    // Attend the event
    const attendResponse = await attendEvent(token, testEvent.slug);
    expect(attendResponse.status).toBe(201);

    // Verify the user is now an attendee
    const getEventAttendeesResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${testEvent.slug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getEventAttendeesResponse.status).toBe(200);
    expect(getEventAttendeesResponse.body.data.length).toBeGreaterThan(0);
  });

  it('should handle duplicate attempts to attend the same event', async () => {
    // Attend the event first time
    const firstAttendResponse = await attendEvent(token, testEvent.slug);
    expect(firstAttendResponse.status).toBe(201);

    // Get the attendee ID from the first response
    const firstAttendeeId = firstAttendResponse.body.id;

    // Try to attend the same event again
    const secondAttendResponse = await attendEvent(token, testEvent.slug);

    // Should still return success
    expect(secondAttendResponse.status).toBe(201);

    // Should return the same attendee record (same ID)
    expect(secondAttendResponse.body.id).toBe(firstAttendeeId);

    // Verify there's still just one attendance record
    const getEventAttendeesResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${testEvent.slug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Count how many times the current user appears in the attendees list
    // This assumes the response includes a way to identify the current user
    const currentUserAttendances = getEventAttendeesResponse.body.data.filter(
      (attendee) => attendee.id === firstAttendeeId,
    );

    // Should only be one attendance record for this user
    expect(currentUserAttendances.length).toBe(1);
  });

  it('should allow the user to cancel attendance', async () => {
    // First attend the event
    await attendEvent(token, testEvent.slug);

    // Then cancel attendance
    const cancelAttendanceResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${testEvent.slug}/cancel-attending`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(cancelAttendanceResponse.status).toBe(201);
  });
});
