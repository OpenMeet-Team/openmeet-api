import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_PDS_URL,
  TESTING_PDS_HANDLE_DOMAIN,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';

/**
 * AT Protocol Handle Change E2E Tests
 *
 * Tests the handle change flow for users with custodial identities on our PDS:
 * 1. Create email user (gets custodial identity)
 * 2. Change handle via API
 * 3. Verify handle updated in response and on PDS
 *
 * Prerequisites:
 * - PDS and PLC containers must be running
 * - Valid PDS_INVITE_CODE in .env
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-handle-change
 */

jest.setTimeout(120000);

describe('AT Protocol Handle Change (e2e)', () => {
  const app = TESTING_APP_URL;
  const pdsUrl = TESTING_PDS_URL;
  const handleDomain = TESTING_PDS_HANDLE_DOMAIN;

  // Generate unique user for this test run
  const testRunId = Date.now();
  const shortId = () => Math.random().toString(36).substring(2, 8);
  const newUserEmail = `handle-test-${testRunId}@openmeet.net`;
  const newUserPassword = 'testpassword123';

  let serverApp: request.SuperAgentTest;
  let userToken: string;
  let originalHandle: string;
  let userDid: string;

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  const waitForBackend = (ms = 1000): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  describe('Setup: Create user with custodial identity', () => {
    it('should register and verify email user', async () => {
      // Register
      const registerResponse = await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: newUserEmail,
          password: newUserPassword,
          firstName: 'Handle',
          lastName: `Test${testRunId}`,
        });

      expect(registerResponse.status).toBe(201);

      // Wait for verification email
      await waitForBackend(2000);

      // Get verification code
      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === newUserEmail.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );
      expect(verificationEmail).toBeDefined();

      const verificationCode =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
      expect(verificationCode).toBeDefined();

      // Verify email
      await serverApp.post('/api/v1/auth/verify-email-code').send({
        email: newUserEmail,
        code: verificationCode,
      });

      // Login
      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({
          email: newUserEmail,
          password: newUserPassword,
        });

      expect(loginResponse.status).toBe(200);
      userToken = loginResponse.body.token;
    });

    it('should have custodial AT Protocol identity', async () => {
      // Wait for async PDS account creation
      await waitForBackend(3000);

      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${userToken}`);

      expect(identityResponse.status).toBe(200);

      const identity = identityResponse.body;
      if (!identity?.did) {
        console.warn('No AT Protocol identity - PDS may not be configured');
        return;
      }

      expect(identity.isCustodial).toBe(true);
      expect(identity.isOurPds).toBe(true);
      expect(identity.handle).toMatch(new RegExp(`${handleDomain}$`));

      originalHandle = identity.handle;
      userDid = identity.did;

      console.log(
        `User has custodial identity: ${userDid} (${originalHandle})`,
      );
    });
  });

  describe('Handle Change', () => {
    it('should change handle successfully', async () => {
      if (!userDid) {
        console.warn('Skipping - no AT Protocol identity');
        return;
      }

      // Use timestamp suffix + random for uniqueness (max 18 chars before domain)
      const newHandle = `c${String(testRunId).slice(-6)}${shortId()}${handleDomain}`;

      const response = await serverApp
        .post('/api/atproto/identity/update-handle')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ handle: newHandle });

      expect(response.status).toBe(200);
      expect(response.body.handle).toBe(newHandle);
      expect(response.body.did).toBe(userDid);

      console.log(`Handle changed: ${originalHandle} -> ${newHandle}`);

      // Verify the new handle resolves on PDS (give PDS time to propagate)
      await waitForBackend(3000);

      const resolveResponse = await request(pdsUrl)
        .get('/xrpc/com.atproto.identity.resolveHandle')
        .query({ handle: newHandle });

      expect(resolveResponse.status).toBe(200);
      expect(resolveResponse.body.did).toBe(userDid);

      console.log(
        `Handle ${newHandle} resolves to ${resolveResponse.body.did}`,
      );
    });

    it('should reject handle change to invalid domain', async () => {
      if (!userDid) {
        console.warn('Skipping - no AT Protocol identity');
        return;
      }

      const response = await serverApp
        .post('/api/atproto/identity/update-handle')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ handle: 'test.bsky.social' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Handle must end with/);
    });

    it('should reject handle change to already taken handle', async () => {
      if (!userDid) {
        console.warn('Skipping - no AT Protocol identity');
        return;
      }

      // Try to change to the original handle (which is now free since we changed away from it)
      // First, create another user to take a handle
      const otherEmail = `handle-other-${testRunId}@openmeet.net`;

      // Register other user
      await serverApp.post('/api/v1/auth/email/register').send({
        email: otherEmail,
        password: newUserPassword,
        firstName: 'Other',
        lastName: 'User',
      });

      await waitForBackend(2000);

      // Get and verify other user
      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === otherEmail.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );

      const code =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);

      await serverApp.post('/api/v1/auth/verify-email-code').send({
        email: otherEmail,
        code,
      });

      const otherLogin = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: otherEmail, password: newUserPassword });

      const otherToken = otherLogin.body.token;

      // Wait for other user's identity
      await waitForBackend(3000);

      const otherIdentity = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${otherToken}`);

      if (!otherIdentity.body?.handle) {
        console.warn('Other user has no identity - skipping taken handle test');
        return;
      }

      const takenHandle = otherIdentity.body.handle;

      // Try to change first user's handle to the other user's handle
      const response = await serverApp
        .post('/api/atproto/identity/update-handle')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ handle: takenHandle });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/taken/i);
    });
  });
});
