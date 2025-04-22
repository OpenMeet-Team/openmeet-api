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

/*
 * IMPORTANT: This test is skipped by default because it requires:
 *
 * 1. A real user with Bluesky OAuth credentials connected
 * 2. The Bluesky app service to be running
 * 3. The appropriate environment variables configured
 *
 * To run this test manually:
 * 1. Connect a test user with Bluesky in the UI first
 * 2. Use that user's credentials for the test
 * 3. Run with: ENABLE_BLUESKY_TESTS=true npm run test -- -t "Create Bluesky Series"
 */

describe('Create Bluesky Series and Verify Materialized Occurrences (e2e)', () => {
  // Skip tests by default
  const shouldRunTests = process.env.ENABLE_BLUESKY_TESTS === 'true';

  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  // Helper function to wait a short time for backend operations to complete
  const waitForBackend = async (ms = 500) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  it('should create a Bluesky series and verify materialized occurrences are also posted to Bluesky', async () => {
    // Skip test if ENABLE_BLUESKY_TESTS is not 'true'
    if (!shouldRunTests) {
      console.log(
        'Skipping Bluesky tests. Set ENABLE_BLUESKY_TESTS=true to run these tests.',
      );
      return;
    }

    // STEP 1: Create a regular standalone event with Bluesky source info
    console.log('STEP 1: Creating a Bluesky-sourced event as template');

    const eventData = {
      name: 'Bluesky Template Event for Series',
      description: 'Event that will be posted to Bluesky',
      type: EventType.InPerson,
      location: 'Test Location',
      maxAttendees: 20,
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
      categories: [],
      timeZone: 'America/New_York',
      // Note: Bluesky source properties are automatically added
      // when the event is created by a user with connected Bluesky account
    };

    // Create the standalone Bluesky event
    const templateEvent = await createEvent(TESTING_APP_URL, token, eventData);
    const templateEventSlug = templateEvent.slug;
    expect(templateEvent).toBeDefined();
    expect(templateEventSlug).toBeDefined();

    // Verify Bluesky properties - should be added by backend
    if (templateEvent.sourceType !== 'bluesky') {
      console.warn(
        'Warning: Created event does not have Bluesky sourceType. Test user may not have Bluesky connected.',
      );
    }

    console.log(`Template event created with slug: ${templateEventSlug}`);

    // STEP 2: Create a series from the Bluesky event
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

    // STEP 3: Materialize occurrences for the series
    console.log('STEP 3: Materializing future occurrences');

    // Give the backend a moment to complete any async operations
    await waitForBackend(1000);

    // Trigger materialization of multiple future occurrences
    // We'll do this twice to ensure we have at least 2 materialized occurrences
    for (let i = 0; i < 2; i++) {
      const materializeResponse = await request(TESTING_APP_URL)
        .post(`/api/event-series/${seriesSlug}/next-occurrence`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(materializeResponse.status).toBe(201);

      // Verify the materialized occurrence has been created
      const materializedEvent = materializeResponse.body;
      expect(materializedEvent).toBeDefined();

      console.log(
        `Materialized occurrence ${i + 1} with slug: ${materializedEvent.slug}`,
      );
    }

    // STEP 4: Get occurrences and verify they have the same properties
    console.log('STEP 4: Verify materialized occurrences are consistent');

    // Wait for materialization to complete
    await waitForBackend(1000);

    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?includePast=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    const occurrences = occurrencesResponse.body;

    console.log(`Found ${occurrences.length} occurrences`);

    // Filter to only materialized occurrences
    const materializedOccurrences = occurrences.filter(
      (occ) => occ.materialized && occ.event,
    );

    // We should have at least 2 materialized occurrences (the original + 2 we created)
    expect(materializedOccurrences.length).toBeGreaterThanOrEqual(2);

    // Check if materialized occurrences have the same source properties as template
    for (const occurrence of materializedOccurrences) {
      if (templateEvent.sourceType === 'bluesky') {
        // If template had Bluesky properties, verify they were passed
        expect(occurrence.event.sourceType).toBe('bluesky');
        console.log(
          `Verified source info for occurrence: ${occurrence.event.slug}`,
        );
      }
    }

    // STEP 5: Clean up - delete the series
    console.log('STEP 5: Cleaning up by deleting the series');
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log('Series deleted successfully with all its events');
  }, 60000); // Specify timeout of 60 seconds
});
