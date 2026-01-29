import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';

/**
 * PDS Password Reset E2E Tests
 *
 * Tests the POST /api/atproto/identity/reset-pds-password endpoint which
 * allows users with custodial PDS accounts to reset their PDS password
 * using a token received via email.
 *
 * Prerequisites:
 * - PDS and PLC containers running (docker compose --profile pds up -d)
 * - Valid PDS_INVITE_CODE in .env
 * - MailDev running for email capture
 *
 * Run with: npm run test:e2e -- --testPathPattern=pds-password-reset
 */

const isPdsConfigured = !!process.env.PDS_URL;
const describeIfPds = isPdsConfigured ? describe : describe.skip;

jest.setTimeout(120000);

describeIfPds('PDS Password Reset (e2e)', () => {
  const app = TESTING_APP_URL;
  const pdsUrl = process.env.PDS_URL || 'http://localhost:3101';

  // Test user state shared across sequential tests
  const testRunId = Date.now();
  const userEmail = `pds-reset-${testRunId}@openmeet.net`;
  const userPassword = 'TestPassword123!';
  let authToken: string;
  let userHandle: string;

  let serverApp: request.SuperAgentTest;

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  const waitForBackend = (ms = 1000) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Request a PDS password reset and extract the token from the email.
   * Calls the PDS XRPC endpoint directly, then polls MailDev for the reset email.
   */
  async function requestPdsResetToken(email: string): Promise<string> {
    const timestampBefore = Date.now();

    await request(pdsUrl)
      .post('/xrpc/com.atproto.server.requestPasswordReset')
      .set('Content-Type', 'application/json')
      .send({ email });

    // Wait for email delivery then poll
    const resetEmail = await EmailVerificationTestHelpers.waitForEmail(
      () => mailDevService.getEmailsSince(timestampBefore),
      (e) =>
        e.to?.some((to) => to.address.toLowerCase() === email.toLowerCase()) &&
        e.subject?.includes('Password Reset'),
      30000,
    );

    const token = EmailVerificationTestHelpers.extractPdsResetToken(resetEmail);
    if (!token) {
      throw new Error(
        `Could not extract PDS reset token from email. Subject: "${resetEmail.subject}"`,
      );
    }
    return token;
  }

  describe('Password Reset Flow', () => {
    it('should register user and get custodial identity', async () => {
      // Register
      await serverApp
        .post('/api/v1/auth/email/register')
        .send({
          email: userEmail,
          password: userPassword,
          firstName: 'PdsReset',
          lastName: `Test${testRunId}`,
        })
        .expect(201);

      // Verify email
      await waitForBackend(2000);

      const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
        () => mailDevService.getEmails(),
        (email) =>
          email.to?.some(
            (to) => to.address.toLowerCase() === userEmail.toLowerCase(),
          ) &&
          (email.subject?.includes('Code') ||
            email.subject?.includes('Verify')),
        30000,
      );

      const verificationCode =
        EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
      expect(verificationCode).toBeDefined();

      await serverApp
        .post('/api/v1/auth/verify-email-code')
        .send({ email: userEmail, code: verificationCode })
        .expect(200);

      // Login
      const loginResponse = await serverApp
        .post('/api/v1/auth/email/login')
        .send({ email: userEmail, password: userPassword })
        .expect(200);

      authToken = loginResponse.body.token;
      expect(authToken).toBeDefined();

      // Poll for async PDS account creation (may take several seconds)
      let identity: any;
      const maxAttempts = 20;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await waitForBackend(3000);
        const identityResponse = await serverApp
          .get('/api/atproto/identity')
          .set('Authorization', `Bearer ${authToken}`);

        if (identityResponse.status === 200 && identityResponse.body?.did) {
          identity = identityResponse.body;
          break;
        }

        if (attempt === maxAttempts) {
          throw new Error(
            `Identity not created after ${maxAttempts} attempts. ` +
              `Last response: ${identityResponse.status} ${JSON.stringify(identityResponse.body)}`,
          );
        }
      }

      expect(identity.did).toMatch(/^did:(plc|web):/);
      expect(identity.isCustodial).toBe(true);
      userHandle = identity.handle;
      expect(userHandle).toBeDefined();
    });

    it('should reset PDS password and verify new password works', async () => {
      const newPassword = 'NewSecurePassword789!';

      // Get reset token via email
      const resetToken = await requestPdsResetToken(userEmail);
      expect(resetToken).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

      // Reset password via API endpoint
      const resetResponse = await serverApp
        .post('/api/atproto/identity/reset-pds-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: resetToken, password: newPassword })
        .expect(200);

      expect(resetResponse.body).toEqual({ success: true });

      // Verify new password works by creating a PDS session directly
      const sessionResponse = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createSession')
        .set('Content-Type', 'application/json')
        .send({ identifier: userHandle, password: newPassword })
        .expect(200);

      expect(sessionResponse.body.handle).toBe(userHandle);
      expect(sessionResponse.body.did).toBeDefined();
      expect(sessionResponse.body.accessJwt).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('should return 401 without auth token', async () => {
      // Use raw request without agent to avoid any cached auth state
      await request(app)
        .post('/api/atproto/identity/reset-pds-password')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ token: 'AAAAA-BBBBB', password: 'SomePassword123!' })
        .expect(401);
    });

    it('should reject password shorter than 8 characters', async () => {
      await serverApp
        .post('/api/atproto/identity/reset-pds-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: 'AAAAA-BBBBB', password: 'Short1' })
        .expect(422);
    });

    it('should reject expired or invalid token from PDS', async () => {
      // Valid format but non-existent token — PDS will reject it
      await serverApp
        .post('/api/atproto/identity/reset-pds-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: 'AAAAA-BBBBB', password: 'ValidPassword123!' })
        .expect(400);
    });
  });
});
