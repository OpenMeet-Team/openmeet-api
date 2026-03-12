import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  deleteEvent,
} from '../utils/functions';
import { EventType, EventStatus } from '../../src/core/constants/constant';

describe('GET /api/me/events', () => {
  let token: string;
  const createdEventIds: number[] = [];

  beforeAll(async () => {
    token = await loginAsTester();
  });

  afterAll(async () => {
    // Clean up created events
    for (const id of createdEventIds) {
      try {
        await deleteEvent(TESTING_APP_URL, token, id);
      } catch {
        // ignore cleanup failures
      }
    }
  });

  it('should return 401 without auth', async () => {
    const response = await request(TESTING_APP_URL)
      .get('/api/me/events')
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(401);
  });

  it('should return events user is organizing', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    const event = await createEvent(TESTING_APP_URL, token, {
      name: `Me Events Test Organizing ${Date.now()}`,
      description: 'Test event for me/events organizing test',
      type: EventType.InPerson,
      startDate: futureDate.toISOString(),
      location: 'Test Location',
      status: EventStatus.Published,
    });
    createdEventIds.push(event.id);

    const response = await request(TESTING_APP_URL)
      .get('/api/me/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const found = response.body.find((e: any) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.isOrganizer).toBe(true);
  });

  it('should return events user is attending', async () => {
    // Create event as admin, then RSVP as tester
    const adminToken = await loginAsAdmin();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const event = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Me Events Test Attending ${Date.now()}`,
      description: 'Test event for me/events attending test',
      type: EventType.InPerson,
      startDate: futureDate.toISOString(),
      location: 'Test Location',
      status: EventStatus.Published,
    });

    // RSVP as tester
    const rsvpResponse = await request(TESTING_APP_URL)
      .post(`/api/events/${event.slug}/attend`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(rsvpResponse.status).toBeLessThan(300);

    const response = await request(TESTING_APP_URL)
      .get('/api/me/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);

    const found = response.body.find((e: any) => e.id === event.id);
    expect(found).toBeDefined();
    expect(found.isOrganizer).toBe(false);
    expect(found.attendeeStatus).toBeDefined();

    // Clean up (admin owns the event)
    await deleteEvent(TESTING_APP_URL, adminToken, event.id);
  });

  it('should filter by date range', async () => {
    const now = new Date();

    // Create event in the near future (within 5 days)
    const nearDate = new Date(now);
    nearDate.setDate(nearDate.getDate() + 3);

    const nearEvent = await createEvent(TESTING_APP_URL, token, {
      name: `Me Events Near ${Date.now()}`,
      description: 'Near future event',
      type: EventType.Online,
      startDate: nearDate.toISOString(),
      locationOnline: 'https://example.com',
      status: EventStatus.Published,
    });
    createdEventIds.push(nearEvent.id);

    // Create event far in the future (90 days)
    const farDate = new Date(now);
    farDate.setDate(farDate.getDate() + 90);

    const farEvent = await createEvent(TESTING_APP_URL, token, {
      name: `Me Events Far ${Date.now()}`,
      description: 'Far future event',
      type: EventType.Online,
      startDate: farDate.toISOString(),
      locationOnline: 'https://example.com',
      status: EventStatus.Published,
    });
    createdEventIds.push(farEvent.id);

    // Query only the near range (today to +10 days)
    const startDate = now.toISOString().split('T')[0];
    const endDateObj = new Date(now);
    endDateObj.setDate(endDateObj.getDate() + 10);
    const endDate = endDateObj.toISOString().split('T')[0];

    const response = await request(TESTING_APP_URL)
      .get(`/api/me/events?startDate=${startDate}&endDate=${endDate}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);

    const nearFound = response.body.find((e: any) => e.id === nearEvent.id);
    const farFound = response.body.find((e: any) => e.id === farEvent.id);

    expect(nearFound).toBeDefined();
    expect(farFound).toBeUndefined();
  });

  it('should default to today + 30 days when no params provided', async () => {
    const response = await request(TESTING_APP_URL)
      .get('/api/me/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    // All returned events should have startDate within roughly today to +30 days
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

    for (const event of response.body) {
      const eventStart = new Date(event.startDate);
      expect(eventStart.getTime()).toBeGreaterThanOrEqual(
        now.getTime() - 24 * 60 * 60 * 1000, // 1 day tolerance
      );
      expect(eventStart.getTime()).toBeLessThanOrEqual(
        thirtyDaysLater.getTime(),
      );
    }
  });

  it('should return events sorted by startDate ascending', async () => {
    const response = await request(TESTING_APP_URL)
      .get('/api/me/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);

    if (response.body.length > 1) {
      for (let i = 1; i < response.body.length; i++) {
        const prev = new Date(response.body[i - 1].startDate).getTime();
        const curr = new Date(response.body[i].startDate).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });
});
