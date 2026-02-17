import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

/**
 * E2E tests verifying that firehose-ingested events and RSVPs
 * do NOT trigger email notifications but DO create activity feed entries.
 *
 * Bug: om-hhbh — cross-app notification leak from firehose
 * Fix: firehose services emit event.ingested / event.rsvp.ingested
 *      instead of event.created / event.rsvp.added
 */

const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];
const MAILDEV_URL = `http://${process.env.TESTING_MAIL_HOST || 'localhost'}:${process.env.MAIL_CLIENT_PORT || '1080'}`;

jest.setTimeout(30000);

describe('Firehose notification suppression (e2e)', () => {
  beforeAll(async () => {
    if (!SERVICE_API_KEY) {
      throw new Error('SERVICE_API_KEYS not configured');
    }
  });

  /**
   * Helper: clear all emails in MailDev
   */
  async function clearMaildev(): Promise<void> {
    await request(MAILDEV_URL).delete('/email/all').expect(200);
  }

  /**
   * Helper: get all emails from MailDev
   */
  async function getEmails(): Promise<any[]> {
    const res = await request(MAILDEV_URL).get('/email');
    return res.body;
  }

  describe('Firehose event ingestion should NOT send announcement emails', () => {
    it('should ingest event without sending any emails', async () => {
      // 1. Clear MailDev
      await clearMaildev();

      // 2. Ingest an event via the firehose integration endpoint
      const timestamp = Date.now();
      const base32Timestamp = timestamp
        .toString()
        .replace(/[018]/g, '2')
        .replace(/9/g, '7');
      const testDidIdentifier = `emailtest${base32Timestamp}`
        .substring(0, 24)
        .padEnd(24, 'a');
      const testDid = `did:plc:${testDidIdentifier}`;
      const testRkey = `testrkey${timestamp}`;

      const payload = {
        name: `Firehose Email Test Event ${timestamp}`,
        description: 'This event came from the firehose - should NOT trigger emails',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://${testDid}/community.lexicon.calendar.event/${testRkey}`,
          type: 'bluesky',
          handle: 'emailtest.bsky.social',
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
        .send(payload);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);

      // 3. Wait for async event processing (emails are sent asynchronously)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 4. Check MailDev - should have NO emails
      const emails = await getEmails();
      const announcementEmails = emails.filter(
        (email: any) =>
          email.subject?.includes('Firehose Email Test Event') ||
          email.subject?.includes('New Event') ||
          email.subject?.includes('event'),
      );

      expect(announcementEmails).toHaveLength(0);
    });
  });

  describe('Firehose RSVP ingestion should NOT send calendar invite emails', () => {
    let eventSlug: string;
    let eventSourceId: string;

    beforeAll(async () => {
      // Create a test event first (via firehose)
      const timestamp = Date.now();
      const base32Timestamp = timestamp
        .toString()
        .replace(/[018]/g, '2')
        .replace(/9/g, '7');
      const testDidIdentifier = `rsvpemailtest${base32Timestamp}`
        .substring(0, 24)
        .padEnd(24, 'a');
      const testDid = `did:plc:${testDidIdentifier}`;
      const testRkey = `testrkey${timestamp}`;
      eventSourceId = `at://${testDid}/community.lexicon.calendar.event/${testRkey}`;

      const eventPayload = {
        name: `RSVP Email Test Event ${timestamp}`,
        description: 'Event for testing RSVP email suppression',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: eventSourceId,
          type: 'bluesky',
          handle: 'rsvpemailtest.bsky.social',
          metadata: {
            cid: `bafyreitestcid${timestamp}`,
            rkey: testRkey,
            collection: 'community.lexicon.calendar.event',
            time_us: timestamp * 1000,
            rev: '3m2z5loyhea23',
            did: testDid,
          },
        },
        location: { description: 'Test Location' },
      };

      const response = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(eventPayload);

      expect(response.status).toBe(202);
      eventSlug = response.body.slug;

      // Wait for event to be fully processed
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    it('should ingest RSVP without sending any calendar invite emails', async () => {
      // 1. Clear MailDev
      await clearMaildev();

      // 2. Ingest an RSVP via the firehose integration endpoint
      const timestamp = Date.now();
      const rsvpUserDid = `did:plc:rsvpemailusr${timestamp}`.substring(0, 32);
      const rsvpRkey = `rsvprkey${timestamp}`;

      const rsvpPayload = {
        eventSourceId,
        eventSourceType: 'bluesky',
        userDid: rsvpUserDid,
        userHandle: 'rsvp-email-test.bsky.social',
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

      // 3. Wait for async event processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // 4. Check MailDev - should have NO emails
      const emails = await getEmails();
      const calendarEmails = emails.filter(
        (email: any) =>
          email.subject?.includes('Calendar') ||
          email.subject?.includes('Invite') ||
          email.subject?.includes('RSVP') ||
          email.subject?.includes('calendar'),
      );

      expect(calendarEmails).toHaveLength(0);
    });
  });

  describe('Firehose ingested events should still create activity feed entries', () => {
    it('should create activity feed entry for ingested event', async () => {
      const timestamp = Date.now();
      const base32Timestamp = timestamp
        .toString()
        .replace(/[018]/g, '2')
        .replace(/9/g, '7');
      const testDidIdentifier = `feedtest${base32Timestamp}`
        .substring(0, 24)
        .padEnd(24, 'a');
      const testDid = `did:plc:${testDidIdentifier}`;
      const testRkey = `testrkey${timestamp}`;

      const payload = {
        name: `Feed Test Event ${timestamp}`,
        description: 'Testing activity feed captures firehose events',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: `at://${testDid}/community.lexicon.calendar.event/${testRkey}`,
          type: 'bluesky',
          handle: 'feedtest.bsky.social',
          metadata: {
            cid: `bafyreitestcid${timestamp}`,
            rkey: testRkey,
            collection: 'community.lexicon.calendar.event',
            time_us: timestamp * 1000,
            rev: '3m2z5loyhea23',
            did: testDid,
          },
        },
        location: { description: 'Test Location' },
      };

      const createResponse = await request(TESTING_APP_URL)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(payload);

      expect(createResponse.status).toBe(202);
      const eventSlug = createResponse.body.slug;

      // Wait for async activity feed creation
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check sitewide activity feed for this event
      const feedResponse = await request(TESTING_APP_URL)
        .get('/api/feed')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .query({ limit: 20 });

      expect(feedResponse.status).toBe(200);

      // Look for an activity entry related to our event
      const eventActivity = feedResponse.body.find(
        (activity: any) =>
          activity.event?.slug === eventSlug ||
          activity.metadata?.eventSlug === eventSlug,
      );

      expect(eventActivity).toBeDefined();
    });
  });
});
