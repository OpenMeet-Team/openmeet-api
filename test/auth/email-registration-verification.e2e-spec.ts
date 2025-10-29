import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';

jest.setTimeout(60000);

describe('Email Registration Verification (e2e)', () => {
  const app = TESTING_APP_URL;

  describe('Registration Flow', () => {
    it('should create INACTIVE user and send verification email (no login)', async () => {
      const email = `test-${Date.now()}@example.com`;

      // Register new user
      const response = await request(app)
        .post('/api/v1/auth/email/register')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'Pass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // ASSERT: No tokens returned (user not logged in)
      expect(response.body.token).toBeUndefined();
      expect(response.body.refreshToken).toBeUndefined();

      // ASSERT: Response indicates email verification needed
      expect(response.body.message).toMatch(/verify/i);

      // ASSERT: Verification email sent
      const emails = await mailDevService.getEmailsByRecipient(email);
      expect(emails.length).toBeGreaterThan(0);

      const verificationEmail = await mailDevService.getMostRecentEmailByRecipient(email);
      expect(verificationEmail).not.toBeNull();

      // ASSERT: Email contains 6-digit verification code
      EmailVerificationTestHelpers.assertHasVerificationCode(verificationEmail!);
      EmailVerificationTestHelpers.assertSentTo(verificationEmail!, email);
    });

    it('should NOT allow login with unverified account', async () => {
      // Create unverified user
      const email = `test-${Date.now()}@example.com`;
      await request(app)
        .post('/api/v1/auth/email/register')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'Pass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Try to login with unverified account
      const response = await request(app)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email, password: 'Pass123!' })
        .expect(422);

      // ASSERT: Error message mentions verification
      expect(response.body.errors.email).toMatch(/verify/i);
    });

    it('should verify email and activate user account', async () => {
      // Register new user
      const email = `test-${Date.now()}@example.com`;
      await request(app)
        .post('/api/v1/auth/email/register')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'Pass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Get verification code from email
      const verificationEmail = await mailDevService.getMostRecentEmailByRecipient(email);
      expect(verificationEmail).not.toBeNull();

      const code = EmailVerificationTestHelpers.extractVerificationCode(verificationEmail!);
      expect(code).not.toBeNull();

      // Verify email with code
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email, code })
        .expect(200);

      // ASSERT: User is now logged in (tokens returned)
      expect(verifyResponse.body.token).toBeDefined();
      expect(verifyResponse.body.refreshToken).toBeDefined();
      expect(verifyResponse.body.user.email).toBe(email);

      // ASSERT: Can now login normally
      const loginResponse = await request(app)
        .post('/api/v1/auth/email/login')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email, password: 'Pass123!' })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      expect(loginResponse.body.user.email).toBe(email);
    });

    it('should reject invalid verification code', async () => {
      // Register new user
      const email = `test-${Date.now()}@example.com`;
      await request(app)
        .post('/api/v1/auth/email/register')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email,
          password: 'Pass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Try to verify with wrong code
      const response = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email, code: '000000' })
        .expect(422);

      // ASSERT: Error message indicates invalid code
      expect(response.body.errors.code).toMatch(/invalid|code/i);
    });

    it('should reject verification code for wrong email', async () => {
      // Register first user
      const email1 = `test-${Date.now()}@example.com`;
      await request(app)
        .post('/api/v1/auth/email/register')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          email: email1,
          password: 'Pass123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      // Get code for first user
      const verificationEmail = await mailDevService.getMostRecentEmailByRecipient(email1);
      const code = EmailVerificationTestHelpers.extractVerificationCode(verificationEmail!);

      // Try to use code with different email
      const email2 = `other-${Date.now()}@example.com`;
      const response = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: email2, code })
        .expect(422);

      // ASSERT: Error indicates code doesn't match
      expect(response.body.errors.code).toMatch(/invalid|code/i);
    });
  });
});
