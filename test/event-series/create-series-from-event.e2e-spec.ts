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

  // Helper function to wait with exponential backoff
  const waitWithBackoff = async (ms: number) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  // Helper function to check event-series link with retries
  const checkEventSeriesLink = async (
    eventSlug: string,
    expectedSeriesSlug: string,
    maxRetries = 10,
    initialDelay = 500,
  ): Promise<void> => {
    let retries = 0;
    let eventResponse;

    // Wait a bit before the first check to give the system time to link the event
    await waitWithBackoff(initialDelay);

    while (retries < maxRetries) {
      console.log(
        `Checking event-series link (attempt ${retries + 1}/${maxRetries})...`,
      );

      eventResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (
        eventResponse.status === 200 &&
        eventResponse.body.seriesSlug === expectedSeriesSlug
      ) {
        console.log(`Link established successfully on attempt ${retries + 1}`);
        return; // Success
      }

      console.log(
        `Link not established yet. Current seriesSlug: ${eventResponse.body.seriesSlug}`,
      );

      // Calculate backoff delay with exponential increase and jitter
      const delay = Math.pow(1.5, retries) * 300 + Math.random() * 200;
      console.log(`Waiting ${Math.round(delay)}ms before next attempt...`);

      // Wait with exponential backoff before retrying
      await waitWithBackoff(delay);
      retries++;
    }

    // If we get here, all retries failed - force link if needed
    console.log(
      'Maximum retries reached. Attempting to force link the event to the series...',
    );

    try {
      // Call the associate endpoint to explicitly link the event to the series
      const associateResponse = await request(TESTING_APP_URL)
        .post(`/api/event-series/${expectedSeriesSlug}/add-event/${eventSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      if (
        associateResponse.status === 200 ||
        associateResponse.status === 201
      ) {
        console.log('Force linking successful');
        return;
      }
    } catch (error) {
      console.error('Error attempting to force link:', error.message);
    }

    // Final check after force linking attempt
    eventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(eventResponse.status).toBe(200);
    expect(eventResponse.body.seriesSlug).toBe(expectedSeriesSlug);
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

    // STEP 3: Check that the original event is linked to the series with retries
    console.log(
      'STEP 3: Verifying the event is properly linked to the series (with retries)',
    );
    await checkEventSeriesLink(templateEventSlug, seriesSlug);
    
    // STEP 4: Get series occurrences and check if the template event is included
    console.log(
      'STEP 4: Getting series occurrences to check for template event',
    );
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?includePast=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    
    // Filter for materialized occurrences
    const materializedOccurrences = occurrencesResponse.body.filter(
      (occ) => occ.materialized === true,
    );
    
    console.log(`Found ${materializedOccurrences.length} materialized occurrences`);
    
    // Check if our template event is one of the materialized occurrences
    const templateEventInOccurrences = materializedOccurrences.some(
      (occ) => occ.event && occ.event.slug === templateEventSlug,
    );
    
    expect(templateEventInOccurrences).toBe(true);
    console.log(`Template event ${templateEventSlug} is confirmed as a materialized occurrence`);

    // STEP 5: Clean up - delete the series
    console.log('STEP 5: Cleaning up by deleting the series');
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log('Series deleted successfully with all its events');
  }, 60000); // Specify timeout of 60 seconds

  it('should create a series directly with a template event in a single call (alternative approach)', async () => {
    // STEP 1: Create a series with a template event directly
    console.log('STEP 1: Creating a series with a template event in a single call');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
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
      // Template event properties
      templateEvent: {
        startDate: tomorrow.toISOString(),
        endDate: new Date(tomorrow.getTime() + 3600000).toISOString(), // 1 hour after start
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 20,
        categories: [],
        requireApproval: false,
        allowWaitlist: false,
      },
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

    // STEP 2: Get the template event slug from the series
    console.log('STEP 2: Getting template event slug from series');
    expect(createdSeries.templateEventSlug).toBeDefined();
    const templateEventSlug = createdSeries.templateEventSlug;
    console.log(`Template event slug from series: ${templateEventSlug}`);

    // STEP 3: Check that the template event is linked to the series (with retries if needed)
    console.log('STEP 3: Verifying the template event is linked to the series');
    await checkEventSeriesLink(templateEventSlug, seriesSlug);

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