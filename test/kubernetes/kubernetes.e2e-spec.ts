import { TESTING_APP_URL } from '../utils/constants';
import request from 'supertest';

const app = TESTING_APP_URL;

describe('Get Kubernetes Metrics', () => {
  const server = request.agent(app);

  it('should have a metrics endpoint (GET)', async () => {
    const req = server;
    const res = await req.get('/metrics');
    expect(res.status).toBe(200);
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
    expect(res.text).toContain('status');
  });
});
