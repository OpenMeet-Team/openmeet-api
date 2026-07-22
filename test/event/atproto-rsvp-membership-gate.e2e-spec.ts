import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createGroup, createEvent, createTestUser } from '../utils/functions';
import {
  EventType,
  EventStatus,
  EventVisibility,
} from '../../src/core/constants/constant';

// Service API key for the ingestion endpoints (firehose / contrail sink).
const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(120000);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ingestion RSVP membership/approval gate.
 *
 * An external RSVP that comes in through POST /api/integration/rsvps must be
 * held (Pending) when the target event requires group membership and the RSVP
 * comes from someone who is not a member. Before the gate, the ingestion path
 * skipped every access check and saved a "going" RSVP as Confirmed.
 *
 * This exercises the REAL bug scenario (Kurt Horne / CRMC, 2026-07-18): a
 * native OpenMeet event in a members-only group, published to the AT Protocol
 * network because it is public, then RSVP'd from outside. Such an event is only
 * ever reachable by an external RSVP through its `atprotoUri` — the ingestion
 * lookup falls back to EventQueryService.findByAtprotoUri, which loads the
 * `group` relation so the gate can check membership.
 *
 * (The gate can only fire for events that belong to a group with
 * requireGroupMembership. Purely firehose-ingested events carry a
 * sourceType/sourceId but never an OpenMeet group, so publishing a native event
 * to atproto is the only way to build the fixture.)
 *
 * The organizer is a freshly registered email user because event publishing to
 * atproto requires a custodial PDS identity (auto-provisioned on registration).
 */
describe('ATProto ingestion RSVP membership gate (e2e)', () => {
  let ownerToken: string;
  let groupSlug: string;
  let groupId: number;
  const createdEventSlugs: string[] = [];

  // The organizer only publishes events to atproto once their custodial
  // identity is provisioned (async, right after registration).
  const waitForIdentity = async (token: string): Promise<string> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await request(TESTING_APP_URL)
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      if (res.status === 200 && res.body?.did) {
        return res.body.did;
      }
      await wait(1500);
    }
    throw new Error(
      'Organizer never provisioned an atproto identity; cannot publish an ' +
        'event for the ingestion gate test (is the devnet PDS configured?)',
    );
  };

  // Poll the event until the async atproto publish populates atprotoUri — the
  // handle the ingestion RSVP will reference.
  const waitForAtprotoUri = async (slug: string): Promise<string> => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const res = await request(TESTING_APP_URL)
        .get(`/api/events/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
      if (res.status === 200 && res.body?.atprotoUri) {
        return res.body.atprotoUri;
      }
      await wait(1500);
    }
    throw new Error(
      `Event ${slug} was not published to atproto (no atprotoUri after wait)`,
    );
  };

  // A native, public, published event in the group. Because it is public it
  // auto-publishes to the organizer's PDS and gets an atprotoUri.
  const makePublishedEvent = async (requireGroupMembership: boolean) => {
    const timestamp = Date.now();
    const event = await createEvent(TESTING_APP_URL, ownerToken, {
      name: `Gate Event ${timestamp}`,
      description: 'Event for the ingestion RSVP gate test',
      type: EventType.Hybrid,
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      group: groupId,
      requireGroupMembership,
      locationOnline: 'https://example.com/meeting',
      categories: [],
      timeZone: 'UTC',
    });
    createdEventSlugs.push(event.slug);
    const atprotoUri = await waitForAtprotoUri(event.slug);
    return { slug: event.slug, atprotoUri };
  };

  // An external "going" RSVP from a non-member DID, delivered through the
  // service-key ingestion endpoint against the event's atprotoUri.
  const rsvpFrom = async (eventAtprotoUri: string, handle: string) => {
    const timestamp = Date.now();
    const userDid = `did:plc:gate${timestamp}`.substring(0, 32);
    const rkey = `gaterkey${timestamp}`;
    return request(TESTING_APP_URL)
      .post('/api/integration/rsvps')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        eventSourceId: eventAtprotoUri,
        eventSourceType: 'bluesky',
        userDid,
        userHandle: handle,
        status: 'going',
        timestamp: new Date().toISOString(),
        sourceId: `at://${userDid}/community.lexicon.calendar.rsvp/${rkey}`,
        metadata: {
          cid: `bafyreigate${timestamp}`,
          rkey,
          collection: 'community.lexicon.calendar.rsvp',
        },
      });
  };

  // Read a specific attendee's status by the id the ingestion endpoint returns.
  // (Robust against how a shadow account's display name is derived.)
  const statusOfAttendee = async (eventSlug: string, attendeeId: number) => {
    const res = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}/attendees`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(res.status).toBe(200);
    const list = res.body.data || res.body;
    const attendee = list.find((a: any) => a.id === attendeeId);
    return attendee?.status;
  };

  beforeAll(async () => {
    if (!SERVICE_API_KEY) {
      throw new Error('SERVICE_API_KEYS not configured. Cannot run this test.');
    }

    const timestamp = Date.now();
    const owner = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `gate-owner-${timestamp}@openmeet.net`,
      'Gate',
      'Owner',
    );
    ownerToken = owner.token;

    // Events only publish to atproto once the organizer has a custodial identity.
    await waitForIdentity(ownerToken);

    const group = await createGroup(TESTING_APP_URL, ownerToken, {
      name: `Ingestion Gate Group ${timestamp}`,
      description: 'Group for the ingestion RSVP gate test',
      status: 'published',
      visibility: 'public',
    });
    groupSlug = group.slug;
    groupId = group.id;
  });

  afterAll(async () => {
    for (const slug of createdEventSlugs) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${slug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    if (groupSlug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${groupSlug}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  it('should hold a non-member external RSVP to a members-only event as pending', async () => {
    const { slug, atprotoUri } = await makePublishedEvent(true);
    const handle = `nonmember-${Date.now()}.bsky.social`;

    const res = await rsvpFrom(atprotoUri, handle);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.attendeeId).toBeDefined();

    expect(await statusOfAttendee(slug, res.body.attendeeId)).toBe('pending');
  });

  it('should confirm a non-member external RSVP to an open event in the same group', async () => {
    const { slug, atprotoUri } = await makePublishedEvent(false);
    const handle = `opener-${Date.now()}.bsky.social`;

    const res = await rsvpFrom(atprotoUri, handle);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.attendeeId).toBeDefined();

    expect(await statusOfAttendee(slug, res.body.attendeeId)).toBe('confirmed');
  });
});
