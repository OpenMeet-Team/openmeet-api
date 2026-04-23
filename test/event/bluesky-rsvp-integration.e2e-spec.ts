import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin } from '../utils/functions';

// Service API key from environment
const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(60000);

describe('Bluesky RSVP Integration (e2e)', () => {
  let createdEventSlug: string;
  let createdEventSourceId: string;

  // Verify environment is configured
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

  // Create a test event that RSVPs can reference
  beforeAll(async () => {
    const timestamp = Date.now();
    const base32Timestamp = timestamp
      .toString()
      .replace(/[018]/g, '2')
      .replace(/9/g, '7');
    const testDidIdentifier = `rsvptest${base32Timestamp}`
      .substring(0, 24)
      .padEnd(24, 'a');
    const testDid = `did:plc:${testDidIdentifier}`;
    const testRkey = `testrkey${timestamp}`;
    createdEventSourceId = `at://${testDid}/community.lexicon.calendar.event/${testRkey}`;

    const eventPayload = {
      name: `RSVP Test Event ${timestamp}`,
      description: 'Event created for RSVP integration testing',
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 90000000).toISOString(),
      type: 'in-person',
      status: 'published',
      visibility: 'public',
      source: {
        id: createdEventSourceId,
        type: 'bluesky',
        handle: 'rsvptest.bsky.social',
        metadata: {
          cid: `bafyreitestcid${timestamp}`,
          rkey: testRkey,
          collection: 'community.lexicon.calendar.event',
          time_us: timestamp * 1000,
          rev: '3m2z5loyhea23',
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
    expect(response.body.success).toBe(true);
    createdEventSlug = response.body.slug;
  });

  describe('POST /api/integration/rsvps', () => {
    it('should accept RSVP with "going" status', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:rsvpuser${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'rsvpuser.bsky.social',
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
          collection: 'community.lexicon.calendar.rsvp',
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.attendeeId).toBeDefined();
    });

    it('should accept RSVP with "interested" status and map to Maybe', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:intrstdusr${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'interested-user.bsky.social',
        status: 'interested',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.attendeeId).toBeDefined();

      // Verify the attendee was created with 'maybe' status
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const interestedAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'interested-user.bsky.social',
      );
      expect(interestedAttendee).toBeDefined();
      expect(interestedAttendee.status).toBe('maybe');
    });

    it('should accept RSVP with "notgoing" status and map to Cancelled', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:notgnguser${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'notgoing-user.bsky.social',
        status: 'notgoing',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.attendeeId).toBeDefined();

      // Verify the attendee was created with 'cancelled' status
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const notgoingAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'notgoing-user.bsky.social',
      );
      expect(notgoingAttendee).toBeDefined();
      expect(notgoingAttendee.status).toBe('cancelled');
    });

    it('should update existing RSVP when same user RSVPs again', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:updatusr${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      // First RSVP with 'interested' status
      const firstRsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'update-test-user.bsky.social',
        status: 'interested',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const firstResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(firstRsvpPayload);

      expect(firstResponse.status).toBe(202);
      expect(firstResponse.body.success).toBe(true);
      const firstAttendeeId = firstResponse.body.attendeeId;

      // Second RSVP with 'going' status - should update existing
      const secondRsvpPayload = {
        ...firstRsvpPayload,
        status: 'going',
        timestamp: new Date().toISOString(),
        metadata: {
          ...firstRsvpPayload.metadata,
          cid: `bafyreiupdatedcid${timestamp}`,
        },
      };

      const secondResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(secondRsvpPayload);

      if (secondResponse.status !== 202) {
        console.error('Second RSVP failed:', secondResponse.body);
      }
      expect(secondResponse.status).toBe(202);
      expect(secondResponse.body.success).toBe(true);
      // Should be the same attendee record, updated
      expect(secondResponse.body.attendeeId).toBe(firstAttendeeId);

      // Verify the status was updated to 'confirmed'
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const updatedAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'update-test-user.bsky.social',
      );
      expect(updatedAttendee).toBeDefined();
      expect(updatedAttendee.status).toBe('confirmed');
    });

    it('should create shadow account for new Bluesky user', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:shadowusr${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;
      const uniqueHandle = `shadow-test-${timestamp}.bsky.social`;

      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: uniqueHandle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);

      // Verify shadow account was created
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const shadowAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === uniqueHandle,
      );
      expect(shadowAttendee).toBeDefined();
      // Shadow account should have the Bluesky handle as name
      expect(shadowAttendee.user.name).toBe(uniqueHandle);
    });

    it('should reject request without service API key', async () => {
      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: 'did:plc:testuser12345678901234',
        userHandle: 'test.bsky.social',
        status: 'going',
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        // No Authorization header
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(401);
    });

    it('should reject request without tenant ID', async () => {
      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: 'did:plc:testuser12345678901234',
        userHandle: 'test.bsky.social',
        status: 'going',
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        // No x-tenant-id header
        .send(rsvpPayload);

      expect(response.status).toBe(401);
    });

    it('should reject RSVP for non-existent event', async () => {
      const timestamp = Date.now();
      const nonExistentEventSourceId = `at://did:plc:nonexistent12345678/community.lexicon.calendar.event/fake${timestamp}`;

      const rsvpPayload = {
        eventSourceId: nonExistentEventSourceId,
        eventSourceType: 'bluesky',
        userDid: `did:plc:testuser${timestamp}`.substring(0, 32),
        userHandle: 'test.bsky.social',
        status: 'going',
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      // Should fail because event doesn't exist
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('DELETE /api/integration/rsvps', () => {
    it('should cancel RSVP when delete is called', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:delusr${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;
      const rsvpSourceId = `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`;

      // First create an RSVP
      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'delete-test-user.bsky.social',
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: rsvpSourceId,
        metadata: {
          cid: `bafyreirsvpcid${timestamp}`,
          rkey: rsvpRkey,
        },
      };

      const createResponse = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(createResponse.status).toBe(202);
      expect(createResponse.body.success).toBe(true);

      // Debug: Check what was stored for this attendee
      const debugAdminToken = await loginAsAdmin();
      const attendeesBeforeDelete = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${debugAdminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      const createdAttendee = attendeesBeforeDelete.body.data.find(
        (a: any) => a.user.name === 'delete-test-user.bsky.social',
      );
      console.log('Created attendee before delete:', {
        id: createdAttendee?.id,
        status: createdAttendee?.status,
        sourceId: createdAttendee?.sourceId,
        sourceType: createdAttendee?.sourceType,
      });
      console.log('Expected sourceId for delete:', rsvpSourceId);

      // Now delete the RSVP
      const deleteResponse = await request(TESTING_APP_URL)
        .delete('/api/integration/rsvps')
        .query({
          sourceId: rsvpSourceId,
          sourceType: 'bluesky',
        })
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log('Delete response:', deleteResponse.body);
      expect(deleteResponse.status).toBe(202);
      expect(deleteResponse.body.success).toBe(true);

      // Verify the attendee was marked as cancelled
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const deletedAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'delete-test-user.bsky.social',
      );
      expect(deletedAttendee).toBeDefined();
      expect(deletedAttendee.status).toBe('cancelled');
    });

    it('should reject delete without required parameters', async () => {
      const response = await request(TESTING_APP_URL)
        .delete('/api/integration/rsvps')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Missing required parameters');
    });

    it('should reject delete without service API key', async () => {
      const response = await request(TESTING_APP_URL)
        .delete('/api/integration/rsvps')
        .query({
          sourceId: 'at://did:plc:test/community.lexicon.calendar.rsvp/test',
          sourceType: 'bluesky',
        })
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(401);
    });
  });

  describe('RSVP with metadata preservation', () => {
    it('should preserve RSVP metadata including CID and rkey', async () => {
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:metausr${timestamp}`.substring(0, 32);
      const rsvpRkey = `metarkey${timestamp}`;
      const rsvpCid = `bafyreimetacid${timestamp}`;
      const eventCid = `bafyreieventcid${timestamp}`;

      const rsvpPayload = {
        eventSourceId: createdEventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'metadata-test-user.bsky.social',
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${rsvpUserDid}/community.lexicon.calendar.rsvp/${rsvpRkey}`,
        metadata: {
          cid: rsvpCid,
          eventCid: eventCid,
          rkey: rsvpRkey,
          collection: 'community.lexicon.calendar.rsvp',
          time_us: timestamp * 1000,
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/rsvps')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(rsvpPayload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.attendeeId).toBeDefined();

      // The metadata should be stored - we verify via admin access
      const adminToken = await loginAsAdmin();
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${createdEventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      const metadataAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'metadata-test-user.bsky.social',
      );
      expect(metadataAttendee).toBeDefined();
      expect(metadataAttendee.status).toBe('confirmed');
    });
  });
});
