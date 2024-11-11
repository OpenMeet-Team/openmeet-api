import request from 'supertest';
import {
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
  TESTING_APP_URL,
  TESTING_TENANT_ID,
} from '../utils/constants';

describe('Auth', () => {
  const app = TESTING_APP_URL;

  describe('Admin', () => {
    it('should successfully login via /api/v1/auth/email/login (POST)', async () => {
      const server = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);

      const req = server.post('/api/v1/auth/email/login');

      const response = await req.send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBeDefined();

      return response;
    });

    it('should be unauthorized if x-tenant-id is not provided', async () => {
      const server = request.agent(app);

      const req = server.post('/api/v1/auth/email/login');
      const response = await req.send({
        email: TESTING_ADMIN_EMAIL,
        password: TESTING_ADMIN_PASSWORD,
      });

      expect(response.status).toBe(401);
    });
  });
});
