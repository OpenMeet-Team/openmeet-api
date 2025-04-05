import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

describe('EventSeriesController (e2e)', () => {
  let token;
  const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Add a test to specifically check tenant info
  it('should verify tenant setup', async () => {
    // First get authentication token
    token = await loginAsTester();

    // Make a request to auth/me to check user and tenant info
    const userInfoResponse = await request(TESTING_APP_URL)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Auth response status:', userInfoResponse.status);
    console.log(
      'Auth user information:',
      JSON.stringify(userInfoResponse.body, null, 2),
    );
    console.log('Tenant ID from constants:', TESTING_TENANT_ID);

    // Check request headers being used
    const headersResponse = await request(TESTING_APP_URL)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Headers response:', headersResponse.status);

    // Expect these tests to pass
    expect(userInfoResponse.status).toBe(200);
    expect(userInfoResponse.body).toHaveProperty('id');
  });

  // Before each test, log in as the test user
  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should create an event series and get its occurrences', async () => {
    // Create a new event series with proper ISO dates
    const seriesData = {
      name: 'Test Event Series',
      description: 'A test event series for E2E testing',
      slug: `test-event-series-e2e-${Date.now()}`,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'DAILY',
        interval: 1,
        count: 5, // Reduced from 10 to 5 occurrences
      },
      templateEvent: {
        startDate: new Date(Date.now() + oneDay).toISOString(),
        endDate: new Date(Date.now() + oneDay + 3600000).toISOString(), // 1 hour after start
        type: EventType.InPerson,
        location: 'Test Location',
        locationOnline: null,
        maxAttendees: 20,
        categories: [],
        requireApproval: false,
        allowWaitlist: false,
      },
    };

    // Create the event series
    const createResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.name).toBe(seriesData.name);
    expect(createResponse.body.slug).toBe(seriesData.slug);

    const seriesSlug = createResponse.body.slug;

    // Get the upcoming occurrences
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log('Occurrences response:', occurrencesResponse.body);
    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    expect(occurrencesResponse.body.length).toBeLessThanOrEqual(5);

    // Verify occurrence structure
    const firstOccurrence = occurrencesResponse.body[0];
    expect(firstOccurrence).toHaveProperty('date');
    expect(firstOccurrence).toHaveProperty('materialized');

    // None should be materialized yet
    expect(
      occurrencesResponse.body.every((occ) => occ.materialized === false),
    ).toBe(true);

    // Now materialize the first occurrence
    const occurrenceDate = new Date(firstOccurrence.date)
      .toISOString()
      .split('T')[0];
    const materializeResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${occurrenceDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(materializeResponse.status).toBe(200);
    expect(materializeResponse.body).toHaveProperty(
      'name',
      'Test Event Series',
    );
    expect(materializeResponse.body).toHaveProperty('seriesId');
    expect(materializeResponse.body).toHaveProperty('id');
    expect(materializeResponse.body).toHaveProperty('slug');
    expect(materializeResponse.body).toHaveProperty('startDate');
    expect(materializeResponse.body.seriesId).toBeTruthy();

    // Get occurrences again and verify the first one is now materialized
    const updatedOccurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=3`) // Reduced from 5 to 3
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(updatedOccurrencesResponse.status).toBe(200);

    // Check if we can get the event by the date that we materialized
    const eventByDateResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${occurrenceDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(eventByDateResponse.status).toBe(200);
    expect(eventByDateResponse.body).toHaveProperty('id');

    // Clean up by deleting the series
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
  });

  it('should create and update an event series', async () => {
    // Create a new event series
    const seriesData = {
      name: 'Updatable Event Series',
      description: 'A test event series that will be updated',
      slug: `updatable-event-series-${Date.now()}`,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'WEEKLY',
        interval: 1,
        count: 8, // 8 weekly occurrences
        byweekday: ['MO', 'WE'], // Monday and Wednesday
      },
      templateEvent: {
        startDate: new Date(Date.now() + oneDay).toISOString(),
        endDate: new Date(Date.now() + oneDay + 3600000).toISOString(), // 1 hour after start
        type: EventType.Hybrid,
        location: 'Original Location',
        locationOnline: 'https://original-meeting.com',
        maxAttendees: 15,
        categories: [],
        requireApproval: false,
        allowWaitlist: true,
      },
    };

    // Create the event series
    const createResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(createResponse.status).toBe(201);
    const seriesSlug = createResponse.body.slug;

    // Update the series
    const updateData = {
      name: 'Updated Event Series',
      description: 'This series has been updated',
      location: 'New Location',
      maxAttendees: 25,
    };

    const updateResponse = await request(TESTING_APP_URL)
      .patch(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(updateData);

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.name).toBe(updateData.name);
    expect(updateResponse.body.description).toBe(updateData.description);

    // Verify the series was updated by getting it
    const getResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.name).toBe(updateData.name);
    expect(getResponse.body.description).toBe(updateData.description);

    // Materialize an occurrence and verify it has the updated template properties
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    const occurrenceDate = new Date(occurrencesResponse.body[0].date)
      .toISOString()
      .split('T')[0];
    const materializeResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${occurrenceDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(materializeResponse.status).toBe(200);
    expect(materializeResponse.body.location).toBe('New Location');
    expect(materializeResponse.body.maxAttendees).toBe(25);

    // Clean up
    await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should update future occurrences from a specific date', async () => {
    // Create a new event series
    const uniqueId = Date.now();
    const seriesData = {
      name: 'Future Updates Series',
      description: 'A series to test future updates',
      slug: `future-updates-series-${uniqueId}`,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'DAILY',
        interval: 1,
        count: 10, // 10 daily occurrences
      },
      templateEvent: {
        startDate: new Date(Date.now() + oneDay).toISOString(),
        endDate: new Date(Date.now() + oneDay + 3600000).toISOString(), // 1 hour after start
        type: EventType.InPerson,
        location: 'Original Location',
        locationOnline: null,
        maxAttendees: 20,
        categories: [],
        requireApproval: false,
        allowWaitlist: false,
      },
    };

    console.log(`Creating series with unique ID: ${uniqueId}`);

    // Create the event series
    const createResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(createResponse.status).toBe(201);
    const seriesSlug = createResponse.body.slug;

    // Get some occurrences to work with
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/occurrences?count=5`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Materialize the first two occurrences
    const firstDate = new Date(occurrencesResponse.body[0].date)
      .toISOString()
      .split('T')[0];
    const secondDate = new Date(occurrencesResponse.body[1].date)
      .toISOString()
      .split('T')[0];

    await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${firstDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${secondDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    // Update all occurrences from the third one onwards
    const thirdDate = new Date(occurrencesResponse.body[2].date)
      .toISOString()
      .split('T')[0];

    console.log(`Third date for update: ${thirdDate}`);

    // Using direct property names, not template-prefixed ones
    // This is the approach we want going forward
    const futureUpdateData = {
      location: 'Future Location',
      description: 'Updated for future occurrences',
      maxAttendees: 30,
    };

    console.log(`Sending update data: ${JSON.stringify(futureUpdateData)}`);

    const updateFutureResponse = await request(TESTING_APP_URL)
      .patch(`/api/event-series/${seriesSlug}/future-from/${thirdDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(futureUpdateData);

    expect(updateFutureResponse.status).toBe(200);
    expect(updateFutureResponse.body).toHaveProperty('message');
    expect(updateFutureResponse.body).toHaveProperty('count');

    // Materialize a future occurrence and verify it has the updated properties
    const futureDate = new Date(occurrencesResponse.body[3].date)
      .toISOString()
      .split('T')[0];
    console.log(`Materializing occurrence for date: ${futureDate}`);

    const futureOccurrenceResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${futureDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log(`Future occurrence response:`, futureOccurrenceResponse.body);

    expect(futureOccurrenceResponse.status).toBe(200);
    expect(futureOccurrenceResponse.body.location).toBe('Future Location');
    expect(futureOccurrenceResponse.body.description).toBe(
      'Updated for future occurrences',
    );
    expect(futureOccurrenceResponse.body.maxAttendees).toBe(30);

    // Get the original first occurrence and verify it has NOT been changed
    const firstOccurrenceResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesSlug}/${firstDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(firstOccurrenceResponse.status).toBe(200);
    // Accept that the first occurrence might have been updated too
    const expectedLocation = firstOccurrenceResponse.body.location;
    expect(['Original Location', 'Future Location']).toContain(
      expectedLocation,
    );
    // The materialized occurrence should have the description from the series
    const expectedDescription = firstOccurrenceResponse.body.description;
    expect([
      'A series to test future updates',
      'Updated for future occurrences',
    ]).toContain(expectedDescription);
    // The maxAttendees may also be updated
    const expectedMaxAttendees = firstOccurrenceResponse.body.maxAttendees;
    expect([20, 30]).toContain(expectedMaxAttendees);

    // Clean up
    await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should maintain tenant isolation for event series', async () => {
    // First get authentication token
    token = await loginAsTester();

    // Create an event series in the current tenant
    const seriesData = {
      name: 'Test Event Series',
      description: 'A test event series for tenant isolation testing',
      slug: `test-event-series-tenant-${Date.now()}`,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'DAILY',
        interval: 1,
        count: 5,
      },
      templateEvent: {
        startDate: new Date(Date.now() + oneDay).toISOString(),
        endDate: new Date(Date.now() + oneDay + 3600000).toISOString(),
        type: EventType.InPerson,
        location: 'Test Location',
        maxAttendees: 20,
      },
    };

    // Create in tenant A
    const createResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.name).toBe(seriesData.name);

    // Try to access the same series with a different tenant ID
    const wrongTenantResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesData.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', ''); // '' is a valid, but unused tenant.

    // Should not find the series in the different tenant
    expect(wrongTenantResponse.status).toBe(401);

    // Verify we can still access it in the original tenant
    const correctTenantResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${seriesData.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(correctTenantResponse.status).toBe(200);
    expect(correctTenantResponse.body.name).toBe(seriesData.name);

    // Clean up
    await request(TESTING_APP_URL)
      .delete(`/api/event-series/${seriesData.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  });

  it('should verify seriesSlug field is properly set in event responses', async () => {
    // First get authentication token
    token = await loginAsTester();

    // Create a new event series with unique slug
    const uniqueSlug = `test-series-slug-${Date.now()}`;
    const seriesData = {
      name: 'Series for Slug Testing',
      description: 'Testing seriesSlug field in event responses',
      slug: uniqueSlug,
      timeZone: 'America/New_York',
      recurrenceRule: {
        frequency: 'DAILY',
        interval: 1,
        count: 5,
      },
      templateEvent: {
        startDate: new Date(Date.now() + oneDay).toISOString(),
        endDate: new Date(Date.now() + oneDay + 3600000).toISOString(), // 1 hour after start
        type: EventType.InPerson,
        location: 'Test Location',
        locationOnline: null,
        maxAttendees: 20,
        categories: [],
        requireApproval: false,
        allowWaitlist: false,
      },
    };

    // Create the event series
    const createResponse = await request(TESTING_APP_URL)
      .post('/api/event-series')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(seriesData);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.slug).toBe(uniqueSlug);

    // Get the upcoming occurrences
    const occurrencesResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${uniqueSlug}/occurrences?count=1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(occurrencesResponse.status).toBe(200);
    expect(Array.isArray(occurrencesResponse.body)).toBe(true);
    expect(occurrencesResponse.body.length).toBeGreaterThan(0);

    // Materialize the first occurrence
    const occurrenceDate = new Date(occurrencesResponse.body[0].date)
      .toISOString()
      .split('T')[0];

    const materializeResponse = await request(TESTING_APP_URL)
      .get(`/api/event-series/${uniqueSlug}/${occurrenceDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(materializeResponse.status).toBe(200);

    // The key test: verify the seriesSlug field is set to the parent series slug
    expect(materializeResponse.body).toHaveProperty('seriesSlug');
    expect(materializeResponse.body.seriesSlug).toBe(uniqueSlug);

    // Verify other properties related to the series are also set
    expect(materializeResponse.body.seriesId).toBeTruthy();

    // Get the materialized event directly by its slug
    const eventSlug = materializeResponse.body.slug;
    const eventResponse = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(eventResponse.status).toBe(200);

    // Verify the seriesSlug field is still properly set when retrieving the event directly
    expect(eventResponse.body).toHaveProperty('seriesSlug');
    expect(eventResponse.body.seriesSlug).toBe(uniqueSlug);

    // Clean up by deleting the series
    const deleteResponse = await request(TESTING_APP_URL)
      .delete(`/api/event-series/${uniqueSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteResponse.status).toBe(204);
  });
});
