import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_PDS_URL,
  TESTING_PDS_HANDLE_DOMAIN,
  TESTING_PDS_INVITE_CODE,
} from '../utils/constants';

/**
 * Curl-level proof that OM API's /xrpc/net.openmeet.* mount works.
 *
 * Prereqs:
 *   - OM API running (e.g. `npm run start:dev`)
 *   - CONTRAIL_DATABASE_URL pointing at a Postgres populated with Contrail
 *     records (use `npm run contrail:sync` first, or the smoke-gate PG)
 *
 * These hit raw Express middleware (no Nest controller / TenantGuard /
 * api prefix). The mount in main.ts is single-tenant by design.
 *
 * The suite is gated on CONTRAIL_DATABASE_URL: in CI / local envs where the
 * Contrail PG isn't wired, the provider returns 503 by design (graceful
 * degradation), so the assertions would all fail. Skip cleanly in that case.
 */
const describeIfContrail = process.env.CONTRAIL_DATABASE_URL
  ? describe
  : describe.skip;

describeIfContrail('Contrail XRPC mount (e2e)', () => {
  const app = TESTING_APP_URL;

  it('should respond on event.listRecords', async () => {
    const res = await request(app)
      .get('/xrpc/net.openmeet.event.listRecords')
      .query({ limit: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('records');
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('should sort by rsvpsCount on event.listRecords', async () => {
    const res = await request(app)
      .get('/xrpc/net.openmeet.event.listRecords')
      .query({ sort: 'rsvpsCount', limit: 3 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('should support full-text search on event.listRecords', async () => {
    const res = await request(app)
      .get('/xrpc/net.openmeet.event.listRecords')
      .query({ search: 'meetup', limit: 3 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  it('should respond on rsvp.listRecords', async () => {
    const res = await request(app)
      .get('/xrpc/net.openmeet.rsvp.listRecords')
      .query({ limit: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('records');
  });
});

/**
 * Community XRPC routes mount only when BOTH the community block
 * (CONTRAIL_COMMUNITY_ENCRYPTION_KEY) and spaces.authority
 * (CONTRAIL_AUTHORITY_SIGNING_KEY) are configured — see
 * src/contrail/contrail.config.ts and contrail-community/src/integration.ts.
 * Every community route is service-auth gated, so an unauthenticated request
 * to a *mounted* route returns 401 ("AuthRequired"), not 404 (unmounted) or
 * 503 (provider not initialized). getHealth is the cheapest mount probe — it
 * needs no synced records, only that the integration registered its routes.
 */
const describeIfCommunity =
  process.env.CONTRAIL_DATABASE_URL &&
  process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY &&
  process.env.CONTRAIL_AUTHORITY_SIGNING_KEY
    ? describe
    : describe.skip;

describeIfCommunity('Contrail community XRPC mount (e2e)', () => {
  const app = TESTING_APP_URL;

  it('should mount community.getHealth (401 auth-gated, not 404/503)', async () => {
    const res = await request(app).get(
      '/xrpc/net.openmeet.community.getHealth',
    );

    // Mounted + provider up + no bearer token → service-auth rejects with 401.
    expect(res.status).not.toBe(404); // route would be absent if unmounted
    expect(res.status).not.toBe(503); // provider would be down without a DB
    expect(res.status).toBe(401);
  });
});

/**
 * Regression guard for the nest→Hono bridge request-body forwarding
 * (src/main.ts /xrpc middleware). That middleware runs before Nest's body
 * parsers and never calls next() for net.openmeet.*, so `req` is an
 * unconsumed readable stream that must be buffered and forwarded — otherwise
 * every POST XRPC reaches the Hono handler with an empty body and fails its
 * required-fields validation. GET routes have no body, which is why the
 * getHealth probe above never caught this.
 *
 * The discriminator: with the body DROPPED, an authenticated provision call
 * returns 400 InvalidRequest "...required". With the body FORWARDED, the same
 * call carries handle/email/password/pdsEndpoint/rotationKey past that gate
 * into the orchestrator, which reaches createAccount and fails only on the
 * deliberately-invalid invite code (502 ProvisioningFailed). Reaching
 * createAccount is positive proof the body crossed the bridge. A bad invite
 * fails before any PLC op, so no community is provisioned — the test is
 * repeatable with no accumulating PDS/PLC state.
 *
 * Needs a live PDS (account creation + service-auth mint) on top of the
 * community env, so it skips unless PDS_URL + PDS_INVITE_CODE are also set.
 */
const describeIfCommunityProvision =
  process.env.CONTRAIL_DATABASE_URL &&
  process.env.CONTRAIL_COMMUNITY_ENCRYPTION_KEY &&
  process.env.CONTRAIL_AUTHORITY_SIGNING_KEY &&
  process.env.PDS_URL &&
  process.env.PDS_INVITE_CODE
    ? describe
    : describe.skip;

describeIfCommunityProvision(
  'Contrail community POST body forwarding (e2e)',
  () => {
    const app = TESTING_APP_URL;
    const pdsUrl = TESTING_PDS_URL;
    // Endpoint the OM API server (not this test process) uses to reach the PDS.
    // On devnet that's the in-cluster address; CONTRAIL_ALLOWED_PDS_ENDPOINTS
    // gates it, so it must match one of the allowed values.
    const inContainerPdsEndpoint =
      process.env.CONTRAIL_ALLOWED_PDS_ENDPOINTS?.split(',')[0].trim() ||
      'http://pds:3000';

    const shortId = () => Math.random().toString(36).substring(2, 8);

    /** Create a throwaway PDS account and mint a community.provision-scoped
     *  service-auth JWT (aud = OM's SERVICE_DID from did.json). */
    async function mintProvisionCaller(): Promise<string> {
      const id = shortId();
      // Use the domain the PDS actually serves (.env's PDS_SERVICE_HANDLE_DOMAINS
      // can drift from the devnet PDS config — e.g. .pds.test vs .devnet.test).
      const describe = await request(pdsUrl)
        .get('/xrpc/com.atproto.server.describeServer')
        .expect(200);
      const handleDomain: string =
        describe.body.availableUserDomains?.[0] ?? TESTING_PDS_HANDLE_DOMAIN;

      const create = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createAccount')
        .set('Content-Type', 'application/json')
        .send({
          email: `bodyfwd-${id}@test.invalid`,
          handle: `bodyfwd${id}${handleDomain}`,
          password: 'test-password-123',
          inviteCode: TESTING_PDS_INVITE_CODE,
        })
        .expect(200);
      const { accessJwt } = create.body;

      const didJson = await request(app)
        .get('/.well-known/did.json')
        .expect(200);
      const serviceDid = didJson.body.id;

      const svc = await request(pdsUrl)
        .get('/xrpc/com.atproto.server.getServiceAuth')
        .query({ aud: serviceDid, lxm: 'net.openmeet.community.provision' })
        .set('Authorization', `Bearer ${accessJwt}`)
        .expect(200);
      return svc.body.token;
    }

    it('should forward the POST body across the bridge (provision reaches createAccount, not the empty-body 400)', async () => {
      const token = await mintProvisionCaller();
      const id = shortId();

      const res = await request(app)
        .post('/xrpc/net.openmeet.community.provision')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send({
          handle: `bodyfwd-tgt-${id}.devnet.test`,
          email: `bodyfwd-tgt-${id}@test.invalid`,
          password: `pw-${id}`,
          pdsEndpoint: inContainerPdsEndpoint,
          rotationKey:
            'did:key:zDnaeWVHmxYg3V8sBygjT64PRcQzCVjePBhmPrjEPngAvatvi',
          inviteCode: 'deliberately-invalid-invite',
        });

      // The empty-body bug returned 400 "...required". The body crossed if we
      // do NOT see that rejection.
      const message: string = res.body?.message ?? '';
      expect(message).not.toMatch(/required/i);
      expect(res.status).not.toBe(400);

      // Positive proof: the orchestrator received all fields and got as far as
      // createAccount, failing only on the bad invite.
      expect(res.status).toBe(502);
      expect(res.body?.error).toBe('ProvisioningFailed');
      expect(message).toMatch(/createAccount/i);
    });
  },
);
