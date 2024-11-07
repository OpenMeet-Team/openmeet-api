import request from 'supertest';
import { ADMIN_EMAIL, ADMIN_PASSWORD, APP_URL } from '../utils/constants';

describe('Auth', () => {
  const app = APP_URL;

  describe('Admin', () => {
    it('should successfully login via /api/v1/auth/email/login (POST)', async () => {
      const server = request.agent(app).set('x-tenant-id', '1');

      const req = server.post('/api/v1/auth/email/login');

      const response = await req
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200);

      expect(response.body.token).toBeDefined();
      expect(response.body.user.email).toBeDefined();

      return response;
    });

    it('should be unauthorized if x-tenant-id is not provided', async () => {
      const server = request.agent(app);

      const req = server.post('/api/v1/auth/email/login');
      const response = await req.send({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      expect(response.status).toBe(401);
    });
  });
});
