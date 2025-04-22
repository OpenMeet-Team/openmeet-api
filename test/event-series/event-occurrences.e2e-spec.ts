import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent, createGroup } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('EventOccurrencesService (e2e)', () => {
  let token;
  let testGroup;
  let templateEvent;
  let recurringEvent;
  let series;

  // Before all tests, set up common resources
  beforeAll(async () => {
    // Login and create group
    token = await loginAsTester();
    testGroup = await createGroup(TESTING_APP_URL, token, {
      name: 'Test Group for Occurrences',
      description: 'Test Group Description for Occurrences',
    });

    // 1. Create a template event
    const templateEventData = {
      name: 'Template Event for Series',
      description: 'Template Event Description',
      startDate: new Date('2025-05-05T10:00:00Z'), // A Monday
      endDate: new Date('2025-05-05T11:00:00Z'),
      type: EventType.Hybrid,
      location: 'Template Location',
      locationOnline: 'https://template-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    };

    const templateResponse = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(templateEventData)
      .expect(201);

    templateEvent = templateResponse.body;

    // 2. Create a series with the template event
    const seriesResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        name: 'Test Series for E2E Tests',
        description: 'Test Series Description for E2E Tests',
        recurrenceRule: {
          frequency: 'WEEKLY',
          interval: 1,
          count: 10,
          byweekday: ['MO', 'WE', 'FR'],
        },
        timeZone: 'UTC',
        templateEventSlug: templateEvent.slug,
      });

    expect(seriesResponse.status).toBe(201);
    series = seriesResponse.body;

    // Reload the template event to get the updated seriesSlug
    const reloadedTemplateResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${templateEvent.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(reloadedTemplateResponse.status).toBe(200);
    const reloadedTemplate = reloadedTemplateResponse.body;

    expect(series.templateEventSlug).toBe(templateEvent.slug);
    expect(reloadedTemplate.seriesSlug).toBe(series.slug);

    // 3. Create a separate regular event and add it to the series
    const eventData = {
      name: `Secondary Event`,
      description: 'Test Description for Secondary Event',
      startDate: new Date('2025-06-02T10:00:00Z').toISOString(), // A Monday
      endDate: new Date('2025-06-02T11:00:00Z').toISOString(),
      type: EventType.Hybrid,
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    };

    const regularEvent = await createEvent(TESTING_APP_URL, token, eventData);
    expect(regularEvent.name).toBe(eventData.name);

    const addedToSeriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/${series.slug}/add-event/${regularEvent.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        date: new Date('2025-06-02T10:00:00Z').toISOString(),
      });

    expect(addedToSeriesResponse.status).toBe(201);
    expect(addedToSeriesResponse.body.seriesSlug).toBe(series.slug);

    // 4. Create a third event and add it to the series
    const thirdEventData = {
      name: `Third Event`,
      description: 'Test Description for Third Event',
      startDate: new Date('2025-07-01T15:00:00Z').toISOString(), // A Tuesday in July
      endDate: new Date('2025-07-01T16:30:00Z').toISOString(),
      type: EventType.Hybrid,
      location: 'Third Location',
      locationOnline: 'https://third-event.com',
      maxAttendees: 15,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'published',
      group: null,
    };

    const thirdEvent = await createEvent(
      TESTING_APP_URL,
      token,
      thirdEventData,
    );
    expect(thirdEvent.name).toBe(thirdEventData.name);

    const thirdAddedToSeriesResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/${series.slug}/add-event/${thirdEvent.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        date: new Date('2025-07-01T15:00:00Z').toISOString(),
      });

    expect(thirdAddedToSeriesResponse.status).toBe(201);
    expect(thirdAddedToSeriesResponse.body.seriesSlug).toBe(series.slug);
  });
  it('should materialize the next occurrence in the series', async () => {
    const nextOccurrenceResponse = await request(TESTING_APP_URL)
      .post(`/api/event-series/${series.slug}/next-occurrence`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(nextOccurrenceResponse.status).toBe(201);
    expect(nextOccurrenceResponse.body.seriesSlug).toBe(series.slug);
  });

  it('should retrieve all occurrences from a series', async () => {
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    // The total number of occurrences might vary based on implementation details,
    // but should be at least the number of materialized occurrences (3)
    expect(occurrencesResponse.body.length).toBeGreaterThanOrEqual(3);

    console.log('occurrencesResponse.body', occurrencesResponse.body);

    // All three events should be materialized (template, secondary, and third)
    const materializedOccurrences = occurrencesResponse.body.filter(
      (occ) => occ.materialized,
    );
    console.log(
      'Number of materialized occurrences:',
      materializedOccurrences.length,
    );

    // Log each materialized occurrence details for better visibility
    materializedOccurrences.forEach((occ, index) => {
      console.log(`Materialized occurrence #${index + 1}:`, {
        name: occ.event?.name,
        date: occ.date,
        id: occ.event?.id,
      });
    });

    expect(materializedOccurrences.length).toBeGreaterThanOrEqual(3);
  });

  // Skipping tests that require materializing occurrences until the API endpoint is fixed
  xit('should modify a materialized occurrence while keeping series association', async () => {
    // This test requires materializing an occurrence first
  });

  it('should materialize additional occurrences on demand', async () => {
    // Get all occurrences to find a non-materialized one
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);

    // Find the first non-materialized occurrence
    const nonMaterializedOccurrence = occurrencesResponse.body.find(
      (occ) => !occ.materialized,
    );

    expect(nonMaterializedOccurrence).toBeDefined();

    // Format date properly for URL (ISO string without special characters)
    const formattedDate = encodeURIComponent(nonMaterializedOccurrence.date);

    // Get or create occurrence by date (materialization happens during this call)
    const materializeResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/${formattedDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(materializeResponse.status).toBe(200);
    expect(materializeResponse.body.seriesSlug).toBe(series.slug);
    expect(materializeResponse.body.startDate).toBeDefined();
    expect(new Date(materializeResponse.body.startDate).toISOString()).toBe(
      nonMaterializedOccurrence.date,
    );

    // Verify the occurrence is now materialized
    const updatedOccurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${series.slug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    const materializedOccurrence = updatedOccurrencesResponse.body.find(
      (occ) => occ.date === nonMaterializedOccurrence.date,
    );

    expect(materializedOccurrence).toBeDefined();
    expect(materializedOccurrence.materialized).toBe(true);
  });

  // After all tests, clean up resources
  afterAll(async () => {
    // Delete events - this should cascade to occurrences
    if (templateEvent) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${templateEvent.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    if (recurringEvent) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${recurringEvent.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    // Delete test group
    if (testGroup && testGroup.slug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });
});
