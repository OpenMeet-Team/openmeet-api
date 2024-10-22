import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';

describe('EventController (e2e)', () => {
  let token;
  let testGroup;
  let testEvent;

  // Helper function to log in as the test user
  async function loginAsTester() {
    const loginResponse = await request(APP_URL)
      .post('/api/v1/auth/email/login')
      .set('tenant-id', '1')
      .send({
        email: TESTER_EMAIL,
        password: TESTER_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  // Helper function to create a group
  async function createGroup(token) {
    const groupResponse = await request(APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1')
      .send({
        name: 'Test Group',
        description: 'A test group',
        // ... other required group details
      });

    expect(groupResponse.status).toBe(201);

    return groupResponse.body;
  }

  // Helper function to create an event
  async function createEvent(token, eventData) {
    const req = request(APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    const response = await req.send(eventData);

    expect(response.status).toBe(201);

    return response.body;
  }

  async function updateEvent(token, eventId, eventData) {
    const response = await request(APP_URL)
      .patch(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1')
      .send(eventData);

    expect(response.status).toBe(200);

    return response.body;
  }

  async function getEvent(token, eventId) {
    const response = await request(APP_URL)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(response.status).toBe(200);

    return response.body;
  }
  async function getMyEvents(token) {
    const response = await request(APP_URL)
      .get(`/api/dashboard/my-events`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(response.status).toBe(200);
    return response.body;
  }

  // Before each test, log in as the test user and create a group
  beforeEach(async () => {
    token = await loginAsTester();
    testGroup = await createGroup(token);
  });

  it('should successfully create an event, update it, find it, and delete it', async () => {
    // Create an event using the REST API
    testEvent = await createEvent(token, {
      name: 'Test Event',
      slug: 'test-event',
      image: 'test-image-url',
      description: 'Test Description',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
      type: 'hybrid',
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'draft',
      group: null,
    });

    expect(testEvent.name).toBe('Test Event');
    expect(testEvent.description).toBe('Test Description');

    const testEvent2 = await createEvent(token, {
      name: 'Test Event 2',
      slug: 'test-event-2',
      image: 'test-image-url',
      description: 'Test Description',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
      type: 'hybrid',
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'draft',
      group: null,
    });

    expect(testEvent2.name).toBe('Test Event 2');
    expect(testEvent2.description).toBe('Test Description');

    //   update the event
    const updatedEvent = await updateEvent(token, testEvent.id, {
      name: 'Updated Test Event',
    });

    expect(updatedEvent.name).toBe('Updated Test Event');

    // get the event
    const foundEvent = await getEvent(token, testEvent.id);
    expect(foundEvent.name).toBe('Updated Test Event');

    // getEventsByCreator
    const myEvents = await getMyEvents(token);
    // expect one of the results to be the updated event
    expect(myEvents.some((event) => event.id === updatedEvent.id)).toBe(true);
    // expect the other result to be the original event
    expect(myEvents.some((event) => event.id === testEvent2.id)).toBe(true);

    // getEventsByAttendee

    // Clean up by deleting the event
    const deleteEventResponse = await request(APP_URL)
      .delete(`/api/events/${testEvent.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');
    expect(deleteEventResponse.status).toBe(200);
  });

  // After each test, clean up by deleting the group
  afterEach(async () => {
    if (testEvent && testEvent.id) {
      await request(APP_URL)
        .delete(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', '1');
    }

    if (testGroup && testGroup.id) {
      await request(APP_URL)
        .delete(`/api/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', '1');
    }
  });
});
