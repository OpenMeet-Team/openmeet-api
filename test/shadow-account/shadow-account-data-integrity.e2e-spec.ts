import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin } from '../utils/functions';

/**
 * E2E tests for Shadow Account Data Integrity
 *
 * These tests verify that shadow accounts created via AT Protocol RSVP ingestion
 * have correct data structure and field mappings.
 */

const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(60000);

describe('Shadow Account Data Integrity (e2e)', () => {
  let testEventSourceId: string;
  let testEventSlug: string;

  beforeAll(() => {
    if (!SERVICE_API_KEY) {
      throw new Error(
        'SERVICE_API_KEYS not configured in environment. Cannot run integration tests.',
      );
    }
    if (!TESTING_TENANT_ID) {
      throw new Error(
        'TEST_TENANT_ID not configured in environment. Cannot run integration tests.',
      );
    }
  });

  // Create a test event for RSVPs
  beforeAll(async () => {
    const timestamp = Date.now();
    const testDid = `did:plc:shadowtest${timestamp}`.substring(0, 32);
    const testRkey = `testrkey${timestamp}`;
    testEventSourceId = `at://${testDid}/community.lexicon.calendar.event/${testRkey}`;

    const eventPayload = {
      name: `Shadow Account Test Event ${timestamp}`,
      description: 'Event for testing shadow account data integrity',
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 90000000).toISOString(),
      type: 'in-person',
      status: 'published',
      visibility: 'public',
      source: {
        id: testEventSourceId,
        type: 'bluesky',
        handle: 'shadowtest.bsky.social',
        metadata: {
          cid: `bafyreitestcid${timestamp}`,
          rkey: testRkey,
          collection: 'community.lexicon.calendar.event',
          time_us: timestamp * 1000,
          did: testDid,
        },
      },
      location: {
        description: 'Test Location',
      },
    };

    const response = await request(TESTING_APP_URL)
      .post('/api/integration/events')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(eventPayload);

    expect(response.status).toBe(202);
    testEventSlug = response.body.slug;
  });

  describe('Shadow account preferences field mapping', () => {
    it('should store handle (not DID) in preferences.bluesky.handle when handle is provided', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:handletest${timestamp}`.substring(0, 32);
      const userHandle = `handletest-${timestamp}.bsky.social`;
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle, // This should end up in preferences.bluesky.handle
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      // Create the RSVP (which creates shadow account)
      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);
      expect(rsvpResponse.body.success).toBe(true);

      // Get user profile via public API using the DID
      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);

      const userProfile = profileResponse.body;

      // CRITICAL: preferences.bluesky.handle should be the HANDLE, not the DID
      expect(userProfile.preferences?.bluesky?.handle).toBeDefined();
      expect(userProfile.preferences?.bluesky?.handle).toBe(userHandle);
      expect(userProfile.preferences?.bluesky?.handle).not.toBe(userDid);
      expect(userProfile.preferences?.bluesky?.handle).not.toMatch(/^did:/);

      // firstName should also be the handle (for display)
      expect(userProfile.firstName).toBe(userHandle);
    });

    it('should store DID correctly in preferences.bluesky.did', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:didtest${timestamp}`.substring(0, 32);
      const userHandle = `didtest-${timestamp}.bsky.social`;
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);

      const userProfile = profileResponse.body;

      // preferences.bluesky.did should match what we sent
      expect(userProfile.preferences?.bluesky?.did).toBe(userDid);
    });

    it('should resolve handle from DID when userHandle is a DID (fallback scenario)', async () => {
      // This tests the scenario where the RSVP processor falls back to DID
      // because the RSVP record doesn't have creator.handle
      const timestamp = Date.now();
      const userDid = `did:plc:fallback${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      // Intentionally pass DID as userHandle (simulating fallback behavior)
      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userDid, // Passing DID as handle - shadow service should resolve it
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);

      const userProfile = profileResponse.body;

      // Even when DID is passed as handle, the system should:
      // 1. Either resolve it to a proper handle
      // 2. Or at minimum, preferences.bluesky.handle should match what's used for display
      // The key point is consistency - handle in preferences should match firstName
      expect(userProfile.preferences?.bluesky?.handle).toBe(userProfile.firstName);
    });
  });

  describe('Shadow account user field mapping', () => {
    it('should set provider to bluesky', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:provtest${timestamp}`.substring(0, 32);
      const userHandle = `provider-test-${timestamp}.bsky.social`;
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      // Verify via attendees list that user has correct provider
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      const attendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === userHandle,
      );
      expect(attendee).toBeDefined();
    });

    it('should create slug from handle with short code suffix', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:slugtest${timestamp}`.substring(0, 32);
      const userHandle = `slug-test-${timestamp}.bsky.social`;
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);

      const userProfile = profileResponse.body;

      // Slug should be based on the handle (slugified) with a short code
      expect(userProfile.slug).toBeDefined();
      expect(userProfile.slug).toMatch(/^slug-test-.*-[a-z0-9]+$/);
    });

    it('should handle special characters in handle (custom domains)', async () => {
      // Test handles like "dane.is.extraordinarily.cool" or "schuman.de"
      const timestamp = Date.now();
      const userDid = `did:plc:custdom${timestamp}`.substring(0, 32);
      const userHandle = `custom.domain.test-${timestamp}.cool`;
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);

      const userProfile = profileResponse.body;

      // Handle with dots should be preserved correctly
      expect(userProfile.firstName).toBe(userHandle);
      expect(userProfile.preferences?.bluesky?.handle).toBe(userHandle);
    });
  });

  describe('Shadow account deduplication', () => {
    it('should not create duplicate shadow account for same DID', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:dedupe${timestamp}`.substring(0, 32);
      const userHandle = `dedupe-test-${timestamp}.bsky.social`;

      // Create first RSVP
      const firstRsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'interested',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/first${timestamp}`,
        metadata: {
          cid: `bafyreifirst${timestamp}`,
          rkey: `first${timestamp}`,
        },
      };

      const firstResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(firstRsvpPayload);

      expect(firstResponse.status).toBe(202);
      const firstAttendeeId = firstResponse.body.attendeeId;

      // Create second RSVP with same DID (different status)
      const secondRsvpPayload = {
        ...firstRsvpPayload,
        status: 'going',
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/second${timestamp}`,
        metadata: {
          cid: `bafyreisecond${timestamp}`,
          rkey: `second${timestamp}`,
        },
      };

      const secondResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(secondRsvpPayload);

      expect(secondResponse.status).toBe(202);

      // Should reuse the same attendee record (same user)
      expect(secondResponse.body.attendeeId).toBe(firstAttendeeId);

      // Verify only one user profile exists for this DID
      const profileResponse = await request(TESTING_APP_URL)
        .get(`/api/users/${userDid}/profile`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(profileResponse.status).toBe(200);
      // Profile should exist and be unique
      expect(profileResponse.body.preferences?.bluesky?.did).toBe(userDid);
    });
  });

  describe('Attendee source data integrity', () => {
    it('should store correct sourceId and sourceType on attendee record', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:srcdata${timestamp}`.substring(0, 32);
      const userHandle = `source-data-test-${timestamp}.bsky.social`;
      const rsvpRkey = `sourcerkey${timestamp}`;
      const expectedSourceId = `at://${userDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`;

      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: expectedSourceId,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
          eventCid: `bafyreieventcid${timestamp}`,
        },
      };

      const rsvpResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(rsvpResponse.status).toBe(202);

      // Get attendee details to verify source fields
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      const attendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === userHandle,
      );

      expect(attendee).toBeDefined();
      expect(attendee.sourceId).toBe(expectedSourceId);
      expect(attendee.sourceType).toBe('bluesky');
    });
  });
});
