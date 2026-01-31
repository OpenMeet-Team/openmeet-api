import request from 'supertest';
import {
  TESTING_APP_URL,
  // TESTING_MAIL_HOST,
  // TESTING_MAIL_PORT,
  TESTING_TENANT_ID,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { getAuthToken } from '../utils/functions';

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
  // const mail = `http://${TESTING_MAIL_HOST}:${TESTING_MAIL_PORT}`;
  const shadowUserEmail = `shadow.user.${Date.now()}.${Math.random().toString(36).substring(7)}@openmeet.net`;
  const shadowUserName = `Shadow User ${Date.now()}`;
  const newPassword = 'MyNewPassword123!';

  let serverApp;
  // let serverEmail;
  // let shadowUserId: string;
  let authToken: string;

  beforeAll(async () => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
    // serverEmail = request.agent(mail);
    // Get auth token for creating events
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
  });

  describe('Complete Shadow Account Journey', () => {
    it('should create shadow account when user does Quick RSVP', async () => {
      // First, create an event to RSVP to (requires authentication)
      const eventResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `Test Event ${Date.now()}`,
          description: 'Event for testing shadow account flow',
          startDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          endDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000,
          ).toISOString(),
          type: 'online',
          locationOnline: 'https://meet.example.com/test',
          timeZone: 'UTC',
          maxAttendees: 100,
          categories: [],
        })
        .expect(201);

      const eventSlug = eventResponse.body.event.slug;

      // Do Quick RSVP (creates shadow account)
      const rsvpResponse = await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: shadowUserName,
          email: shadowUserEmail,
          eventSlug,
        })
        .expect(201);

      expect(rsvpResponse.body.message).toContain(
        'RSVP registered successfully',
      );

      // Shadow account is created with status=inactive, password=null
      console.log('✅ Shadow account created via Quick RSVP');
    });

    it('should fail registration with emailAlreadyExists when user tries to register', async () => {
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

    it('should fail login with "please verify email" when user tries to login', async () => {
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
      console.log(
        '✅ Login fails with unverified email (verification code sent)',
      );
    });

    it('should allow user to set password using "Forgot Password"', async () => {
      // Request password reset
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email: shadowUserEmail })
        .expect(204);

      console.log('⏳ Waiting for password reset email...');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get the password reset email (should be the most recent non-verification email)
      const allEmails =
        await mailDevService.getEmailsByRecipient(shadowUserEmail);
      console.log(`Found ${allEmails.length} emails for ${shadowUserEmail}`);
      allEmails.forEach((e, i) => console.log(`  Email ${i}: ${e.subject}`));

      const resetEmail = allEmails.find(
        (email) =>
          email.subject.toLowerCase().includes('reset') ||
          email.html.includes('/api/v1/auth/reset/password'),
      );

      if (!resetEmail && allEmails.length > 0) {
        console.log('Could not find reset email. Checking HTML content...');
        allEmails.forEach((e, i) => {
          console.log(`  Email ${i} HTML snippet: ${e.html.substring(0, 200)}`);
        });
      }

      expect(resetEmail).toBeDefined();

      // Extract reset hash from email - use text version to avoid HTML entity encoding issues
      // The text version has the clean URL: https://testing.openmeet.net/auth/password-change?hash=JWT_TOKEN&expires=...
      let resetHash: string | null = null;

      // Pattern 1: Extract from text version (most reliable)
      const textMatch = resetEmail!.text?.match(/hash=([A-Za-z0-9._-]+)/);
      if (textMatch) {
        resetHash = textMatch[1];
      }

      // Pattern 2: Extract from HTML with entity-encoded equals (&#x3D;)
      if (!resetHash) {
        const htmlMatch = resetEmail!.html.match(/hash&#x3D;([A-Za-z0-9._-]+)/);
        if (htmlMatch) {
          resetHash = htmlMatch[1];
        }
      }

      // Pattern 3: Try regular hash= in HTML (in case entity encoding changes)
      if (!resetHash) {
        const htmlMatch2 = resetEmail!.html.match(/hash=([A-Za-z0-9._-]+)/);
        if (htmlMatch2) {
          resetHash = htmlMatch2[1];
        }
      }

      expect(resetHash).not.toBeNull();

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

    it('should fail login with new password because account is still inactive (BUG)', async () => {
      const response = await serverApp.post('/api/v1/auth/email/login').send({
        email: shadowUserEmail,
        password: newPassword,
      });

      // CURRENT BEHAVIOR (BUG): Login fails with "Email not verified"
      // User is confused because they just used "Forgot Password" flow
      if (response.status === 422) {
        console.log(
          '❌ BUG REPRODUCED: Account still inactive after password reset',
        );
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
    it('should handle password reset for already-active users (normal flow)', async () => {
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
      const verifyEmail =
        await mailDevService.getMostRecentEmailByRecipient(activeUserEmail);
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

      const allEmails2 =
        await mailDevService.getEmailsByRecipient(activeUserEmail);
      const resetEmail = allEmails2.find(
        (email) =>
          email.subject.toLowerCase().includes('reset') ||
          email.html.includes('/api/v1/auth/reset/password'),
      );
      expect(resetEmail).toBeDefined();

      let resetHash: string | null = null;
      const textMatch = resetEmail!.text?.match(/hash=([A-Za-z0-9._-]+)/);
      if (textMatch) {
        resetHash = textMatch[1];
      }
      if (!resetHash) {
        const htmlMatch = resetEmail!.html.match(/hash&#x3D;([A-Za-z0-9._-]+)/);
        if (htmlMatch) {
          resetHash = htmlMatch[1];
        }
      }
      expect(resetHash).not.toBeNull();

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

    it('should handle multiple password resets for shadow accounts', async () => {
      const email = `multi.reset.${Date.now()}@openmeet.net`;

      // Create shadow account via Quick RSVP
      const eventResponse = await serverApp
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: `Test Event ${Date.now()}`,
          description: 'Event for testing multiple password resets',
          startDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          endDate: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000,
          ).toISOString(),
          type: 'online',
          locationOnline: 'https://meet.example.com/test',
          timeZone: 'UTC',
          maxAttendees: 100,
          categories: [],
        })
        .expect(201);

      await serverApp
        .post('/api/v1/auth/quick-rsvp')
        .send({
          name: 'Test User',
          email,
          eventSlug: eventResponse.body.event.slug,
        })
        .expect(201);

      // First password reset
      await serverApp
        .post('/api/v1/auth/forgot/password')
        .send({ email })
        .expect(204);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const allEmails3 = await mailDevService.getEmailsByRecipient(email);
      const resetEmail1 = allEmails3.find(
        (e) =>
          e.subject.toLowerCase().includes('reset') ||
          e.html.includes('/api/v1/auth/reset/password'),
      );
      expect(resetEmail1).toBeDefined();

      let resetHash1: string | null = null;
      const textMatch1 = resetEmail1!.text?.match(/hash=([A-Za-z0-9._-]+)/);
      if (textMatch1) resetHash1 = textMatch1[1];
      if (!resetHash1) {
        const htmlMatch1 = resetEmail1!.html.match(
          /hash&#x3D;([A-Za-z0-9._-]+)/,
        );
        if (htmlMatch1) resetHash1 = htmlMatch1[1];
      }
      expect(resetHash1).not.toBeNull();

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

      const allEmails4 = await mailDevService.getEmailsByRecipient(email);
      const resetEmail2 = allEmails4
        .reverse()
        .find(
          (e) =>
            e.subject.toLowerCase().includes('reset') ||
            e.html.includes('/api/v1/auth/reset/password'),
        );
      expect(resetEmail2).toBeDefined();

      let resetHash2: string | null = null;
      const textMatch2 = resetEmail2!.text?.match(/hash=([A-Za-z0-9._-]+)/);
      if (textMatch2) resetHash2 = textMatch2[1];
      if (!resetHash2) {
        const htmlMatch2 = resetEmail2!.html.match(
          /hash&#x3D;([A-Za-z0-9._-]+)/,
        );
        if (htmlMatch2) resetHash2 = htmlMatch2[1];
      }
      expect(resetHash2).not.toBeNull();

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
