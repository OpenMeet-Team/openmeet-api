import { APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import request from 'supertest';

const app = APP_URL;

describe('Get', () => {
  const server = request.agent(app).set('tenant-id', TESTING_TENANT_ID);

  it('should get all categories: /api/categories (GET)', async () => {
    const req = server;

    const res = await req.get('/api/categories');

    expect(res.status).toBe(200);
  });
});
