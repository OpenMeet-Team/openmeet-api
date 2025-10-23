import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(20000);

describe('Delete Series With Events (e2e)', () => {
  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  it('should delete all events when deleting a series with deleteEvents=true', async () => {
    // STEP 1: Create a template event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const templateEventData = {
      name: 'Test Series Event for Deletion',
      description: 'Testing series deletion with events',
      type: EventType.InPerson,
      location: 'Test Location',
      maxAttendees: 20,
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      categories: [],
      timeZone: 'America/New_York',
    };

    const templateEvent = await createEvent(
      TESTING_APP_URL,
      token,
      templateEventData,
    );
    const templateEventSlug = templateEvent.slug;
    console.log(`Created template event: ${templateEventSlug}`);

    // STEP 2: Create a series from the event
    const createSeriesData = {
      recurrenceRule: {
        frequency: 'WEEKLY',
        interval: 1,
        count: 3, // Create 3 occurrences
      },
    };

    const createSeriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${templateEventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(createSeriesData);

    if (createSeriesResponse.status !== 201) {
      console.log(
        'Series creation failed with status:',
        createSeriesResponse.status,
      );
      console.log('Response body:', createSeriesResponse.body);
    }
    expect(createSeriesResponse.status).toBe(201);
    const seriesSlug = createSeriesResponse.body.slug;
    console.log(`Created series: ${seriesSlug}`);

    // STEP 3: Verify the series was created
    const seriesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesResponse.status).toBe(200);
    console.log(`Series exists: ${seriesSlug}`);

    // STEP 4: Get the event slugs before deletion
    const eventsResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?includePast=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(eventsResponse.status).toBe(200);
    const eventSlugs = eventsResponse.body.map((event: any) => event.slug);
    console.log(`Event slugs before deletion:`, eventSlugs);
    expect(eventSlugs.length).toBeGreaterThan(0);

    // STEP 5: Delete the series with deleteEvents=true
    console.log(`Deleting series with deleteEvents=true`);
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log(`Series deleted successfully`);

    // STEP 6: Verify the series is deleted
    const seriesCheckResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesCheckResponse.status).toBe(404);
    console.log(`Series no longer exists ✓`);

    // STEP 7: Verify all events are deleted (THIS IS THE KEY TEST)
    for (const eventSlug of eventSlugs) {
      const eventCheckResponse = await request(TESTING_APP_URL)
        .get(`/api/event/${eventSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(
        `Checking event ${eventSlug}: status ${eventCheckResponse.status}`,
      );
      expect(eventCheckResponse.status).toBe(404);
    }
    console.log(`All events deleted ✓`);
  });
});
