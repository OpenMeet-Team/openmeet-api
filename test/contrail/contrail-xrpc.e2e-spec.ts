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
 */
describe('Contrail XRPC mount (e2e)', () => {
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
