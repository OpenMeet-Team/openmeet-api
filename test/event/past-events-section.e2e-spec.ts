import * as request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';
import {
  createTestUser,
  createEvent,
  getAllEvents,
} from '../utils/functions';

describe('Past Events Section (e2e)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let testUser: any;
  let pastEvent: any;
  let futureEvent: any;
  let cancelledEvent: any;

  beforeAll(async () => {
    // Set up server app agent with tenant
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Create test user
    const timestamp = Date.now();
    testUser = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `openmeet-test-past-events-${timestamp}@openmeet.net`,
      'Test',
      'User',
    );

    // Create a past event (ended 1 day ago)
    const pastStartDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const pastEndDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    
    pastEvent = await createEvent(TESTING_APP_URL, testUser.token, {
      name: 'Past Test Event',
      description: 'Test event that has already ended',
      startDate: pastStartDate.toISOString(),
      endDate: pastEndDate.toISOString(),
      timeZone: 'America/New_York',
      type: 'hybrid',
      locationOnline: 'https://example.com/past-meeting',
      lat: 0,
      lon: 0,
      maxAttendees: 10,
      categories: [],
      visibility: 'public',
      status: 'published',
    });

    // Create a future event
    const futureStartDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day from now
    const futureEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    
    futureEvent = await createEvent(TESTING_APP_URL, testUser.token, {
      name: 'Future Test Event',
      description: 'Test event that will happen in the future',
      startDate: futureStartDate.toISOString(),
      endDate: futureEndDate.toISOString(),
      timeZone: 'America/New_York',
      type: 'hybrid',
      locationOnline: 'https://example.com/future-meeting',
      lat: 0,
      lon: 0,
      maxAttendees: 10,
      categories: [],
      visibility: 'public',
      status: 'published',
    });

    // Create a cancelled event
    const cancelledStartDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day from now
    const cancelledEndDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    
    cancelledEvent = await createEvent(TESTING_APP_URL, testUser.token, {
      name: 'Cancelled Test Event',
      description: 'Test event that was cancelled',
      startDate: cancelledStartDate.toISOString(),
      endDate: cancelledEndDate.toISOString(),
      timeZone: 'America/New_York',
      type: 'hybrid',
      locationOnline: 'https://example.com/cancelled-meeting',
      lat: 0,
      lon: 0,
      maxAttendees: 10,
      categories: [],
      visibility: 'public',
      status: 'cancelled',
    });
  }, 30000);

  it('should include events with end dates in the past in the events list', async () => {
    // Get events with a larger page size to ensure we catch all our test events
    const response = await serverApp
      .get('/api/events?limit=50')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);
    
    const events = response.body;
    
    // Debug: log the actual response structure
    console.log('Events response type:', typeof events);
    console.log('Events response structure:', Object.keys(events || {}));
    
    // Handle pagination structure - API returns {data: [], total, page, totalPages}
    const eventsArray = events?.data || [];
    
    console.log('Events array length:', eventsArray.length);
    console.log('Total events available:', events.total);
    console.log('Current page:', events.page);
    console.log('Total pages:', events.totalPages);
    console.log('Looking for past event slug:', pastEvent.slug);
    console.log('Looking for future event slug:', futureEvent.slug);
    console.log('Looking for cancelled event slug:', cancelledEvent.slug);
    
    // Log all event slugs in the response
    console.log('All event slugs in response:', eventsArray.map((e: any) => e.slug || 'no-slug'));
    console.log('All event names in response:', eventsArray.map((e: any) => e.name || 'no-name'));
    console.log('All event statuses in response:', eventsArray.map((e: any) => e.status || 'no-status'));
    
    // Find our test events in the response
    const foundPastEvent = eventsArray.find((event: any) => event.slug === pastEvent.slug);
    const foundFutureEvent = eventsArray.find((event: any) => event.slug === futureEvent.slug);
    const foundCancelledEvent = eventsArray.find((event: any) => event.slug === cancelledEvent.slug);

    console.log('Found past event:', !!foundPastEvent);
    console.log('Found future event:', !!foundFutureEvent);
    console.log('Found cancelled event:', !!foundCancelledEvent);

    // Past event should be included in the list (within 3 months)
    expect(foundPastEvent).toBeDefined();
    expect(foundPastEvent.name).toBe('Past Test Event');
    expect(foundPastEvent.status).toBe('published');
    
    // Future event should also be included
    expect(foundFutureEvent).toBeDefined();
    expect(foundFutureEvent.name).toBe('Future Test Event');
    expect(foundFutureEvent.status).toBe('published');

    // Cancelled event should be included as well
    expect(foundCancelledEvent).toBeDefined();
    expect(foundCancelledEvent.name).toBe('Cancelled Test Event');
    expect(foundCancelledEvent.status).toBe('cancelled');

    // Verify that past events have end dates before now
    const pastEventEndDate = new Date(foundPastEvent.endDate);
    const now = new Date();
    expect(pastEventEndDate.getTime()).toBeLessThan(now.getTime());
  }, 15000);

  it('should show cancelled events with cancelled status', async () => {
    const response = await serverApp
      .get('/api/events?limit=50')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);

    const events = response.body;
    const eventsArray = events?.data || [];
    const foundCancelledEvent = eventsArray.find((event: any) => event.slug === cancelledEvent.slug);

    expect(foundCancelledEvent).toBeDefined();
    expect(foundCancelledEvent.status).toBe('cancelled');
    expect(foundCancelledEvent.name).toBe('Cancelled Test Event');
  }, 15000);

  it('should return events in chronological order (earliest start date first)', async () => {
    const response = await serverApp
      .get('/api/events?limit=50')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);
    
    const events = response.body;
    
    // Handle pagination structure - API returns {data: [], total, page, totalPages}
    const eventsArray = events?.data || [];
    
    // Filter to our test events and sort by creation order
    const testEvents = eventsArray.filter((event: any) => 
      [pastEvent.slug, futureEvent.slug, cancelledEvent.slug].includes(event.slug)
    );

    if (testEvents.length >= 2) {
      // Events should be ordered by start date (past event should come before future events)
      const pastEventInList = testEvents.find((event: any) => event.slug === pastEvent.slug);
      const futureEventInList = testEvents.find((event: any) => event.slug === futureEvent.slug);
      
      if (pastEventInList && futureEventInList) {
        const pastEventIndex = testEvents.indexOf(pastEventInList);
        const futureEventIndex = testEvents.indexOf(futureEventInList);
        
        // Past event should appear before future event in the chronologically sorted list
        expect(pastEventIndex).toBeLessThan(futureEventIndex);
      }
    }
  }, 15000);

  afterAll(async () => {
    // Clean up test events
    const eventsToClean = [pastEvent, futureEvent, cancelledEvent];
    
    for (const event of eventsToClean) {
      if (event?.slug) {
        try {
          await serverApp
            .delete(`/api/events/${event.slug}`)
            .set('Authorization', `Bearer ${testUser.token}`)
            .timeout(10000);
        } catch (error) {
          console.log(`Event cleanup failed for ${event.slug}:`, error.message);
        }
      }
    }
  }, 15000);
});