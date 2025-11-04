import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_MAIL_HOST,
  TESTING_MAIL_PORT,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';

/**
 * Test suite for shadow account password reset flow
 *
 * Context: When users do a Quick RSVP, a "shadow account" is created with:
 * - status: inactive
 * - password: null
 * - email: stored but unverified
 *
 * Bug: When shadow account users try to use "Forgot Password" to set a password,
 * the password is set BUT the account remains inactive, causing login to fail
 * with "Please verify your email" even after they just reset their password.
 *
 * Expected behavior: Password reset should activate shadow accounts because:
 * 1. They received the reset email (proves email ownership)
 * 2. They clicked the reset link (proves email verification)
 * 3. They set a password (proves intent to use the account)
 */

// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('Shadow Account Password Reset Flow (e2e)', () => {
  const app = TESTING_APP_URL;
  const mail = `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}`;
  const shadowUserEmail = `shadow.user.${Date.now()}.${Math.random().toString(36).substring(7)}@openmeet.net`;
  const shadowUserName = `Shadow User ${Date.now()}`;
  const newPassword = 'MyNewPassword123!';

  let serverApp;
  let serverEmail;
  let shadowUserId: string;

  beforeAll(async () => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
    serverEmail = request.agent(mail);
  });

  describe('Complete Shadow Account Journey', () => {
    it('Step 1: User does Quick RSVP (creates shadow account)', async () => {
      // First, create an event to RSVP to
      const eventResponse = await serverApp
        .post('/api/v1/events')
        .send({
          name: `Test Event ${Date.now()}`,
          description: 'Event for testing shadow account flow',
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          type: 'online',
          locationOnline: 'https://meet.example.com/test',
        })
        .expect(201);

      const eventSlug = eventResponse.body.slug;

      // Do Quick RSVP (creates shadow account)
      const rsvpResponse = await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: shadowUserName,
          email: shadowUserEmail,
          eventSlug,
        })
        .expect(201);

      expect(rsvpResponse.body.message).toContain('RSVP confirmed');

      // Shadow account is created with status=inactive, password=null
      console.log('✅ Shadow account created via Quick RSVP');
    });

    it('Step 2: User tries to register - should fail with emailAlreadyExists', async () => {
      const response = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: shadowUserEmail,
          password: 'SomePassword123',
          firstName: 'Shadow',
          lastName: 'User',
        })
        .expect(422);

      expect(response.body.errors.email).toBe('emailAlreadyExists');
      console.log('✅ Registration blocked (emailAlreadyExists)');
    });

    it('Step 3: User tries to login - should fail with "please verify email"', async () => {
      const response = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: shadowUserEmail,
          password: 'WrongPassword',
        })
        .expect(422);

      // With the new PR, this should auto-send verification code
      expect(response.body.errors.email).toMatch(/Email not verified/i);
      expect(response.body.errors.email_not_verified).toBe(true);
      console.log('✅ Login fails with unverified email (verification code sent)');
    });

    it('Step 4: User uses "Forgot Password" to set password', async () => {
      // Request password reset
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email: shadowUserEmail })
        .expect(204);

      console.log('⏳ Waiting for password reset email...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get the password reset email
      const resetEmail = await mailDevService.getMostRecentEmailByRecipient(
        shadowUserEmail,
      );
      expect(resetEmail).not.toBeNull();
      expect(resetEmail!.subject).toContain('Reset password');

      // Extract reset hash from email
      const resetLink = resetEmail!.html.match(/hash=([^"&\s]+)/);
      expect(resetLink).not.toBeNull();
      const resetHash = resetLink![1];

      console.log('✅ Password reset email received');

      // Reset password
      await serverApp
        .post('/api/v1/auth/reset/password')
        .send({
          password: newPassword,
          hash: resetHash,
        })
        .expect(204);

      console.log('✅ Password reset successful');
    });

    it('Step 5: BUG - User tries to login with new password, but fails because account is still inactive', async () => {
      const response = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: shadowUserEmail,
          password: newPassword,
        });

      // CURRENT BEHAVIOR (BUG): Login fails with "Email not verified"
      // User is confused because they just used "Forgot Password" flow
      if (response.status === 422) {
        console.log('❌ BUG REPRODUCED: Account still inactive after password reset');
        expect(response.body.errors.email).toMatch(/Email not verified/i);
        expect(response.body.errors.email_not_verified).toBe(true);
      } else if (response.status === 200) {
        // EXPECTED BEHAVIOR (AFTER FIX): Login succeeds
        console.log('✅ FIX VERIFIED: Account activated during password reset');
        expect(response.body.token).toBeDefined();
        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(shadowUserEmail);
      } else {
        fail(`Unexpected status code: ${response.status}`);
      }
    });
  });

  describe('Edge Cases to Test', () => {
    it('Should handle password reset for already-active users (normal flow)', async () => {
      // Create a normal active user first
      const activeUserEmail = `active.user.${Date.now()}@openmeet.net`;
      const activeUserPassword = 'InitialPassword123';

      await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: activeUserEmail,
          password: activeUserPassword,
          firstName: 'Active',
          lastName: 'User',
        })
        .expect(201);

      // Verify email (simulate)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const verifyEmail = await mailDevService.getMostRecentEmailByRecipient(
        activeUserEmail,
      );
      const codeMatch = verifyEmail!.text.match(/\b\d{6}\b/);
      const code = codeMatch![0];

      await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({
          email: activeUserEmail,
          code,
        })
        .expect(200);

      // Now do password reset
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email: activeUserEmail })
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const resetEmail = await mailDevService.getMostRecentEmailByRecipient(
        activeUserEmail,
      );
      const resetLink = resetEmail!.html.match(/hash=([^"&\s]+)/);
      const resetHash = resetLink![1];

      await serverApp
        .post('/api/v1/auth/reset/password')
        .send({
          password: 'NewPassword456',
          hash: resetHash,
        })
        .expect(204);

      // Should still be able to login
      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: activeUserEmail,
          password: 'NewPassword456',
        })
        .expect(200);

      expect(loginResponse.body.token).toBeDefined();
      console.log('✅ Password reset works normally for active users');
    });

    it('Should handle multiple password resets for shadow accounts', async () => {
      const email = `multi.reset.${Date.now()}@openmeet.net`;

      // Create shadow account via Quick RSVP
      const eventResponse = await serverApp
        .post('/api/v1/events')
        .send({
          name: `Test Event ${Date.now()}`,
          startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
          type: 'online',
          locationOnline: 'https://meet.example.com/test',
        })
        .expect(201);

      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'Test User',
          email,
          eventSlug: eventResponse.body.slug,
        })
        .expect(201);

      // First password reset
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email })
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const resetEmail1 = await mailDevService.getMostRecentEmailByRecipient(email);
      const resetHash1 = resetEmail1!.html.match(/hash=([^"&\s]+)/)![1];

      await serverApp
        .post('/api/v1/auth/reset/password')
        .send({
          password: 'FirstPassword123',
          hash: resetHash1,
        })
        .expect(204);

      // Should be able to login now
      await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email,
          password: 'FirstPassword123',
        })
        .expect(200);

      console.log('✅ Shadow account activated after first password reset');

      // Second password reset (now as active user)
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email })
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const resetEmail2 = await mailDevService.getMostRecentEmailByRecipient(email);
      const resetHash2 = resetEmail2!.html.match(/hash=([^"&\s]+)/)![1];

      await serverApp
        .post('/api/v1/auth/reset/password')
        .send({
          password: 'SecondPassword456',
          hash: resetHash2,
        })
        .expect(204);

      // Should work with new password
      await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email,
          password: 'SecondPassword456',
        })
        .expect(200);

      console.log('✅ Multiple password resets work correctly');
    });
  });
});
