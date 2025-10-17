import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin } from '../utils/functions';

// Service API key from environment
const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(60000);

describe('Bluesky Event Integration (e2e)', () => {
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

  describe('POST /api/integration/events', () => {
    it('should accept Bluesky event without handle (DID only)', async () => {
      // Simulate firehose data - no handle field, only DID in metadata
      const payload = {
        name: 'Test Event from Firehose (No Handle)',
        description: 'Testing event creation with DID only',
        startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        endDate: new Date(Date.now() + 90000000).toISOString(), // Tomorrow + 1 hour
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://did:plc:test${Date.now()}/community.lexicon.calendar.event/testkey${Date.now()}`,
          type: 'bluesky',
          // No handle field - this is what the firehose sends
          metadata: {
            cid: `bafyreitestcid${Date.now()}`,
            rkey: `testkey${Date.now()}`,
            collection: 'community.lexicon.calendar.event',
            time_us: Date.now() * 1000,
            rev: '3m2z5loyhea23',
            did: `did:plc:test${Date.now()}`,
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
        .send(payload);

      // Should accept the event (202 Accepted)
      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.slug).toBeDefined();
      expect(response.body.message).toContain('accepted');
    });

    it('should accept Bluesky event with handle provided', async () => {
      // Test with handle provided (optional scenario)
      const payload = {
        name: 'Test Event with Handle',
        description: 'Testing event creation with handle',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://did:plc:test${Date.now()}/community.lexicon.calendar.event/testkey${Date.now()}`,
          type: 'bluesky',
          handle: 'test.bsky.social', // Handle provided
          metadata: {
            cid: `bafyreitestcid${Date.now()}`,
            rkey: `testkey${Date.now()}`,
            collection: 'community.lexicon.calendar.event',
            time_us: Date.now() * 1000,
            rev: '3m2z5loyhea23',
            did: `did:plc:test${Date.now()}`,
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
        .send(payload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.slug).toBeDefined();
    });

    it('should extract DID from AT Protocol URI', async () => {
      const testDid = `did:plc:extract${Date.now()}`;
      const testRkey = `testrkey${Date.now()}`;

      const payload = {
        name: 'Test Event with AT URI',
        description: 'Testing DID extraction from AT Protocol URI',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://${testDid}/community.lexicon.calendar.event/${testRkey}`,
          type: 'bluesky',
          // No handle - should use DID as fallback
          metadata: {
            cid: `bafyreitestcid${Date.now()}`,
            rkey: testRkey,
            collection: 'community.lexicon.calendar.event',
            time_us: Date.now() * 1000,
            rev: '3m2z5loyhea23',
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
        .send(payload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.slug).toBeDefined();
    });

    it('should reject request without service API key', async () => {
      const payload = {
        name: 'Test Event',
        description: 'Test',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://did:plc:test${Date.now()}/community.lexicon.calendar.event/testkey${Date.now()}`,
          type: 'bluesky',
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        // No Authorization header
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should reject request without tenant ID', async () => {
      const payload = {
        name: 'Test Event',
        description: 'Test',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://did:plc:test${Date.now()}/community.lexicon.calendar.event/testkey${Date.now()}`,
          type: 'bluesky',
        },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        // No x-tenant-id header
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should add event creator as host attendee', async () => {
      const timestamp = Date.now();
      // DID must be exactly 32 characters (did:plc: + 24 char identifier)
      // Use base32-safe characters (a-z, 2-7) to avoid validation errors
      const base32Timestamp = timestamp.toString().replace(/[018]/g, '2').replace(/9/g, '7');
      const testDidIdentifier = `attendeetest${base32Timestamp}`.substring(0, 24).padEnd(24, 'a');
      const testDid = `did:plc:${testDidIdentifier}`;
      const testRkey = `testrkey${timestamp}`;
      const sourceId = `at://${testDid}/community.lexicon.calendar.event/${testRkey}`;

      // Create event via integration endpoint
      const payload = {
        name: `Test Event Creator Attendee ${timestamp}`,
        description: 'Testing that event creator is added as host attendee',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: sourceId,
          type: 'bluesky',
          handle: 'attendeetest.bsky.social',
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

      const createResponse = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(payload);

      expect(createResponse.status).toBe(202);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.slug).toBeDefined();

      const eventSlug = createResponse.body.slug;

      // Get admin token to query attendees
      const adminToken = await loginAsAdmin();

      // Query attendees for this event
      const attendeesResponse = await request(TESTING_APP_URL)
        .get(`/api/events/${eventSlug}/attendees`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(attendeesResponse.status).toBe(200);
      expect(attendeesResponse.body.data).toBeDefined();
      expect(Array.isArray(attendeesResponse.body.data)).toBe(true);
      expect(attendeesResponse.body.data.length).toBeGreaterThan(0);

      // Find the host attendee (should be the shadow account/creator)
      const hostAttendee = attendeesResponse.body.data.find(
        (attendee: any) => attendee.role.name === 'host',
      );

      expect(hostAttendee).toBeDefined();
      expect(hostAttendee.user).toBeDefined();
      // Verify the host is the shadow account created for this event
      // The user name should match the handle we provided
      expect(hostAttendee.user.name).toBe('attendeetest.bsky.social');
      expect(hostAttendee.status).toBe('confirmed');
    });
  });
});
