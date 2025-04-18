import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Create Series From Event Tests (e2e)', () => {
  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  // Helper function to wait a short time for backend operations to complete
  const waitForBackend = async (ms = 500) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  it('should create a series from an existing event and verify the event is linked to the series', async () => {
    // STEP 1: Create a regular standalone event first
    console.log('STEP 1: Creating a standalone event as template');
    const eventData = {
      name: 'Template Event for Series Creation',
      description: 'Event that will become the first occurrence in a series',
      type: EventType.InPerson,
      location: 'Test Location',
      maxAttendees: 20,
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
      categories: [],
      timeZone: 'America/New_York',
    };

    // Create the standalone event using the helper function
    const templateEvent = await createEvent(TESTING_APP_URL, token, eventData);
    const templateEventSlug = templateEvent.slug;
    expect(templateEvent).toBeDefined();
    expect(templateEventSlug).toBeDefined();
    console.log(`Template event created with slug: ${templateEventSlug}`);

    // STEP 2: Create a series from the event
    console.log('STEP 2: Creating a series from the event');
    const seriesData = {
      name: `${eventData.name} Series`,
      description: eventData.description,
      timeZone: eventData.timeZone,
      recurrenceRule: {
        frequency: 'WEEKLY',
        interval: 1,
        count: 5, // Create 5 occurrences
      },
    };

    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${templateEventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(seriesResponse.status).toBe(201);
    const createdSeries = seriesResponse.body;
    const seriesSlug = createdSeries.slug;
    console.log(`Series created with slug: ${seriesSlug}`);

    // Verify basic series properties
    expect(createdSeries.name).toBe(seriesData.name);
    expect(createdSeries.description).toBe(seriesData.description);
    expect(createdSeries.templateEventSlug).toBe(templateEventSlug);
    
    // STEP 3: Verify the event is properly linked to the series
    // Give the backend a moment to complete any async operations
    await waitForBackend(1000);
    
    console.log('STEP 3: Verifying the event is properly linked to the series');
    const templateEventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${templateEventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(templateEventResponse.status).toBe(200);
    expect(templateEventResponse.body.seriesSlug).toBe(seriesSlug);
    console.log(`Template event ${templateEventSlug} is confirmed as linked to series ${seriesSlug}`);

    // STEP 4: Clean up - delete the series
    console.log('STEP 4: Cleaning up by deleting the series');
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log('Series deleted successfully with all its events');
  }, 60000); // Specify timeout of 60 seconds

  it('should create a series directly with a template event in a single call', async () => {
    // STEP 1: First create a template event
    console.log('STEP 1: Creating a template event for direct series creation');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    const templateEventData = {
      name: 'Template Event for Direct Series',
      description: 'A template event that will be used to create a series',
      type: EventType.InPerson,
      location: 'Test Location',
      maxAttendees: 20,
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: new Date(tomorrow.getTime() + 3600000).toISOString(), // 1 hour after start
      categories: [],
      timeZone: 'America/New_York',
    };
    
    const templateEvent = await createEvent(
      TESTING_APP_URL,
      token,
      templateEventData,
    );
    expect(templateEvent).toBeDefined();
    const templateEventSlug = templateEvent.slug;
    console.log(`Template event created with slug: ${templateEventSlug}`);
    
    // STEP 2: Now create a series with the template event
    console.log(
      'STEP 2: Creating a series with the template event in a single call',
    );
    
    const seriesData = {
      name: 'Direct Series Creation Test',
      description: 'Series created directly with a template event',
      slug: `direct-series-test-${Date.now()}`,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'WEEKLY',
        interval: 1,
        count: 5,
      },
      templateEventSlug: templateEventSlug, // Specify the template event slug
    };

    const seriesResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(seriesResponse.status).toBe(201);
    const createdSeries = seriesResponse.body;
    const seriesSlug = createdSeries.slug;
    console.log(`Series created directly with slug: ${seriesSlug}`);

    // Verify series properties
    expect(createdSeries.name).toBe(seriesData.name);
    expect(createdSeries.description).toBe(seriesData.description);
    expect(createdSeries.templateEventSlug).toBe(templateEventSlug);
    
    // STEP 3: Verify the template event is linked to the series 
    // Give the backend a moment to complete any async operations
    await waitForBackend(1000);
    
    console.log('STEP 3: Verifying the template event is linked to the series');
    const templateEventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${templateEventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(templateEventResponse.status).toBe(200);
    expect(templateEventResponse.body.seriesSlug).toBe(seriesSlug);
    console.log(`Template event ${templateEventSlug} is confirmed as linked to series ${seriesSlug}`);

    // STEP 4: Clean up - delete the series
    console.log('STEP 4: Cleaning up by deleting the series');
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log('Series deleted successfully with all its events');
  }, 60000); // Specify timeout of 60 seconds
});
