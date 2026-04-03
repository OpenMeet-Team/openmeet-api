import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createGroup,
  createEvent,
  createTestUser,
  joinGroup,
  loginAsAdmin,
  updateGroupMemberRole,
  getGroupMembers,
  getCurrentUser,
} from '../utils/functions';
import {
  EventStatus,
  EventType,
  GroupRole,
  GroupStatus,
  GroupVisibility,
} from '../../src/core/constants/constant';
import {
  getPublicDataSource,
  seedAtprotoData,
  buildEventRecord,
} from '../utils/atproto-test-helper';
import { AppDataSource } from '../../src/database/data-source';

const SERVICE_API_KEY = process.env.SERVICE_API_KEYS?.split(',')[0];

jest.setTimeout(60000);

describe('Group DID Follow (e2e)', () => {
  const app = TESTING_APP_URL;
  const timestamp = Date.now();

  // Tokens and users
  let adminToken: string;
  let ownerToken: string;
  let memberToken: string;
  let nonMemberToken: string;

  let ownerUser: any;
  let memberUser: any;
  let nonMemberUser: any;

  // Group
  let group: any;

  const testDid = 'did:plc:testfollow123abc';
  const testDid2 = 'did:plc:testfollow456def';

  beforeAll(async () => {
    adminToken = await loginAsAdmin();

    // Create test users
    ownerUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-didfollow-owner-${timestamp}@openmeet.net`,
      'DIDFollow',
      'Owner',
    );
    ownerToken = ownerUser.token;

    memberUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-didfollow-member-${timestamp}@openmeet.net`,
      'DIDFollow',
      'Member',
    );
    memberToken = memberUser.token;

    nonMemberUser = await createTestUser(
      app,
      TESTING_TENANT_ID,
      `openmeet-test-didfollow-nonmember-${timestamp}@openmeet.net`,
      'DIDFollow',
      'NonMember',
    );
    nonMemberToken = nonMemberUser.token;

    // Create a public group as admin
    group = await createGroup(app, adminToken, {
      name: `DID Follow Test Group ${timestamp}`,
      description: 'Group for testing DID follow feature',
      status: GroupStatus.Published,
      visibility: GroupVisibility.Public,
      allowAutoApproval: true,
    });

    // Owner and member join the group
    await joinGroup(app, TESTING_TENANT_ID, group.slug, ownerToken);
    await joinGroup(app, TESTING_TENANT_ID, group.slug, memberToken);

    // Promote ownerUser to Owner role
    const members = await getGroupMembers(
      app,
      TESTING_TENANT_ID,
      group.slug,
      adminToken,
    );
    const ownerDetails = await getCurrentUser(
      app,
      TESTING_TENANT_ID,
      ownerToken,
    );
    const ownerMember = members.find(
      (m: any) => m.user?.id === ownerDetails.id,
    );

    if (ownerMember) {
      await updateGroupMemberRole(
        app,
        TESTING_TENANT_ID,
        group.slug,
        ownerMember.id,
        GroupRole.Owner,
        adminToken,
      );
    }
  });

  afterAll(async () => {
    // Clean up: delete the group
    if (group?.slug) {
      try {
        await request(app)
          .delete(`/api/groups/${group.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ──────────────────────────────────────────────────────────────────
  // CRUD Tests
  // ──────────────────────────────────────────────────────────────────

  describe('CRUD operations', () => {
    it('should create a DID follow with valid DID', async () => {
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: testDid });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.did).toBe(testDid);
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('createdById');
    });

    it('should return 409 when following same DID twice', async () => {
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: testDid });

      expect(response.status).toBe(409);
    });

    it('should reject invalid DID format', async () => {
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: 'not-a-did' });

      expect([400, 422]).toContain(response.status);
    });

    it('should list DID follows for a group', async () => {
      const response = await request(app)
        .get(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);

      const follow = response.body.find((f: any) => f.did === testDid);
      expect(follow).toBeDefined();
      expect(follow.did).toBe(testDid);
    });

    it('should delete a DID follow', async () => {
      const response = await request(app)
        .delete(
          `/api/groups/${group.slug}/did-follows/${encodeURIComponent(testDid)}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(204);
    });

    it('should return empty list after deletion', async () => {
      const response = await request(app)
        .get(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const follow = response.body.find((f: any) => f.did === testDid);
      expect(follow).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Auth Tests
  // ──────────────────────────────────────────────────────────────────

  describe('Authorization', () => {
    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: testDid2 });

      expect(response.status).toBe(401);
    });

    it('should return 403 for non-member', async () => {
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${nonMemberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: testDid2 });

      expect(response.status).toBe(403);
    });

    it('should return 403 for member without owner/admin role', async () => {
      // memberUser joined the group but has default Member role (not Owner/Admin)
      const response = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: testDid2 });

      expect(response.status).toBe(403);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Query Integration Tests (shadow user path)
  // ──────────────────────────────────────────────────────────────────

  describe('Query integration with followed DIDs', () => {
    // These tests require the SERVICE_API_KEY to create shadow user events
    // via the integration endpoint.
    const integrationTimestamp = Date.now();
    const base32Safe = (s: string) =>
      s.replace(/[018]/g, '2').replace(/9/g, '7');
    const shadowDidIdentifier = base32Safe(
      `didfollowshdw${integrationTimestamp}`,
    )
      .substring(0, 24)
      .padEnd(24, 'a');
    const shadowDid = `did:plc:${shadowDidIdentifier}`;
    const shadowEventUri = `at://${shadowDid}/community.lexicon.calendar.event/rkey${integrationTimestamp}`;
    let shadowEventSlug: string;
    let nativeEventSlug: string;

    beforeAll(async () => {
      if (!SERVICE_API_KEY) {
        console.warn(
          'SERVICE_API_KEYS not set — skipping query integration setup',
        );
        return;
      }

      // Step 1: Create an event via the integration endpoint.
      // This creates a shadow user with socialId = shadowDid, provider = 'bluesky'
      // and an event owned by that shadow user (no groupId).
      const shadowEventPayload = {
        name: `Shadow DID Event ${integrationTimestamp}`,
        description:
          'Event created by a shadow user for DID follow query testing',
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        type: 'in-person',
        status: 'published',
        visibility: 'public',
        source: {
          id: shadowEventUri,
          type: 'bluesky',
          handle: `didfollowtest-${integrationTimestamp}.bsky.social`,
          metadata: {
            cid: `bafyreitestcid${integrationTimestamp}`,
            rkey: `rkey${integrationTimestamp}`,
            collection: 'community.lexicon.calendar.event',
            time_us: integrationTimestamp * 1000,
            rev: '3m2z5loyhea23',
            did: shadowDid,
          },
        },
        location: {
          description: 'Test Location',
        },
      };

      const shadowEventResponse = await request(app)
        .post('/api/integration/events')
        .set('Content-Type', 'application/json')
        .set('Authorization', `Bearer ${SERVICE_API_KEY}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(shadowEventPayload);

      expect(shadowEventResponse.status).toBe(202);
      shadowEventSlug = shadowEventResponse.body.slug;

      // The integration endpoint sets sourceId but NOT atprotoUri.
      // enrichRecords() links Contrail records to tenant events via atprotoUri,
      // so we must set it manually.
      const tenantDs = AppDataSource(TESTING_TENANT_ID);
      if (!tenantDs.isInitialized) await tenantDs.initialize();
      await tenantDs.query(
        `UPDATE events SET "atprotoUri" = $1 WHERE slug = $2`,
        [shadowEventUri, shadowEventSlug],
      );

      // Seed the shadow event into Contrail. The integration endpoint saves the
      // event to the tenant DB but does NOT
      // publish it to PDS, so it will never flow through the
      // PDS→Jetstream→Contrail pipeline. findEventsForGroup queries Contrail for
      // events by followed DIDs, so we must seed it directly.
      try {
        const publicDs = await getPublicDataSource();
        await seedAtprotoData(publicDs, {
          events: [
            {
              uri: shadowEventUri,
              did: shadowDid,
              rkey: `rkey${integrationTimestamp}`,
              cid: `bafyreitestcid${integrationTimestamp}`,
              record: buildEventRecord({
                name: shadowEventPayload.name,
                description: shadowEventPayload.description,
                startsAt: shadowEventPayload.startDate,
                endsAt: shadowEventPayload.endDate,
              }),
            },
          ],
          rsvps: [],
          identities: [
            {
              did: shadowDid,
              handle: `didfollowtest-${integrationTimestamp}.bsky.social`,
              pds: 'https://pds.test',
            },
          ],
          geoEntries: [],
        });
      } catch (err) {
        console.error(
          'Failed to seed Contrail for group DID follow test:',
          err,
        );
      }

      // Step 2: Create a native group event
      const nativeEvent = await createEvent(app, ownerToken, {
        name: `Native Group Event ${integrationTimestamp}`,
        description: 'Native event for DID follow query testing',
        type: EventType.InPerson,
        status: EventStatus.Published,
        group: group.id,
      });
      nativeEventSlug = nativeEvent.slug;

      // Step 3: Add the DID follow for the shadow user's DID
      const followResponse = await request(app)
        .post(`/api/groups/${group.slug}/did-follows`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ did: shadowDid });

      expect(followResponse.status).toBe(201);
    });

    afterAll(async () => {
      // Cleanup: remove seeded Contrail row for the shadow event
      try {
        const publicDs = await getPublicDataSource();
        await publicDs.query(
          `DELETE FROM records_community_lexicon_calendar_event WHERE uri = $1`,
          [shadowEventUri],
        );
        await publicDs.query(`DELETE FROM identities WHERE did = $1`, [
          shadowDid,
        ]);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should include shadow user event with origin external', async () => {
      if (!SERVICE_API_KEY) {
        console.warn('SERVICE_API_KEYS not set — skipping test');
        return;
      }

      const response = await request(app)
        .get(`/api/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Find the shadow user's event — check by slug or atprotoUri
      // (enrichRecords returns tenant slug when linked, did~rkey when not)
      const externalEvent = response.body.find(
        (e: any) =>
          e.slug === shadowEventSlug || e.atprotoUri === shadowEventUri,
      );
      expect(externalEvent).toBeDefined();
      expect(externalEvent.origin).toBe('external');
    });

    it('should include native group event with origin group', async () => {
      if (!SERVICE_API_KEY) {
        console.warn('SERVICE_API_KEYS not set — skipping test');
        return;
      }

      const response = await request(app)
        .get(`/api/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);

      const nativeEvent = response.body.find(
        (e: any) => e.slug === nativeEventSlug,
      );
      expect(nativeEvent).toBeDefined();
      expect(nativeEvent.origin).toBe('group');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Deduplication Test
  // ──────────────────────────────────────────────────────────────────

  describe('Deduplication', () => {
    // True dedup (event owned by followed DID AND native to group) requires
    // a shadow user to create an event within a group, which is impossible
    // via API since shadow users can't authenticate. That path is covered
    // by the unit test in event-query.service.spec.ts.
    //
    // Here we verify that querying a group with followed DIDs doesn't
    // produce duplicate event slugs from the external query path.
    it('should not produce duplicate event slugs', async () => {
      if (!SERVICE_API_KEY) {
        console.warn('SERVICE_API_KEYS not set — skipping test');
        return;
      }

      // The shadow DID follow was added in the query integration beforeAll.
      // Query the group events and verify no slug appears more than once.
      const response = await request(app)
        .get(`/api/groups/${group.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const slugs = response.body.map((e: any) => e.slug);
      const uniqueSlugs = new Set(slugs);
      expect(slugs.length).toBe(uniqueSlugs.size);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Backward Compatibility Test
  // ──────────────────────────────────────────────────────────────────

  describe('Backward compatibility', () => {
    let compatGroup: any;
    let compatEventSlug: string;

    beforeAll(async () => {
      // Create a group with NO DID follows
      compatGroup = await createGroup(app, adminToken, {
        name: `Compat Test Group ${timestamp}`,
        description: 'Group for backward compatibility testing',
        status: GroupStatus.Published,
        visibility: GroupVisibility.Public,
        allowAutoApproval: true,
      });

      // Owner joins and gets promoted
      await joinGroup(app, TESTING_TENANT_ID, compatGroup.slug, ownerToken);
      const members = await getGroupMembers(
        app,
        TESTING_TENANT_ID,
        compatGroup.slug,
        adminToken,
      );
      const ownerDetails = await getCurrentUser(
        app,
        TESTING_TENANT_ID,
        ownerToken,
      );
      const ownerMember = members.find(
        (m: any) => m.user?.id === ownerDetails.id,
      );
      if (ownerMember) {
        await updateGroupMemberRole(
          app,
          TESTING_TENANT_ID,
          compatGroup.slug,
          ownerMember.id,
          GroupRole.Owner,
          adminToken,
        );
      }

      // Create a native event in the group
      const event = await createEvent(app, ownerToken, {
        name: `Compat Native Event ${timestamp}`,
        description: 'Native event for backward compat testing',
        type: EventType.InPerson,
        status: EventStatus.Published,
        group: compatGroup.id,
      });
      compatEventSlug = event.slug;
    });

    afterAll(async () => {
      if (compatGroup?.slug) {
        try {
          await request(app)
            .delete(`/api/groups/${compatGroup.slug}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-tenant-id', TESTING_TENANT_ID);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should return all events with origin group when no DID follows', async () => {
      const response = await request(app)
        .get(`/api/groups/${compatGroup.slug}/events`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const compatEvent = response.body.find(
        (e: any) => e.slug === compatEventSlug,
      );
      expect(compatEvent).toBeDefined();
      expect(compatEvent.origin).toBe('group');

      // All events should have origin 'group'
      for (const event of response.body) {
        expect(event.origin).toBe('group');
      }
    });
  });
});
