import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  createGroup,
  createEvent,
  getEvent,
  getMyEvents,
  updateEvent,
} from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

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
    testGroup = await createGroup(TESTING_APP_URL, token, groupData);
  });

  it.skip('should successfully create an event, update it, find it, and delete it', async () => {
    // Create an event using the REST API
    testEvent = await createEvent(TESTING_APP_URL, token, {
      name: 'Test Event',
      slug: 'test-event',
      description: 'Test Description',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
      type: EventType.Hybrid,
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

    const testEvent2 = await createEvent(TESTING_APP_URL, token, {
      name: 'Test Event 2',
      slug: 'test-event-2',
      description: 'Test Description',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
      type: EventType.Hybrid,
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
    const updatedEvent = await updateEvent(
      TESTING_APP_URL,
      token,
      testEvent.slug,
      {
        name: 'Updated Test Event',
      },
    );

    expect(updatedEvent.name).toBe('Updated Test Event');

    // // get the event
    const foundEvent = await getEvent(TESTING_APP_URL, token, testEvent.slug);
    expect(foundEvent.name).toBe('Updated Test Event');

    // // getEventsByCreator
    const myEvents = await getMyEvents(TESTING_APP_URL, token);
    // expect one of the results to be the updated event
    expect(myEvents.some((event) => event.id === updatedEvent.id)).toBe(true);
    // expect the other result to be the original event
    expect(myEvents.some((event) => event.id === testEvent2.id)).toBe(true);

    // getEventsByAttendee

    // Clean up by deleting the event
    const deleteEventResponse = await request(TESTING_APP_URL)
      .delete(`/api/events/${testEvent.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(deleteEventResponse.status).toBe(200);
  });

  it('should return events sorted by start date', async () => {
    // Create events with different dates
    const futureDate1 = new Date();
    futureDate1.setDate(futureDate1.getDate() + 5);

    const futureDate2 = new Date();
    futureDate2.setDate(futureDate2.getDate() + 2);

    const futureDate3 = new Date();
    futureDate3.setDate(futureDate3.getDate() + 10);

    const event1 = await createEvent(TESTING_APP_URL, token, {
      name: 'Latest Event',
      slug: 'latest-event',
      description: 'Test Description',
      startDate: futureDate3.toISOString(),
      endDate: new Date(futureDate3.getTime() + 3600000).toISOString(),
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    });

    const event2 = await createEvent(TESTING_APP_URL, token, {
      name: 'Earliest Event',
      slug: 'earliest-event',
      description: 'Test Description',
      startDate: futureDate2.toISOString(),
      endDate: new Date(futureDate2.getTime() + 3600000).toISOString(),
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    });

    const event3 = await createEvent(TESTING_APP_URL, token, {
      name: 'Middle Event',
      slug: 'middle-event',
      description: 'Test Description',
      startDate: futureDate1.toISOString(),
      endDate: new Date(futureDate1.getTime() + 3600000).toISOString(),
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    });

    // Define interface for event type
    interface EventResponse {
      id: number;
      startDate: string;
      name: string;
    }

    // Initialize with proper type
    let allEvents: EventResponse[] = [];
    let page = 1;
    const limit = 10;
    let hasMore = true;

    while (hasMore) {
      const response = await request(TESTING_APP_URL)
        .get('/api/events')
        .query({ page, limit })
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      // Type assertion for response.body.data
      const responseData = response.body.data as EventResponse[];
      allEvents = [...allEvents, ...responseData];

      if (response.body.data.length < limit) {
        hasMore = false;
      } else {
        page++;
      }

      // Break if we found all our test events
      if (
        allEvents.some((e) => e.id === event1.id) &&
        allEvents.some((e) => e.id === event2.id) &&
        allEvents.some((e) => e.id === event3.id)
      ) {
        break;
      }
    }
    // Filter to get only our test events
    const relevantEvents = allEvents.filter((e) =>
      [event1.id, event2.id, event3.id].includes(e.id),
    );

    expect(relevantEvents.length).toBe(3);

    // Check if dates are in ascending order
    for (let i = 0; i < relevantEvents.length - 1; i++) {
      const currentDate = new Date(relevantEvents[i].startDate);
      const nextDate = new Date(relevantEvents[i + 1].startDate);
      expect(currentDate.getTime()).toBeLessThanOrEqual(nextDate.getTime());
    }

    // Clean up
    await Promise.all([
      request(TESTING_APP_URL)
        .delete(`/api/events/${event1.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID),
      request(TESTING_APP_URL)
        .delete(`/api/events/${event2.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID),
      request(TESTING_APP_URL)
        .delete(`/api/events/${event3.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID),
    ]);
  });

  // After each test, clean up by deleting the group
  afterEach(async () => {
    if (testEvent && testEvent.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${testEvent.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    if (testGroup && testGroup.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });
});
