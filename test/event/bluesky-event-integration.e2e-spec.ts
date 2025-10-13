import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

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
      expect(response.body.eventId).toBeDefined();
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
      expect(response.body.eventId).toBeDefined();
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
      expect(response.body.eventId).toBeDefined();
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
  });
});
