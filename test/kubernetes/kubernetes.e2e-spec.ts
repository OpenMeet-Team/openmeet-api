import { APP_URL } from '../utils/constants';
import request from 'supertest';

const app = APP_URL;

describe('Get Kubernetes Metrics', () => {
  const server = request.agent(app);

  it.skip('should have a metrics endpoint (GET)', async () => {
    const req = server;
    const res = await req.get('/api/metrics');

    console.log('res.body', res.body);
    // TODO: fix this test
    expect(res.status).toBe(400);
    expect(res.text).toContain('http_requests_total');
  });

  it('should have liveness endpoint (GET)', async () => {
    const req = server;
    const res = await req.get('/health/liveness');
    expect(res.status).toBe(200);
    expect(res.text).toContain('"status":"ok"');
  });

  it('should have readiness endpoint (GET)', async () => {
    const req = server;
    const res = await req.get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.text).toContain('"status":"ok"');
  });
});
