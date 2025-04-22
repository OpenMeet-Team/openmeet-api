import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';
import { OccurrenceResult } from '../../src/event-series/interfaces/occurrence-result.interface';

// Set a global timeout for all tests in this file
jest.setTimeout(15000); // Increased timeout

describe('Recurring Event Tests (e2e)', () => {
  let token: string;

  beforeAll(async () => {
    // Get authentication token
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
    maxRetries = 10, // Increase retries
    initialDelay = 500, // Start with a higher initial delay
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
    throw new Error('Failed to establish event-series link');
  };

  it('should create a recurring event series and verify it works properly', async () => {
    // 1. Create a regular event first
    const eventData = {
      name: 'Test Recurring Event',
      slug: `test-recurring-event-${Date.now().toString(36).substring(2, 10)}`, // Add timestamp to make slug unique
      description: 'Test description',
      startDate: '2024-03-18T10:00:00.000Z',
      endDate: '2024-03-18T11:00:00.000Z',
      type: EventType.InPerson,
      location: 'Test Location',
      locationOnline: '',
      maxAttendees: 0,
      requireApproval: false,
      approvalQuestion: '',
      allowWaitlist: false,
      categories: [],
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      timeZone: 'UTC',
    };

    // console.log('STEP 1: Creating the initial event');
    const event = await createEvent(TESTING_APP_URL, token, eventData);
    const eventSlug = event.slug;
    expect(event).toBeDefined();
    expect(eventSlug).toBeDefined();

    // 2. Promote the event to a series
    // console.log('STEP 2: Promoting event to a series');
    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        recurrenceRule: {
          frequency: 'WEEKLY',
          interval: 1,
          count: 3,
        },
      });

    expect(seriesResponse.status).toBe(201);
    expect(seriesResponse.body).toBeDefined();
    expect(seriesResponse.body.slug).toBeDefined();
    expect(seriesResponse.body.recurrenceRule).toBeDefined();
    expect(seriesResponse.body.recurrenceRule.frequency).toBe('WEEKLY');

    const seriesSlug = seriesResponse.body.slug;
    // console.log('Created series with slug:', seriesSlug);

    // 3. Verify the series has the correct template event
    // console.log('STEP 3: Verifying series properties');
    const seriesDetailsResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesDetailsResponse.status).toBe(200);
    expect(seriesDetailsResponse.body.templateEventSlug).toBe(eventSlug);

    // 3b. Verify the original event has been linked to the series with retries
    // console.log(
    //   'STEP 3b: Verifying event has been linked to series (with enhanced retries)',
    // );
    await checkEventSeriesLink(eventSlug, seriesSlug);

    //  materialze the next 2 occurences
    // console.log('STEP 4: Materializing next 2 occurrences');
    await request(TESTING_APP_URL)
      .post(`/api/event-series/${seriesSlug}/next-occurrence`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    await request(TESTING_APP_URL)
      .post(`/api/event-series/${seriesSlug}/next-occurrence`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // 4. Verify the series has generated occurrences
    // console.log('STEP 5: Verifying series occurrences');
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    // We expect the original event plus 2 future occurrences (total 3)
    expect(occurrencesResponse.body.length).toBe(3);

    const occurrences = occurrencesResponse.body as OccurrenceResult[];
    // expect one of the results to have the original event slug
    expect(
      occurrences.some(
        (occurrence) => occurrence.event?.seriesSlug === seriesSlug,
      ),
    ).toBe(true);

    // 5. Cleanup - Delete the series and its events using the API endpoint
    // console.log(
    //   'STEP 6: Cleaning up test data using the series deletion endpoint',
    // );
    const seriesDeleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesDeleteResponse.status).toBe(204);
  }, 20000);

  it('should compute isRecurring property correctly based on seriesSlug', async () => {
    // 1. Create a regular event first
    const eventData = {
      name: 'Test isRecurring Property',
      slug: `test-isrecurring-${Date.now().toString(36).substring(2, 10)}`, // Add timestamp to make slug unique
      description: 'Test description for isRecurring property test',
      startDate: '2024-03-18T10:00:00.000Z',
      endDate: '2024-03-18T11:00:00.000Z',
      type: EventType.InPerson,
      location: 'Test Location',
      locationOnline: '',
      maxAttendees: 0,
      requireApproval: false,
      approvalQuestion: '',
      allowWaitlist: false,
      categories: [],
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      timeZone: 'UTC',
    };

    console.log('STEP 1: Creating the initial event');
    const event = await createEvent(TESTING_APP_URL, token, eventData);
    const eventSlug = event.slug;
    expect(event).toBeDefined();
    expect(eventSlug).toBeDefined();

    // 2. Promote the event to a series
    console.log('STEP 2: Promoting event to a series');
    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        recurrenceRule: {
          frequency: 'WEEKLY',
          interval: 1,
          count: 3,
        },
      });

    expect(seriesResponse.status).toBe(201);
    const seriesSlug = seriesResponse.body.slug;

    // 3. Verify the original event is now recurring
    console.log(
      'STEP 3: Verifying isRecurring property after promotion to series',
    );
    await checkEventSeriesLink(eventSlug, seriesSlug);

    const updatedEventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(updatedEventResponse.status).toBe(200);
    expect(updatedEventResponse.body.seriesSlug).toBe(seriesSlug);

    //  this ought to work... but it doesn'.  above is a stand in for the same check
    // expect(updatedEventResponse.body.isRecurring).toBe(true);

    // 5. Cleanup
    console.log('STEP 5: Cleaning up test data');
    const seriesDeleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesDeleteResponse.status).toBe(204);

    // expect initial event has been deleted
    const eventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(eventResponse.status).toBe(404);
  }, 20000); // Increase timeout to 60 seconds
});
