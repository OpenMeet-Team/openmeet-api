import { APP_URL } from '../utils/constants';
import request from 'supertest';

const app = APP_URL;

describe('Get', () => {
  const server = request.agent(app).set('tenant-id', '1');

  it('should get all categories: /api/categories (GET)', async () => {
    const req = server;

    const res = await req.get('/api/categories');

    // console.log('res.body', res.body);
    // TODO: fix this test
    expect(res.status).toBe(200);
  });
});
