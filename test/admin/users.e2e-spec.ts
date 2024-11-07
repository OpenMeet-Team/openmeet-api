import { APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from '../utils/constants';
import request from 'supertest';
import { RoleEnum } from '../../src/role/role.enum';
import { StatusEnum } from '../../src/status/status.enum';

describe('Users Module', () => {
  const app = APP_URL;
  let apiToken;

  beforeAll(async () => {
    await request(app)
      .post('/api/v1/auth/email/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .then(({ body }) => {
        apiToken = body.token;
      });
  });

  describe('Update', () => {
    let newUser;
    const server = request.agent(app).set('x-tenant-id', '1');

    const newUserEmail = `user-first.${Date.now()}@example.com`;
    const newUserChangedEmail = `user-first-changed.${Date.now()}@example.com`;
    const newUserPassword = `secret`;
    const newUserChangedPassword = `new-secret`;

    beforeAll(async () => {
      await server.post('/api/v1/auth/email/register').send({
        email: newUserEmail,
        password: newUserPassword,
        firstName: `First${Date.now()}`,
        lastName: 'E2E',
      });

      await server
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => {
          newUser = body.user;
        });
    });

    describe('User with "Admin" role', () => {
      it.skip('should change password for existing user: /api/v1/users/:id (PATCH)', () => {
        return server
          .patch(`/api/v1/users/${newUser.id}`)
          .auth(apiToken, {
            type: 'bearer',
          })
          .send({
            email: newUserChangedEmail,
            password: newUserChangedPassword,
          })
          .expect(200);
      });

      describe('Guest', () => {
        it.skip('should login with changed password: /api/v1/auth/email/login (POST)', () => {
          const req = server.post('/api/v1/auth/email/login');

          console.log('req', req);
          const response = req.send({
            email: newUserChangedEmail,
            password: newUserChangedPassword,
          });

          console.log('response', response);
          return response.expect(200).expect(({ body }) => {
            expect(body.token).toBeDefined();
          });
        });
      });
    });
  });

  describe('Create', () => {
    const newUserByAdminEmail = `user-created-by-admin.${Date.now()}@example.com`;
    const newUserByAdminPassword = `secret`;
    const server = request.agent(app).set('x-tenant-id', '1');

    describe('User with "Admin" role', () => {
      it.skip('should fail to create new user with invalid email: /api/v1/users (POST)', () => {
        return server
          .post(`/api/v1/users`)
          .auth(apiToken, {
            type: 'bearer',
          })
          .send({ email: 'fail-data' })
          .expect(422);
      });

      it.skip('should successfully create new user: /api/v1/users (POST)', () => {
        return server
          .post(`/api/v1/users`)
          .auth(apiToken, {
            type: 'bearer',
          })
          .send({
            email: newUserByAdminEmail,
            password: newUserByAdminPassword,
            firstName: `UserByAdmin${Date.now()}`,
            lastName: 'E2E',
            role: {
              id: RoleEnum.user,
            },
            status: {
              id: StatusEnum.active,
            },
          })
          .expect(201);
      });

      describe('Guest', () => {
        it.skip('should successfully login via created by admin user: /api/v1/auth/email/login (GET)', () => {
          return server
            .post('/api/v1/auth/email/login')
            .send({
              email: newUserByAdminEmail,
              password: newUserByAdminPassword,
            })
            .expect(200)
            .expect(({ body }) => {
              expect(body.token).toBeDefined();
            });
        });
      });
    });
  });

  describe('Get many', () => {
    const server = request.agent(app).set('x-tenant-id', '1');

    describe('User with "Admin" role', () => {
      it.skip('should get list of users: /api/v1/users (GET)', () => {
        return server
          .get(`/api/v1/users`)
          .auth(apiToken, {
            type: 'bearer',
          })
          .expect(200)
          .send()
          .expect(({ body }) => {
            expect(body.data[0].provider).toBeDefined();
            expect(body.data[0].email).toBeDefined();
            expect(body.data[0].hash).not.toBeDefined();
            expect(body.data[0].password).not.toBeDefined();
            expect(body.data[0].previousPassword).not.toBeDefined();
          });
      });
    });
  });
});
