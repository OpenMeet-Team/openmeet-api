import request from 'supertest';
import {
  APP_URL,
  TESTER_EMAIL,
  TESTER_PASSWORD,
  MAIL_HOST,
  MAIL_PORT,
} from '../utils/constants';
import { getAuthToken } from '../utils/functions';
describe('Auth Module', () => {
  const app = APP_URL;
  const mail = `http://${MAIL_HOST}:${MAIL_PORT}`;
  const newUserFirstName = `Tester${Date.now()}`;
  const newUserLastName = `E2E`;
  const newUserEmail = `User.${Date.now()}@example.com`;
  const newUserPassword = `secret`;

  let authToken: string;
  let serverApp;
  let serverEmail;

  beforeAll(async () => {
    authToken = await getAuthToken(app, TESTER_EMAIL, TESTER_PASSWORD);
    serverApp = request.agent(app).set('tenant-id', '1');
    serverEmail = request.agent(mail);
  });

  describe('Registration', () => {
    it('should fail with exists email: /api/v1/auth/email/register (POST)', () => {
      return serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: TESTER_EMAIL,
          password: TESTER_PASSWORD,
          firstName: 'Tester',
          lastName: 'E2E',
        })
        .expect(422)
        .expect(({ body }) => {
          expect(body.errors.email).toBeDefined();
        });
    });

    it('should successfully: /api/v1/auth/email/register (POST)', () => {
      return serverApp
        .post('/api/v1/auth/email/register')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
        })
        .expect(201);
    });

    describe('Login', () => {
      it('should successfully with unconfirmed email: /api/v1/auth/email/login (POST)', () => {
        return serverApp
          .post('/api/v1/auth/email/login')
          .send({ email: newUserEmail, password: newUserPassword })
          .expect(200)
          .expect(({ body }) => {
            expect(body.token).toBeDefined();
          });
      });
    });

    describe.skip('Confirm email', () => {
      it('should successfully: /api/v1/auth/email/confirm (POST)', async () => {
        const response = await serverEmail.get('/email');

        const hash = response.body
          .find(
            (letter) =>
              letter.to[0].address.toLowerCase() ===
                newUserEmail.toLowerCase() &&
              /.*confirm\-email\?hash\=(\S+).*/g.test(letter.text),
          )
          ?.text.replace(/.*confirm\-email\?hash\=(\S+).*/g, '$1');
        return serverApp
          .set('Authorization', `Bearer ${authToken}`)
          .post('/api/v1/auth/email/confirm')
          .send({
            hash,
          })
          .expect(204);
      });

      it('should fail for already confirmed email: /api/v1/auth/email/confirm (POST)', async () => {
        const hash = await request(mail)
          .get('/email')
          .then(({ body }) =>
            body
              .find(
                (letter) =>
                  letter.to[0].address.toLowerCase() ===
                    newUserEmail.toLowerCase() &&
                  /.*confirm\-email\?hash\=(\S+).*/g.test(letter.text),
              )
              ?.text.replace(/.*confirm\-email\?hash\=(\S+).*/g, '$1'),
          );

        return request(app)
          .post('/api/v1/auth/email/confirm')
          .send({
            hash,
          })
          .expect(404);
      });
    });
  });

  describe('Login', () => {
    it('should successfully for user with confirmed email: /api/v1/auth/email/login (POST)', async () => {
      const req = serverApp
        .post('/api/v1/auth/email/login')
        .set('tenant-id', '1');

      const response = await req.send({
        email: newUserEmail,
        password: newUserPassword,
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.tokenExpires).toBeDefined();
      expect(response.body.user.email).toBeDefined();
      expect(response.body.user.hash).not.toBeDefined();
      expect(response.body.user.password).not.toBeDefined();
      expect(response.body.user.previousPassword).not.toBeDefined();
    });
  });

  describe('Logged in user', () => {
    let newUserApiToken: string;
    beforeAll(async () => {
      newUserApiToken = await getAuthToken(app, newUserEmail, newUserPassword);
    });

    it('should retrieve your own profile: /api/v1/auth/me (GET)', async () => {
      const server = request
        .agent(app)
        .set('Authorization', `Bearer ${newUserApiToken}`)
        .set('tenant-id', '1');

      const req = server.get('/api/v1/auth/me');
      const response = await req.send();

      expect(response.status).toBe(200);
      expect(response.body.provider).toBeDefined();
      expect(response.body.email).toBeDefined();
      expect(response.body.hash).not.toBeDefined();
      expect(response.body.password).not.toBeDefined();
      expect(response.body.previousPassword).not.toBeDefined();
    });

    it('should get new refresh token: /api/v1/auth/refresh (POST)', async () => {
      // Get initial refresh token
      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .expect(200);

      let refreshToken = loginResponse.body.refreshToken;
      expect(refreshToken).toBeDefined();

      // Use the refresh token to get a new one
      const req = request
        .agent(app)
        .set('Authorization', `Bearer ${refreshToken}`)
        .set('tenant-id', '1')
        .post('/api/v1/auth/refresh');

      const refreshResponse = await req.send();

      console.log('Refresh response:', refreshResponse.body);

      expect(refreshResponse.status).toBe(200);

      refreshToken = refreshResponse.body.refreshToken;
      expect(refreshToken).toBeDefined();

      // Use the new refresh token to get another set of tokens
      const req2 = request
        .agent(app)
        .set('Authorization', `Bearer ${refreshToken}`)
        .set('tenant-id', '1')
        .post('/api/v1/auth/refresh');

      const refreshResponse2 = await req2.send().expect(200);

      refreshToken = refreshResponse2.body.refreshToken;
      expect(refreshToken).toBeDefined();
    });

    it('should fail on the second attempt to refresh token with the same token: /api/v1/auth/refresh (POST)', async () => {
      const newUserRefreshToken = await request(app)
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.refreshToken);

      await request(app)
        .post('/api/v1/auth/refresh')
        .auth(newUserRefreshToken, {
          type: 'bearer',
        })
        .send();

      await request(app)
        .post('/api/v1/auth/refresh')
        .auth(newUserRefreshToken, {
          type: 'bearer',
        })
        .send()
        .expect(401);
    });

    it.skip('should update profile successfully: /api/v1/auth/me (PATCH)', async () => {
      const newUserNewName = Date.now();
      const newUserNewPassword = 'new-secret';
      const newUserApiToken = await request(app)
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.token);

      await request(app)
        .patch('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({
          firstName: newUserNewName,
          password: newUserNewPassword,
        })
        .expect(422);

      await request(app)
        .patch('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({
          firstName: newUserNewName,
          password: newUserNewPassword,
          oldPassword: newUserPassword,
        })
        .expect(200);

      await request(app)
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserNewPassword })
        .expect(200)
        .expect(({ body }) => {
          expect(body.token).toBeDefined();
        });

      await request(app)
        .patch('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({ password: newUserPassword, oldPassword: newUserNewPassword })
        .expect(200);
    });

    // I believe this to be a bug, -tom
    it.skip('should update profile email successfully: /api/v1/auth/me (PATCH)', async () => {
      const newUserFirstName = `Tester${Date.now()}`;
      const newUserLastName = `E2E`;
      const newUserEmail = `user.${Date.now()}@example.com`;
      const newUserPassword = `secret`;
      const newUserNewEmail = `new.${newUserEmail}`;

      await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: newUserFirstName,
          lastName: newUserLastName,
        })
        .expect(201);

      const newUserApiToken = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.token);

      await serverApp
        .patch('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({
          email: newUserNewEmail,
        })
        .expect(200);

      const hash = await serverEmail.get('/email').then(({ body }) =>
        body
          .find((letter) => {
            return (
              letter.to[0].address.toLowerCase() ===
                newUserNewEmail.toLowerCase() &&
              /.*confirm\-new\-email\?hash\=(\S+).*/g.test(letter.text)
            );
          })
          ?.text.replace(/.*confirm\-new\-email\?hash\=(\S+).*/g, '$1'),
      );

      await serverApp
        .get('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body.email).not.toBe(newUserNewEmail);
        });

      await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserNewEmail, password: newUserPassword })
        .expect(422);

      await serverApp
        .post('/api/v1/auth/email/confirm/new')
        .send({
          hash,
        })
        .expect(204);

      await serverApp
        .get('/api/v1/auth/me')
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body.email).toBe(newUserNewEmail);
        });

      await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserNewEmail, password: newUserPassword })
        .expect(200);
    });

    it.skip('should delete profile successfully: /api/v1/auth/me (DELETE)', async () => {
      const newUserApiToken = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.token);

      await serverApp.delete('/api/v1/auth/me').auth(newUserApiToken, {
        type: 'bearer',
      });

      return serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .expect(422);
    });
  });
});
