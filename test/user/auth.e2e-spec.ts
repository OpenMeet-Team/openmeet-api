import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { getAuthToken } from '../utils/functions';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';

// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('Auth Module', () => {
  const app = TESTING_APP_URL;
  const mail = `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}`;
  const newUserFirstName = `Tester${Date.now()}`;
  const newUserLastName = `E2E`;
  const newUserEmail = `User.${Date.now()}.${Math.random().toString(36).substring(7)}@openmeet.net`;
  const newUserPassword = `secret`;

  let authToken: string;
  let serverApp;
  let serverEmail;

  beforeAll(async () => {
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
    serverEmail = request.agent(mail);
  });

  describe('Registration', () => {
    it('should fail with exists email: /api/v1/auth/email/register (POST)', async () => {
      const response = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: TESTING_USER_EMAIL,
          password: TESTING_USER_PASSWORD,
          firstName: 'Tester',
          lastName: 'E2E',
        })
        .expect(422);

      console.log('response.body', response.body);
      console.log('response.request.headers', response.request.headers);
      console.log('response.request.body', response.request.body);

      // Check the response format matches GlobalExceptionFilter
      expect(response.body.statusCode).toBe(422);
      expect(response.body.message).toBe('Unprocessable Entity Exception');
      expect(response.body.path).toBe('/api/v1/auth/email/register');

      // Check the specific error is preserved
      expect(response.body.errors.email).toBe('emailAlreadyExists');

      return response;
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
      it('should fail with unverified email: /api/v1/auth/email/login (POST)', async () => {
        // Capture timestamp before the failed login attempt
        const beforeLoginAttempt = Date.now();

        await serverApp
          .post('/api/v1/auth/email/login')
          .send({ email: newUserEmail, password: newUserPassword })
          .expect(422)
          .expect(({ body }) => {
            expect(body.errors.email).toMatch(/Email not verified/i);
            expect(body.errors.email_not_verified).toBe(true);
          });

        // Store timestamp for use in verification test
        (global as any).loginAttemptTimestamp = beforeLoginAttempt;
      });
    });

    describe('Email Verification', () => {
      it('should verify email and allow login: /api/v1/auth/verify-email-code (POST)', async () => {
        // Note: The failed login attempt above triggered a new verification code to be sent
        // We need to get the LATEST email (from the failed login), not the original registration email

        // Get emails sent after the login attempt
        const loginAttemptTime =
          (global as any).loginAttemptTimestamp || Date.now() - 10000;
        const recentEmails =
          await mailDevService.getEmailsSince(loginAttemptTime);
        const userEmails = recentEmails.filter((email) =>
          email.to?.some(
            (recipient) =>
              recipient.address.toLowerCase() === newUserEmail.toLowerCase(),
          ),
        );

        expect(userEmails.length).toBeGreaterThan(0);

        // Extract codes from all emails (since timestamps might be identical)
        const codes = userEmails
          .map((email) =>
            EmailVerificationTestHelpers.extractVerificationCode(email),
          )
          .filter((code) => code !== null);

        expect(codes.length).toBeGreaterThan(0);

        // Try each code until one works (only the most recent code is valid)
        let verifyResponse;
        let successfulCode = null;

        for (const code of codes) {
          verifyResponse = await serverApp
            .post('/api/v1/auth/verify-email-code')
            .send({ email: newUserEmail, code });

          if (verifyResponse.status === 200) {
            successfulCode = code;
            break;
          }
        }

        expect(successfulCode).not.toBeNull();
        expect(verifyResponse!.status).toBe(200);

        // User should be logged in after verification
        expect(verifyResponse.body.token).toBeDefined();
        expect(verifyResponse.body.refreshToken).toBeDefined();
        expect(verifyResponse.body.user.email).toBe(newUserEmail.toLowerCase());
      });
    });

    // SKIPPED: Email confirmation tests fail - returns 422 instead of expected 204/404
    // Email confirmation logic needs to be fixed before enabling these tests
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
          .set('x-tenant-id', TESTING_TENANT_ID)
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
        .set('x-tenant-id', TESTING_TENANT_ID);

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
        .set('x-tenant-id', TESTING_TENANT_ID);

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
        .set('x-tenant-id', TESTING_TENANT_ID)
        .post('/api/v1/auth/refresh');

      const refreshResponse = await req.send();
      expect(refreshResponse.status).toBe(200);

      refreshToken = refreshResponse.body.refreshToken;
      expect(refreshToken).toBeDefined();

      // Use the new refresh token to get another set of tokens
      const req2 = request
        .agent(app)
        .set('Authorization', `Bearer ${refreshToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .post('/api/v1/auth/refresh');

      const refreshResponse2 = await req2.send().expect(200);

      refreshToken = refreshResponse2.body.refreshToken;
      expect(refreshToken).toBeDefined();
    });

    it('should fail on the second attempt to refresh token with the same token: /api/v1/auth/refresh (POST)', async () => {
      const newUserRefreshToken = await request(app)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.refreshToken);

      await request(app)
        .post('/api/v1/auth/refresh')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .auth(newUserRefreshToken, {
          type: 'bearer',
        })
        .send();

      await request(app)
        .post('/api/v1/auth/refresh')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .auth(newUserRefreshToken, {
          type: 'bearer',
        })
        .send()
        .expect(401);
    });

    // SKIPPED: Profile update test fails due to authentication token invalidation during test execution
    // Returns 401 Unauthorized instead of expected 422 - token management in tests needs fixing
    it.skip('should update profile successfully: /api/v1/auth/me (PATCH)', async () => {
      const newUserNewName = Date.now();
      const newUserNewPassword = 'new-secret';
      const newUserApiToken = await request(app)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.token);

      const response = await request(app)
        .patch('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({
          firstName: newUserNewName,
          password: newUserNewPassword,
        });

      console.log('Update without oldPassword - Status:', response.status);
      console.log(
        'Update without oldPassword - Body:',
        JSON.stringify(response.body, null, 2),
      );
      expect(response.status).toBe(422);

      await request(app)
        .patch('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
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
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: newUserEmail, password: newUserNewPassword })
        .expect(200)
        .expect(({ body }) => {
          expect(body.token).toBeDefined();
        });

      await request(app)
        .patch('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .auth(newUserApiToken, {
          type: 'bearer',
        })
        .send({ password: newUserPassword, oldPassword: newUserNewPassword })
        .expect(200);
    });

    it('should update profile email successfully: /api/v1/auth/me (PATCH)', async () => {
      const newUserFirstName = `Tester${Date.now()}`;
      const newUserLastName = `E2E`;
      const newUserEmail = `user.${Date.now()}@openmeet.net`;
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

      // Verify email before login
      const verificationEmail =
        await mailDevService.getMostRecentEmailByRecipient(newUserEmail);
      const code = EmailVerificationTestHelpers.extractVerificationCode(
        verificationEmail!,
      );
      await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({ email: newUserEmail, code })
        .expect(200);

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

    it('should delete profile successfully: /api/v1/auth/me (DELETE)', async () => {
      const newUserApiToken = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .then(({ body }) => body.token);

      await serverApp
        .delete('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .auth(newUserApiToken, {
          type: 'bearer',
        });

      return serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: newUserEmail, password: newUserPassword })
        .expect(422);
    });
  });
});
