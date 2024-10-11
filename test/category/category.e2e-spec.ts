import { APP_URL } from '../utils/constants';
import request from 'supertest';

const app = APP_URL;

describe('Get', () => {
  const server = request.agent(app).set('tenant-id', '1');

  // failing in Tom's local. TODO: fix this
  it.skip('should get all categories: /api/categories (GET)', async () => {
    const req = server;

    const res = await req.get('/api/categories');

    console.log('res.body', res.body);
    expect(res.status).toBe(200);
  });
});
