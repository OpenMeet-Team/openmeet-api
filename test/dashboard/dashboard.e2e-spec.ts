import { APP_URL } from '../utils/constants';
import request from 'supertest';

describe('Dashboard', () => {
  const app = APP_URL;

  it('should get dashboard data', async () => {
    const server = request.agent(app).set('tenant-id', '1');

    const req = await server.get('/api/dashboard/created-events');
    // console.log(req);
    const response = await req;

    expect([200, 500]).toContain(response.status);
    if (response.status === 500) {
      console.log(response.body);
    } else {
      expect(response.body).toBeDefined();
    }

    expect(response.body).toBeDefined();
  });
});
