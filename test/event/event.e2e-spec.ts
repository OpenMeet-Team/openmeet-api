import request from 'supertest';
import { APP_URL } from '../utils/constants';
import {
  loginAsTester,
  createGroup,
  createEvent,
  getEvent,
  getMyEvents,
  updateEvent,
} from '../utils/functions';

describe('EventController (e2e)', () => {
  let token;
  let testGroup;
  let testEvent;

  const groupData = {
    name: 'Test Group',
    description: 'Test Group Description',
  };

  // Before each test, log in as the test user and create a group
  beforeEach(async () => {
    token = await loginAsTester();
    testGroup = await createGroup(APP_URL, token, groupData);
  });

  it('should successfully create an event, update it, find it, and delete it', async () => {
    // Create an event using the REST API
    testEvent = await createEvent(APP_URL, token, {
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

    const testEvent2 = await createEvent(APP_URL, token, {
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
    const updatedEvent = await updateEvent(APP_URL, token, testEvent.id, {
      name: 'Updated Test Event',
    });

    expect(updatedEvent.name).toBe('Updated Test Event');

    // get the event
    const foundEvent = await getEvent(APP_URL, token, testEvent.id);
    expect(foundEvent.name).toBe('Updated Test Event');

    // getEventsByCreator
    const myEvents = await getMyEvents(APP_URL, token);
    // expect one of the results to be the updated event
    expect(myEvents.some((event) => event.id === updatedEvent.id)).toBe(true);
    // expect the other result to be the original event
    expect(myEvents.some((event) => event.id === testEvent2.id)).toBe(true);

    // getEventsByAttendee

    // Clean up by deleting the event
    const deleteEventResponse = await request(APP_URL)
      .delete(`/api/events/${testEvent.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', '1');
    expect(deleteEventResponse.status).toBe(200);
  });

  // After each test, clean up by deleting the group
  afterEach(async () => {
    if (testEvent && testEvent.id) {
      await request(APP_URL)
        .delete(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', '1');
    }

    if (testGroup && testGroup.id) {
      await request(APP_URL)
        .delete(`/api/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', '1');
    }
  });
});
