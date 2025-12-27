import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createEvent,
  loginAsTester,
  loginAsAdmin,
} from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000); // 1 minute for materialization and RSVPs

describe('Delete Series With Events (e2e)', () => {
  let testerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Get tokens for both seeded test users
    testerToken = await loginAsTester();
    adminToken = await loginAsAdmin();
  });

  it('should delete all materialized events and their attendees when deleting a series with deleteEvents=true', async () => {
    // STEP 1: Create a template event (as tester user)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const templateEventData = {
      name: 'Test Series Event for Deletion',
      description: 'Testing series deletion with events and attendees',
      type: EventType.InPerson,
      location: 'Test Location',
      maxAttendees: 50,
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: tomorrow.toISOString(),
      endDate: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      categories: [],
      timeZone: 'America/New_York',
    };

    const templateEvent = await createEvent(
      TESTING_APP_URL,
      testerToken,
      templateEventData,
    );
    const templateEventSlug = templateEvent.slug;
    console.log(`Created template event: ${templateEventSlug}`);

    // STEP 2: Create a series from the event
    const createSeriesData = {
      recurrenceRule: {
        frequency: 'WEEKLY',
        interval: 1,
        count: 4, // Create 4 occurrences total
      },
    };

    const createSeriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${templateEventSlug}`)
      .set('Authorization', `Bearer ${testerToken}`)
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

    // STEP 3: Materialize additional occurrences (2 more beyond the template)
    console.log('Materializing additional occurrences...');
    for (let i = 0; i < 2; i++) {
      const materializeResponse = await request(TESTING_APP_URL)
        .post(`/api/event-series/${seriesSlug}/next-occurrence`)
        .set('Authorization', `Bearer ${testerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      if (materializeResponse.status !== 201) {
        console.log(
          `Failed to materialize occurrence ${i + 1}:`,
          materializeResponse.status,
          materializeResponse.body,
        );
      }
      expect(materializeResponse.status).toBe(201);
      console.log(
        `  Materialized occurrence ${i + 1}: ${materializeResponse.body.slug}`,
      );
    }

    // STEP 4: Get all materialized event slugs
    const eventsResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?includePast=true`)
      .set('Authorization', `Bearer ${testerToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(eventsResponse.status).toBe(200);
    const materializedEvents = eventsResponse.body
      .filter((occ: any) => occ.event?.slug)
      .map((occ: any) => ({
        slug: occ.event.slug,
        date: occ.date,
      }));
    console.log(
      `Materialized events (${materializedEvents.length}):`,
      materializedEvents.map((e: { slug: string }) => e.slug),
    );

    // Verify we have at least 3 materialized events
    expect(materializedEvents.length).toBeGreaterThanOrEqual(3);

    // STEP 5: Have the admin user RSVP to all materialized events
    // (Using seeded users avoids email verification requirement)
    console.log('Adding admin user as attendee to all events...');
    for (const event of materializedEvents) {
      const attendResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${event.slug}/attend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      if (attendResponse.status !== 201) {
        console.log(
          `  Warning: RSVP failed for admin to ${event.slug}:`,
          attendResponse.status,
        );
      } else {
        console.log(`  Admin RSVPed to ${event.slug}`);
      }
    }

    // STEP 6: Verify attendees were added to each event
    console.log('Verifying attendees were added...');
    for (const event of materializedEvents) {
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${event.slug}/attendees`)
        .set('Authorization', `Bearer ${testerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const attendeeCount = attendeesResponse.body.data?.length || 0;
      console.log(`  Event ${event.slug} has ${attendeeCount} attendees`);
      // Each event should have at least 1 attendee (the admin user)
      expect(attendeeCount).toBeGreaterThan(0);
    }

    // STEP 7: Delete the series with deleteEvents=true
    console.log(`Deleting series with deleteEvents=true...`);
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}?deleteEvents=true`)
      .set('Authorization', `Bearer ${testerToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
    console.log(`Series deleted successfully`);

    // STEP 8: Verify the series is deleted
    const seriesCheckResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${testerToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(seriesCheckResponse.status).toBe(404);
    console.log(`Series no longer exists`);

    // STEP 9: Verify ALL materialized events are deleted
    console.log('Verifying all events are deleted...');
    for (const event of materializedEvents) {
      const eventCheckResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${testerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(
        `  Event ${event.slug}: status ${eventCheckResponse.status}`,
      );
      expect(eventCheckResponse.status).toBe(404);
    }

    console.log(`All ${materializedEvents.length} events deleted`);
    console.log(
      `Test complete: Series with ${materializedEvents.length} materialized events and attendees was successfully deleted`,
    );
  });
});
