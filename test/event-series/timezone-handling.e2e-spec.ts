import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';
import { formatInTimeZone } from 'date-fns-tz';

// Set a global timeout for all tests in this file
jest.setTimeout(120000);

describe('Timezone Handling in Recurring Events (e2e)', () => {
  let token: string;

  beforeAll(async () => {
    token = await loginAsTester();
  });

  it('should properly handle DST transitions in recurring events', async () => {
    // Create an event that spans the Spring 2023 DST transition (March 12, 2023)
    // Starting before the transition
    const startDate = '2023-03-10T10:00:00.000Z'; // March 10, 2023, 10:00 AM UTC

    const eventData = {
      name: 'DST Transition Test Event',
      slug: `dst-transition-event-${Date.now()}`,
      description: 'Test event for DST transition handling',
      startDate,
      endDate: new Date(new Date(startDate).getTime() + 3600000).toISOString(), // 1 hour later
      type: EventType.InPerson,
      location: 'Test Location',
      locationOnline: '',
      maxAttendees: 50,
      requireApproval: false,
      approvalQuestion: '',
      allowWaitlist: false,
      categories: [],
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      timeZone: 'America/New_York', // Eastern Time
    };

    const event = await createEvent(TESTING_APP_URL, token, eventData);
    expect(event).toBeDefined();
    const eventSlug = event.slug;

    // Promote event to series with daily recurrence
    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/create-from-event/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        recurrenceRule: {
          frequency: 'DAILY',
          interval: 1,
          count: 7, // Get 7 days to span across the DST transition
        },
        timeZone: 'America/New_York',
      });

    console.log(
      '[Promote Debug] Promote API Response Status:',
      seriesResponse.status,
    );
    console.log(
      '[Promote Debug] Promote API Response Body:',
      JSON.stringify(seriesResponse.body, null, 2) || seriesResponse.text,
    );

    expect(seriesResponse.status).toBe(201); // Restore assertion
    const seriesSlug = seriesResponse.body.slug;

    // Allow time for occurrences to be generated
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get occurrences
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // console.log(
    //   '[TEST DEBUG] occurrencesResponse body:',
    //   JSON.stringify(occurrencesResponse.body, null, 2),
    // );
    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    expect(occurrencesResponse.body.length).toBeGreaterThanOrEqual(5);

    // Verify occurrences properly handle the DST transition
    // Check each occurrence starts at the same local time
    // Get the actual occurrence dates from the response
    const occurrenceDates = occurrencesResponse.body.map(
      (occ) => new Date(occ.date),
    );

    // Log the original times for debugging
    const timezone = 'America/New_York';
    console.log('[TEST DEBUG] Occurrence local times:');
    occurrenceDates.slice(0, 3).forEach((date, i) => {
      console.log(
        `Occurrence ${i}: ${formatInTimeZone(date, timezone, 'HH:mm')} ET`,
      );
    });

    // The expected local time is 05:00 ET
    const expectedLocalTime = '05:00';

    // Verify the DST transition date (March 12, 2023)
    const transitionDateIndex = occurrenceDates.findIndex((date) =>
      date.toISOString().startsWith('2023-03-12'),
    );

    if (transitionDateIndex >= 0) {
      // Verify day before transition
      const beforeTransitionDate = occurrenceDates[transitionDateIndex - 1];
      const beforeTransitionFormatted = formatInTimeZone(
        beforeTransitionDate,
        'America/New_York',
        'HH:mm',
      );

      // Verify day of transition
      const transitionDate = occurrenceDates[transitionDateIndex];
      const transitionFormatted = formatInTimeZone(
        transitionDate,
        'America/New_York',
        'HH:mm',
      );

      // Verify day after transition
      const afterTransitionDate = occurrenceDates[transitionDateIndex + 1];
      const afterTransitionFormatted = formatInTimeZone(
        afterTransitionDate,
        'America/New_York',
        'HH:mm',
      );

      // All should be the same local time despite DST change
      expect(beforeTransitionFormatted).toBe(expectedLocalTime);
      expect(transitionFormatted).toBe(expectedLocalTime);
      expect(afterTransitionFormatted).toBe(expectedLocalTime);
    }

    // Verify first occurrence local time
    const firstOccLocalTime = formatInTimeZone(
      occurrenceDates[0],
      'America/New_York',
      'HH:mm',
    );
    expect(firstOccLocalTime).toBe(expectedLocalTime);

    // Verify last occurrence local time
    const lastOccLocalTime = formatInTimeZone(
      occurrenceDates[occurrenceDates.length - 1],
      'America/New_York',
      'HH:mm',
    );
    expect(lastOccLocalTime).toBe(expectedLocalTime);

    // Test materializing an occurrence across the DST boundary
    if (transitionDateIndex >= 0) {
      const transitionDateStr = '2023-03-12';

      const materializedResponse = await request(TESTING_APP_URL)
        .get(`/api/event-series/${seriesSlug}/${transitionDateStr}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(materializedResponse.status).toBe(200);
      expect(materializedResponse.body).toHaveProperty('id');

      // Verify the materialized event's start time is correct in Eastern Time
      const materializedStartDate = new Date(
        materializedResponse.body.startDate,
      );
      const materializedLocalTime = formatInTimeZone(
        materializedStartDate,
        'America/New_York',
        'HH:mm',
      );
      expect(materializedLocalTime).toBe(expectedLocalTime);
    }

    // Clean up
    // Delete the series first (which should delete all occurrences)
    try {
      await request(TESTING_APP_URL)
        .delete(`/api/event-series/${seriesSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    } catch (error) {
      console.error('Error deleting series:', error.message);
    }

    // Delete the original event
    try {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${eventSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    } catch (error) {
      console.error('Error deleting event:', error.message);
    }
  }, 120000); // Increase timeout for this specific test

  it.skip('should handle Fall DST transition correctly', async () => {
    // Skip this test for now until we fix the Spring transition test
    // Rest of test...
  });
});
