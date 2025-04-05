import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createEvent, loginAsTester } from '../utils/functions';
import {
  EventType,
  EventVisibility,
  EventStatus,
} from '../../src/core/constants/constant';
import { formatInTimeZone } from 'date-fns-tz';

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
      maxAttendees: 0,
      requireApproval: false,
      approvalQuestion: '',
      allowWaitlist: false,
      categories: [],
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      timeZone: 'America/New_York', // Eastern Time
    };

    console.log('Creating event spanning DST transition');
    const event = await createEvent(TESTING_APP_URL, token, eventData);
    expect(event).toBeDefined();
    const eventSlug = event.slug;

    // Promote event to series with daily recurrence
    console.log('Promoting event to series');
    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/promote/${eventSlug}`)
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

    expect(seriesResponse.status).toBe(201);
    const seriesSlug = seriesResponse.body.slug;

    // Allow time for occurrences to be generated
    console.log('Waiting for series processing to complete...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get occurrences
    console.log('Fetching generated occurrences');
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    expect(occurrencesResponse.body.length).toBeGreaterThanOrEqual(5);

    // Verify occurrences properly handle the DST transition
    // Check each occurrence starts at the same local time (10:00 AM ET)
    const occurrenceDates = occurrencesResponse.body.map(
      (occ) => new Date(occ.date),
    );

    // Log occurrence info for debugging
    console.log('Occurrences generated:');
    occurrenceDates.forEach((date, index) => {
      console.log(`Occurrence ${index + 1}: ${date.toISOString()}`);

      // Format the date to show local time in New York
      const localTime = formatInTimeZone(
        date,
        'America/New_York',
        'yyyy-MM-dd HH:mm:ss zzz',
      );
      console.log(`  Local time (NY): ${localTime}`);
    });

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

      console.log('DST transition check:');
      console.log(
        ` Before (${beforeTransitionDate.toISOString()}): ${beforeTransitionFormatted}`,
      );
      console.log(
        ` During (${transitionDate.toISOString()}): ${transitionFormatted}`,
      );
      console.log(
        ` After (${afterTransitionDate.toISOString()}): ${afterTransitionFormatted}`,
      );

      // All should be the same local time despite DST change
      expect(beforeTransitionFormatted).toBe('10:00');
      expect(transitionFormatted).toBe('10:00');
      expect(afterTransitionFormatted).toBe('10:00');
    } else {
      console.warn('DST transition date (2023-03-12) not found in occurrences');
    }

    // Verify first occurrence local time
    const firstOccLocalTime = formatInTimeZone(
      occurrenceDates[0],
      'America/New_York',
      'HH:mm',
    );
    expect(firstOccLocalTime).toBe('10:00');

    // Verify last occurrence local time
    const lastOccLocalTime = formatInTimeZone(
      occurrenceDates[occurrenceDates.length - 1],
      'America/New_York',
      'HH:mm',
    );
    expect(lastOccLocalTime).toBe('10:00');

    // Test materializing an occurrence across the DST boundary
    if (transitionDateIndex >= 0) {
      const transitionDateStr = '2023-03-12';
      console.log(
        `Materializing occurrence on DST transition date: ${transitionDateStr}`,
      );

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
      console.log(`Materialized event local time: ${materializedLocalTime}`);
      expect(materializedLocalTime).toBe('10:00');
    }

    // Clean up
    console.log('Cleaning up test data');

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
  }, 60000); // 60 second timeout

  it('should handle Fall DST transition correctly', async () => {
    // Create an event that spans the Fall 2023 DST transition (November 5, 2023)
    // Starting before the transition
    const startDate = '2023-11-03T14:00:00.000Z'; // November 3, 2023, 2:00 PM UTC

    const eventData = {
      name: 'Fall DST Transition Test',
      slug: `fall-dst-transition-${Date.now()}`,
      description: 'Test event for Fall DST transition handling',
      startDate,
      endDate: new Date(new Date(startDate).getTime() + 3600000).toISOString(), // 1 hour later
      type: EventType.InPerson,
      location: 'Test Location',
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      timeZone: 'America/New_York', // Eastern Time
    };

    console.log('Creating event spanning Fall DST transition');
    const event = await createEvent(TESTING_APP_URL, token, eventData);
    const eventSlug = event.slug;

    // Promote event to series with daily recurrence
    console.log('Promoting event to series');
    const seriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/promote/${eventSlug}`)
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

    expect(seriesResponse.status).toBe(201);
    const seriesSlug = seriesResponse.body.slug;

    // Allow time for occurrences to be generated
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Get occurrences
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);

    // Verify occurrences properly handle the DST transition
    const occurrenceDates = occurrencesResponse.body.map(
      (occ) => new Date(occ.date),
    );

    // Log occurrence info
    console.log('Fall DST Occurrences:');
    occurrenceDates.forEach((date, index) => {
      const localTime = formatInTimeZone(
        date,
        'America/New_York',
        'yyyy-MM-dd HH:mm:ss zzz',
      );
      console.log(`Occurrence ${index + 1}: ${localTime}`);
    });

    // Check for November 5, 2023 (Fall back transition)
    const transitionDateIndex = occurrenceDates.findIndex((date) =>
      date.toISOString().startsWith('2023-11-05'),
    );

    if (transitionDateIndex >= 0) {
      // Verify times before, during, and after transition
      if (transitionDateIndex > 0) {
        const beforeTime = formatInTimeZone(
          occurrenceDates[transitionDateIndex - 1],
          'America/New_York',
          'HH:mm',
        );
        expect(beforeTime).toBe('10:00');
      }

      const duringTime = formatInTimeZone(
        occurrenceDates[transitionDateIndex],
        'America/New_York',
        'HH:mm',
      );
      expect(duringTime).toBe('10:00');

      if (transitionDateIndex < occurrenceDates.length - 1) {
        const afterTime = formatInTimeZone(
          occurrenceDates[transitionDateIndex + 1],
          'America/New_York',
          'HH:mm',
        );
        expect(afterTime).toBe('10:00');
      }
    }

    // Clean up
    try {
      // Delete the series
      await request(TESTING_APP_URL)
        .delete(`/api/event-series/${seriesSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      // Delete the original event
      await request(TESTING_APP_URL)
        .delete(`/api/events/${eventSlug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }, 60000); // 60 second timeout
});
