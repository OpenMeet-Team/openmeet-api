import request from 'supertest';
import { TESTING_APP_URL } from '../utils/constants';

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
