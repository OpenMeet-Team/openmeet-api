// test/event/contrail-rsvp.e2e-spec.ts
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin, createTestUser } from '../utils/functions';
import {
  getPublicDataSource,
  seedAtprotoData,
  clearAtprotoData,
  buildEventRecord,
  AtprotoTestScenario,
} from '../utils/atproto-test-helper';

jest.setTimeout(120000);

const waitForBackend = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('Contrail-Only RSVP (e2e)', () => {
  let userToken: string;
  let adminToken: string;
  let ds: DataSource;
  let hasAtprotoIdentity = false;

  // Unique DID per test run to avoid collisions
  const eventHostDid = `did:plc:contrailhost${Date.now()}`;
  const eventRkey = 'contrailrsvptest';
  const eventUri = `at://${eventHostDid}/community.lexicon.calendar.event/${eventRkey}`;
  const contrailSlug = `${eventHostDid}~${eventRkey}`;

  beforeAll(async () => {
    // 1. Get public datasource and seed a Contrail-only event
    ds = await getPublicDataSource();

    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();

    const scenario: AtprotoTestScenario = {
      events: [
        {
          uri: eventUri,
          did: eventHostDid,
          rkey: eventRkey,
          cid: 'bafyreih4gqyfkodywvijahyovq7tewbtkckjq56rrkhuruhkijksuqyfri',
          record: buildEventRecord({
            name: 'Contrail-Only RSVP Test Event',
            startsAt: futureDate,
          }),
        },
      ],
      rsvps: [],
      identities: [
        {
          did: eventHostDid,
          handle: 'contrail-rsvp-host.test',
          pds: 'https://pds.contrailrsvp.test',
        },
      ],
      geoEntries: [],
    };

    await seedAtprotoData(ds, scenario);

    // 2. Login as admin (for error-case tests)
    adminToken = await loginAsAdmin();

    // 3. Create a fresh test user — gets a custodial PDS account automatically
    const email = `contrail-rsvp-${Date.now()}@openmeet.test`;
    const userData = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      email,
      'ContrailRsvp',
      'Tester',
    );
    userToken = userData.token;

    // 4. Wait for async PDS account creation
    await waitForBackend(5000);

    // 5. Check if the user actually got an ATProto identity
    const identityResponse = await request(TESTING_APP_URL)
      .get('/api/atproto/identity')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    hasAtprotoIdentity =
      identityResponse.status === 200 && !!identityResponse.body?.did;

    if (!hasAtprotoIdentity) {
      console.warn(
        'Test user does not have an ATProto identity — ' +
          'RSVP happy-path tests will be skipped. ' +
          'Is the PDS devnet running?',
      );
    }
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        await clearAtprotoData(ds);
        await ds.destroy();
      }
    } catch {
      // DataSource may already be destroyed by global teardown
    }
  });

  describe('POST /api/events/:slug/attend (Contrail-only)', () => {
    it('should RSVP to a Contrail-only event', async () => {
      if (!hasAtprotoIdentity) {
        console.warn('SKIP: No ATProto identity available');
        return;
      }

      const response = await request(TESTING_APP_URL)
        .post(`/api/events/${contrailSlug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('source', 'atproto');
      expect(response.body).toHaveProperty('status', 'confirmed');
      expect(response.body).toHaveProperty('rsvpUri');
      expect(response.body.event).toHaveProperty('atprotoUri', eventUri);
    });

    it('should cancel RSVP on a Contrail-only event', async () => {
      if (!hasAtprotoIdentity) {
        console.warn('SKIP: No ATProto identity available');
        return;
      }

      // Ensure we have an active RSVP first
      await request(TESTING_APP_URL)
        .post(`/api/events/${contrailSlug}/attend`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      const cancelResponse = await request(TESTING_APP_URL)
        .post(`/api/events/${contrailSlug}/cancel-attending`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(cancelResponse.body).toHaveProperty('source', 'atproto');
      expect(cancelResponse.body).toHaveProperty('status', 'cancelled');
    });
  });

  describe('Error cases', () => {
    it('should return 404 for non-existent Contrail event', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/events/did:plc:nobody~nonexistent/attend')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-ATProto slug that does not exist', async () => {
      const response = await request(TESTING_APP_URL)
        .post('/api/events/totally-fake-event-slug/attend')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(response.status).toBe(404);
    });

    it('should return 400 when user has no ATProto identity', async () => {
      // Admin user has no ATProto identity — should get a clear error
      const response = await request(TESTING_APP_URL)
        .post(`/api/events/${contrailSlug}/attend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('AT Protocol');
    });
  });
});
