import request from 'supertest';
import { ADMIN_EMAIL, ADMIN_PASSWORD, APP_URL } from '../utils/constants';

describe('Auth', () => {
  const app = APP_URL;

  describe('Admin', () => {
    it.skip('should successfully login via /api/v1/auth/email/login (POST)', async () => {
      const server = request.agent(app).set('tenant-id', '1');

      const req = server.post('/api/v1/auth/email/login');
      // console.log('req', req);

      const response = await req
        .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        .expect(200)
        .expect(({ body }) => {
          expect(body.token).toBeDefined();
          expect(body.user.email).toBeDefined();
          expect(body.user.role).toBeDefined();
        });
      // console.log('response', response);

      return response;
    });

    it.skip('should be unauthorized if tenant-id is not provided', async () => {
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
