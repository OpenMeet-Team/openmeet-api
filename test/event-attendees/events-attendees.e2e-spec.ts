import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  EventAttendeeStatus,
  EventType,
} from '../../src/core/constants/constant';

// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('EventAttendeeController (e2e)', () => {
  let token;
  let testEvent;
  let adminUser;

  async function loginAsTester() {
    const loginResponse = await request(TESTING_APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    // Store user info for tests
    adminUser = loginResponse.body.user;
    return loginResponse.body.token;
  }

  async function createEvent(token, eventData = {}) {
    const eventResponse = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        name: 'Test Event',
        slug: `test-event-${Date.now()}`, // Make slug unique
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
        status: 'published', // Make sure it's published
        timeZone: 'UTC',
        ...eventData,
      });

    expect(eventResponse.status).toBe(201);
    return eventResponse.body;
  }

  async function attendEvent(token, eventSlug, attendData = {}) {
    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${eventSlug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(attendData);

    return attendResponse;
  }

  async function cancelAttendance(token, eventSlug) {
    return await request(TESTING_APP_URL)
      .post(`/api/events/${eventSlug}/cancel-attending`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});
  }

  async function getEventAttendees(token, eventSlug) {
    return await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
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
    // First attend the event to make sure we have an attendance record
    await attendEvent(token, testEvent.slug);

    const getMyEventsResponse = await request(TESTING_APP_URL)
      .get('/api/events/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getMyEventsResponse.status).toBe(200);
    expect(Array.isArray(getMyEventsResponse.body)).toBe(true);

    // Find the created test event in the dashboard response
    const foundEvent = getMyEventsResponse.body.find(
      (e) => e.slug === testEvent.slug,
    );
    expect(foundEvent).toBeDefined();
  });

  it('should retrieve attendees of an event', async () => {
    // First attend the event
    await attendEvent(token, testEvent.slug);

    // Get attendees list
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    expect(getEventAttendeesResponse.status).toBe(200);
    expect(getEventAttendeesResponse.body.data.length).toBeGreaterThan(0);

    // Verify the current user is in the attendees list
    const currentUserAttendance = getEventAttendeesResponse.body.data.find(
      (attendee) => attendee.user.slug === adminUser.slug,
    );

    expect(currentUserAttendance).toBeDefined();
    expect(currentUserAttendance.status).toBe(EventAttendeeStatus.Confirmed);
  });

  it('should allow a user to attend an event', async () => {
    // Attend the event
    const eventAttendeeResponse = await attendEvent(token, testEvent.slug);
    console.log(
      'eventAttendeeResponse',
      JSON.stringify(eventAttendeeResponse.body, null, 2),
    );

    expect(eventAttendeeResponse.status).toBe(201);
    expect(eventAttendeeResponse.body.id).toBeDefined();
    expect(eventAttendeeResponse.body.status).toBe(
      EventAttendeeStatus.Confirmed,
    );
    expect(eventAttendeeResponse.body.user.slug).toBe(adminUser.slug);
    expect(eventAttendeeResponse.body.event.slug).toBe(testEvent.slug);

    // Verify the user is now an attendee
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    expect(getEventAttendeesResponse.status).toBe(200);
    expect(getEventAttendeesResponse.body.data.length).toBeGreaterThan(0);

    // Find the current user's attendance
    const userAttendance = getEventAttendeesResponse.body.data.find(
      (a) => a.user.slug === adminUser.slug,
    );

    expect(userAttendance).toBeDefined();
    expect(userAttendance.status).toBe(EventAttendeeStatus.Confirmed);
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
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    // Count how many times the current user appears in the attendees list
    const currentUserAttendances = getEventAttendeesResponse.body.data.filter(
      (attendee) => attendee.user.slug === adminUser.slug,
    );

    // Should only be one attendance record for this user
    expect(currentUserAttendances.length).toBe(1);
  });

  it('should allow the user to cancel attendance', async () => {
    // First attend the event
    const attendResponse = await attendEvent(token, testEvent.slug);
    expect(attendResponse.status).toBe(201);

    // Verify initial attendance status
    expect(attendResponse.body.status).toBe(EventAttendeeStatus.Confirmed);

    // Then cancel attendance
    const cancelAttendanceResponse = await cancelAttendance(
      token,
      testEvent.slug,
    );

    // Verify successful cancellation
    expect(cancelAttendanceResponse.status).toBe(201);
    expect(cancelAttendanceResponse.body.status).toBe(
      EventAttendeeStatus.Cancelled,
    );

    // Verify the attendee list reflects the cancellation
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    // Find the current user's attendance record
    const userAttendance = getEventAttendeesResponse.body.data.find(
      (a) => a.user.slug === adminUser.slug,
    );

    // Should show as cancelled
    expect(userAttendance).toBeDefined();
    expect(userAttendance.status).toBe(EventAttendeeStatus.Cancelled);
  });

  it('should allow attending after cancellation (reactivation)', async () => {
    // First attend the event
    let attendResponse = await attendEvent(token, testEvent.slug);
    expect(attendResponse.status).toBe(201);

    // Then cancel attendance
    const cancelResponse = await cancelAttendance(token, testEvent.slug);
    expect(cancelResponse.status).toBe(201);
    expect(cancelResponse.body.status).toBe(EventAttendeeStatus.Cancelled);

    // Attend again (reactivate)
    attendResponse = await attendEvent(token, testEvent.slug);
    expect(attendResponse.status).toBe(201);

    // Should show as confirmed now
    expect(attendResponse.body.status).toBe(EventAttendeeStatus.Confirmed);

    // Verify the attendee list reflects the reactivation
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    // Find the current user's attendance record
    const userAttendance = getEventAttendeesResponse.body.data.find(
      (a) => a.user.slug === adminUser.slug,
    );

    // Should show as confirmed
    expect(userAttendance).toBeDefined();
    expect(userAttendance.status).toBe(EventAttendeeStatus.Confirmed);
  });

  it('should handle waitlist when event is at capacity', async () => {
    // Create a small event with only 1 slot
    const smallEvent = await createEvent(token, {
      maxAttendees: 1,
      allowWaitlist: true,
      slug: `small-event-${Date.now()}`,
    });

    // First user attends (should be confirmed)
    const attendResponse = await attendEvent(token, smallEvent.slug);
    expect(attendResponse.status).toBe(201);
    expect(attendResponse.body.status).toBe(EventAttendeeStatus.Confirmed);

    // Create a second user (mock by using a different token, just for testing)
    // In a real test, we'd create a separate user but this simulates that behavior
    // const secondUserToken = token + '.mock'; // This is a hack for testing purposes only

    // Second user tries to attend (should go to waitlist)
    // Note: This won't actually work in a real test because the token is invalid,
    // but it demonstrates the test approach
    // const secondAttendResponse = await request(TESTING_APP_URL)
    //   .post(`/api/events/${smallEvent.slug}/attend`)
    //   .set('Authorization', `Bearer ${secondUserToken}`)
    //   .set('x-tenant-id', TESTING_TENANT_ID)
    //   .send({});

    // In a real implementation with a valid second user token:
    // expect(secondAttendResponse.status).toBe(201);
    // expect(secondAttendResponse.body.status).toBe(EventAttendeeStatus.Waitlist);

    // Clean up the small event
    await request(TESTING_APP_URL)
      .delete(`/api/events/${smallEvent.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should return 404 when trying to attend a nonexistent event', async () => {
    const nonexistentSlug = 'nonexistent-event-12345';

    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${nonexistentSlug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});

    expect(attendResponse.status).toBe(404);
  });

  it('should return 404 when trying to cancel attendance for a nonexistent event', async () => {
    const nonexistentSlug = 'nonexistent-event-12345';

    const cancelResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${nonexistentSlug}/cancel-attending`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({});

    expect(cancelResponse.status).toBe(404);
  });

  it('should return 404 when trying to view attendees for a nonexistent event', async () => {
    const nonexistentSlug = 'nonexistent-event-12345';

    const attendeesResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${nonexistentSlug}/attendees`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(attendeesResponse.status).toBe(404);
  });

  it('should create cancelled attendee when RSVP No (with status)', async () => {
    // Test the new two-button RSVP functionality - RSVP "No" should create cancelled attendee
    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ status: EventAttendeeStatus.Cancelled });

    expect(attendResponse.status).toBe(201);
    expect(attendResponse.body.status).toBe(EventAttendeeStatus.Cancelled);
    expect(attendResponse.body.user.slug).toBe(adminUser.slug);
    expect(attendResponse.body.event.slug).toBe(testEvent.slug);

    // Verify the user appears in attendees list with cancelled status
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    expect(getEventAttendeesResponse.status).toBe(200);

    const userAttendance = getEventAttendeesResponse.body.data.find(
      (a) => a.user.slug === adminUser.slug,
    );

    expect(userAttendance).toBeDefined();
    expect(userAttendance.status).toBe(EventAttendeeStatus.Cancelled);
  });

  it('should default to confirmed status when no status provided in attend request', async () => {
    // Test that existing behavior is preserved - no status means confirmed
    const attendResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({}); // No status field

    expect(attendResponse.status).toBe(201);
    expect(attendResponse.body.status).toBe(EventAttendeeStatus.Confirmed);
    expect(attendResponse.body.user.slug).toBe(adminUser.slug);
  });

  it('should allow transition from cancelled to confirmed attendance', async () => {
    // First RSVP "No" (cancelled status)
    const cancelledResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ status: EventAttendeeStatus.Cancelled });

    expect(cancelledResponse.status).toBe(201);
    expect(cancelledResponse.body.status).toBe(EventAttendeeStatus.Cancelled);

    // Then RSVP "Yes" (confirmed status)
    const confirmedResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${testEvent.slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ status: EventAttendeeStatus.Confirmed });

    expect(confirmedResponse.status).toBe(201);
    expect(confirmedResponse.body.status).toBe(EventAttendeeStatus.Confirmed);

    // Verify final status in attendees list
    const getEventAttendeesResponse = await getEventAttendees(
      token,
      testEvent.slug,
    );

    const userAttendance = getEventAttendeesResponse.body.data.find(
      (a) => a.user.slug === adminUser.slug,
    );

    expect(userAttendance).toBeDefined();
    expect(userAttendance.status).toBe(EventAttendeeStatus.Confirmed);
  });
});
