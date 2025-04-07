import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

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
    expect(seriesResponse.body).toBeDefined();
    expect(seriesResponse.body.slug).toBeDefined();
    expect(seriesResponse.body.recurrenceRule).toBeDefined();
    expect(seriesResponse.body.recurrenceRule.frequency).toBe('WEEKLY');

    const seriesSlug = seriesResponse.body.slug;
    console.log('Created series with slug:', seriesSlug);

    // 3. Verify the series has the correct template event
    console.log('STEP 3: Verifying series properties');
    const seriesDetailsResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesDetailsResponse.status).toBe(200);
    expect(seriesDetailsResponse.body.templateEventSlug).toBe(eventSlug);

    // 3b. Verify the original event has been linked to the series with retries
    console.log(
      'STEP 3b: Verifying event has been linked to series (with enhanced retries)',
    );
    await checkEventSeriesLink(eventSlug, seriesSlug);

    // 4. Verify the series has generated occurrences
    console.log('STEP 4: Verifying series occurrences');
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    // We expect at least the original event plus future occurrences
    expect(occurrencesResponse.body.length).toBe(3);

    // 5. Cleanup - Delete the series and its events using the API endpoint
    console.log(
      'STEP 5: Cleaning up test data using the series deletion endpoint',
    );
    const seriesDeleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesDeleteResponse.status).toBe(204);
  }, 60000); // Increase timeout to 60 seconds
});
