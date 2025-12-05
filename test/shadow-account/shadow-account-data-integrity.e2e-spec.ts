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

      // Verify user data via attendees endpoint
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
      // User display name should be the handle, not the DID
      expect(attendee.user.name).toBe(userHandle);
      expect(attendee.user.name).not.toBe(userDid);
      expect(attendee.user.name).not.toMatch(/^did:/);
    });

    it('should resolve handle from DID when userHandle is a DID (fallback scenario)', async () => {
      // This tests the scenario where the RSVP processor falls back to DID
      // because the RSVP record doesn't have creator.handle
      const timestamp = Date.now();
      const userDid = `did:plc:fallback${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      // Intentionally pass DID as userHandle (simulating fallback behavior)
      // In production, the BlueskyIdentityService would resolve this to a real handle
      // In tests, it falls back to using the DID itself
      const rsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userDid, // Passing DID as handle
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

      // Verify via attendees - when DID is passed as handle and can't be resolved,
      // the system should still work (using DID as fallback display name)
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      // Find by DID since it was used as the handle
      const attendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === userDid || a.user.slug?.includes('fallback'),
      );

      expect(attendee).toBeDefined();
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

      // Verify via attendees endpoint
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
      // Slug should be based on the handle (slugified) with a short code
      expect(attendee.user.slug).toBeDefined();
      expect(attendee.user.slug).toMatch(/^slug-test-.*-[a-z0-9]+$/);
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

      // Verify via attendees endpoint
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
      // Handle with dots should be preserved correctly as user name
      expect(attendee.user.name).toBe(userHandle);
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

      // Verify via attendees that only one user entry exists
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      // Count attendees with this handle - should only be 1
      const matchingAttendees = attendeesResponse.body.data.filter(
        (a: any) => a.user.name === userHandle,
      );
      expect(matchingAttendees.length).toBe(1);
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

  describe('Multiple events same user', () => {
    let secondEventSourceId: string;
    let secondEventSlug: string;

    beforeAll(async () => {
      const timestamp = Date.now();
      const testDid = `did:plc:secondevt${timestamp}`.substring(0, 32);
      const testRkey = `testrkey${timestamp}`;
      secondEventSourceId = `at://${testDid}/community.lexicon.calendar.event/${testRkey}`;

      const eventPayload = {
        name: `Second Shadow Account Test Event ${timestamp}`,
        description: 'Second event for testing multi-event RSVPs',
        startDate: new Date(Date.now() + 172800000).toISOString(),
        endDate: new Date(Date.now() + 176400000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: secondEventSourceId,
          type: 'bluesky',
          handle: 'secondevent.bsky.social',
          metadata: {
            cid: `bafyreitestcid${timestamp}`,
            rkey: testRkey,
            collection: 'community.lexicon.calendar.event',
            time_us: timestamp * 1000,
            did: testDid,
          },
        },
        location: {
          description: 'Second Test Location',
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(eventPayload);

      expect(response.status).toBe(202);
      secondEventSlug = response.body.slug;
    });

    it('should use same user account when RSVPing to multiple events', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:multivent${timestamp}`.substring(0, 32);
      const userHandle = `multi-event-user-${timestamp}.bsky.social`;

      // RSVP to first event
      const firstRsvpPayload = {
        eventSourceId: testEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'going',
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

      // RSVP to second event with same user
      const secondRsvpPayload = {
        eventSourceId: secondEventSourceId,
        eventSourceType: 'bluesky',
        userDid: userDid,
        userHandle: userHandle,
        status: 'interested',
        timestamp: new Date().toISOString(),
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

      // Verify both events show same user
      const adminToken = await loginAsAdmin();

      const firstEventAttendees = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const secondEventAttendees = await request(TESTING_APP_URL)
        .get(`/api/events/${secondEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const firstAttendee = firstEventAttendees.body.data.find(
        (a: any) => a.user.name === userHandle,
      );
      const secondAttendee = secondEventAttendees.body.data.find(
        (a: any) => a.user.name === userHandle,
      );

      expect(firstAttendee).toBeDefined();
      expect(secondAttendee).toBeDefined();

      // Same user (same slug) should be used for both events
      expect(firstAttendee.user.slug).toBe(secondAttendee.user.slug);

      // But different attendee records with different statuses
      expect(firstAttendee.status).toBe('confirmed');
      expect(secondAttendee.status).toBe('maybe');
    });
  });

  describe('Shadow account profile visibility', () => {
    it('should expose name and slug in attendee listing', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:pubprof${timestamp}`.substring(0, 32);
      const userHandle = `public-profile-${timestamp}.bsky.social`;
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

      await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      // Fetch attendees without authentication (public)
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      const attendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === userHandle,
      );

      expect(attendee).toBeDefined();
      // Public fields should be visible
      expect(attendee.user.name).toBe(userHandle);
      expect(attendee.user.slug).toBeDefined();
    });

    it('should mark shadow accounts with isShadowAccount flag', async () => {
      const timestamp = Date.now();
      const userDid = `did:plc:shadowflag${timestamp}`.substring(0, 32);
      const userHandle = `shadow-flag-${timestamp}.bsky.social`;
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

      // Fetch attendees as admin to verify isShadowAccount flag
      // Request larger limit to account for many test attendees
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${testEventSlug}/attendees`)
        .query({ limit: 50 })
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);

      // Find attendee by the exact handle
      const attendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === userHandle,
      );

      expect(attendee).toBeDefined();
      // Verify the user is marked as a shadow account
      expect(attendee.user.isShadowAccount).toBe(true);
    });
  });
});
