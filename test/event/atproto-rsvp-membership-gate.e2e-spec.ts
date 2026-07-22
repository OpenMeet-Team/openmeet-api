import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin, createGroup, createEvent } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

// Service API key for the ingestion endpoints (firehose / contrail sink).
const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(120000);

/**
 * Ingestion RSVP membership/approval gate.
 *
 * An external RSVP that comes in through POST /api/integration/rsvps must be
 * held (Pending) when the target event requires group membership and the
 * RSVP comes from someone who is not a member. Before the gate, the ingestion
 * path skipped every access check and saved a "going" RSVP as Confirmed.
 *
 * The event carries a sourceType/sourceId so the ingestion lookup
 * (findBySourceAttributes) finds it, and a group with requireGroupMembership
 * so the gate has something to check. This also proves the event query loads
 * the group relation; without it the gate would find no group and no-op.
 */
describe('ATProto ingestion RSVP membership gate (e2e)', () => {
  let adminToken: string;
  let groupSlug: string;
  let groupId: number;
  const createdEventSlugs: string[] = [];

  const rsvpFrom = async (eventSourceId: string, handle: string) => {
    const timestamp = Date.now();
    const userDid = `did:plc:gate${timestamp}`.substring(0, 32);
    const rkey = `gaterkey${timestamp}`;
    return request(TESTING_APP_URL)
      .post('/api/integration/rsvps')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        eventSourceId,
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

  const statusOf = async (eventSlug: string, handle: string) => {
    const res = await request(TESTING_APP_URL)
      .get(`/api/events/${eventSlug}/attendees`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(res.status).toBe(200);
    const list = res.body.data || res.body;
    const attendee = list.find((a: any) => a.user?.name === handle);
    return attendee?.status;
  };

  beforeAll(async () => {
    if (!SERVICE_API_KEY) {
      throw new Error('SERVICE_API_KEYS not configured. Cannot run this test.');
    }
    adminToken = await loginAsAdmin();

    const group = await createGroup(TESTING_APP_URL, adminToken, {
      name: `Ingestion Gate Group ${Date.now()}`,
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
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
    if (groupSlug) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${groupSlug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  const makeEvent = async (requireGroupMembership: boolean) => {
    const timestamp = Date.now();
    const sourceId = `at://did:plc:gateevt${timestamp}/community.lexicon.calendar.event/evt${timestamp}`;
    const event = await createEvent(TESTING_APP_URL, adminToken, {
      name: `Gate Event ${timestamp}`,
      description: 'Event for the ingestion RSVP gate test',
      type: EventType.Hybrid,
      status: 'published',
      visibility: 'public',
      group: groupId,
      requireGroupMembership,
      sourceType: 'bluesky',
      sourceId,
      locationOnline: 'https://example.com/meeting',
      categories: [],
      timeZone: 'UTC',
    });
    createdEventSlugs.push(event.slug);
    return { slug: event.slug, sourceId };
  };

  it('should hold a non-member external RSVP to a members-only event as pending', async () => {
    const { slug, sourceId } = await makeEvent(true);
    const handle = `nonmember-${Date.now()}.bsky.social`;

    const res = await rsvpFrom(sourceId, handle);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);

    expect(await statusOf(slug, handle)).toBe('pending');
  });

  it('should confirm a non-member external RSVP to an open event in the same group', async () => {
    const { slug, sourceId } = await makeEvent(false);
    const handle = `opener-${Date.now()}.bsky.social`;

    const res = await rsvpFrom(sourceId, handle);
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);

    expect(await statusOf(slug, handle)).toBe('confirmed');
  });
});
