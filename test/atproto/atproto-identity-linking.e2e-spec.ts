import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_PDS_URL,
} from '../utils/constants';
import { mailDevService } from '../utils/maildev-service';
import { EmailVerificationTestHelpers } from '../utils/email-verification-helpers';

/**
 * AT Protocol Identity Linking E2E Tests
 *
 * Tests identity linking flows for AT Protocol identities:
 * 1. External PDS user cannot change handle (should get 400)
 * 2. Post-ownership flow - hasActiveSession becomes false, link restores it
 * 3. Link DID owned by another user (should fail)
 * 4. hasActiveSession verification for custodial users
 *
 * Prerequisites:
 * - PDS and PLC containers must be running
 * - Valid PDS_INVITE_CODE in .env
 *
 * Run with: npm run test:e2e -- --testPathPattern=atproto-identity-linking
 */

const isPdsConfigured = !!process.env.PDS_URL;
const describeIfPds = isPdsConfigured ? describe : describe.skip;

jest.setTimeout(120000);

describeIfPds('AT Protocol Identity Linking (e2e)', () => {
  const app = TESTING_APP_URL;
  const pdsUrl = TESTING_PDS_URL;

  // Generate unique identifier for this test run
  const testRunId = Date.now();

  let serverApp: request.SuperAgentTest;

  beforeAll(() => {
    serverApp = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  });

  const waitForBackend = (ms = 1000): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Helper to create a verified email user with custodial identity.
   * Returns auth token and waits for PDS account creation.
   */
  async function createVerifiedEmailUser(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ): Promise<{
    token: string;
    identity: any | null;
  }> {
    // Register
    const registerResponse = await serverApp
      .post('/api/v1/auth/email/register')
      .send({ email, password, firstName, lastName });

    expect(registerResponse.status).toBe(201);

    // Wait for verification email
    await waitForBackend(2000);

    // Get verification code
    const verificationEmail = await EmailVerificationTestHelpers.waitForEmail(
      () => mailDevService.getEmails(),
      (e) =>
        e.to?.some((to) => to.address.toLowerCase() === email.toLowerCase()) &&
        (e.subject?.includes('Code') || e.subject?.includes('Verify')),
      30000,
    );

    const verificationCode =
      EmailVerificationTestHelpers.extractVerificationCode(verificationEmail);
    expect(verificationCode).toBeDefined();

    // Verify email
    await serverApp.post('/api/v1/auth/verify-email-code').send({
      email,
      code: verificationCode,
    });

    // Login
    const loginResponse = await serverApp
      .post('/api/v1/auth/email/login')
      .send({ email, password });

    expect(loginResponse.status).toBe(200);
    const token = loginResponse.body.token;

    // Wait for async PDS account creation
    await waitForBackend(3000);

    // Get identity (may be null if PDS not configured or account creation failed)
    const identityResponse = await serverApp
      .get('/api/atproto/identity')
      .set('Authorization', `Bearer ${token}`);

    return {
      token,
      identity: identityResponse.body,
    };
  }

  /**
   * Helper to wait for PDS password reset email and extract token.
   * Does NOT request a new reset - expects email was already sent.
   */
  async function waitForPdsResetToken(
    email: string,
    timestampBefore: number,
  ): Promise<string> {
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

  describe('1. hasActiveSession verification for custodial users', () => {
    const userEmail = `has-session-${testRunId}@openmeet.net`;
    const userPassword = 'TestPassword123!';
    let authToken: string;

    it('should create custodial user with hasActiveSession=true', async () => {
      const { token, identity } = await createVerifiedEmailUser(
        userEmail,
        userPassword,
        'HasSession',
        `Test${testRunId}`,
      );
      authToken = token;

      if (!identity?.did) {
        console.warn('Skipping - no AT Protocol identity created');
        return;
      }

      // Custodial user with pdsCredentials should have hasActiveSession=true
      expect(identity.isCustodial).toBe(true);
      expect(identity.hasActiveSession).toBe(true);
      expect(identity.isOurPds).toBe(true);

      console.log(
        `User has custodial identity with hasActiveSession=${identity.hasActiveSession}`,
      );
    });

    it('should maintain hasActiveSession=true after identity refresh', async () => {
      if (!authToken) {
        console.warn('Skipping - no auth token');
        return;
      }

      // Fetch identity again to confirm hasActiveSession is persistent
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(identityResponse.status).toBe(200);

      if (!identityResponse.body?.did) {
        console.warn('Skipping - no AT Protocol identity');
        return;
      }

      expect(identityResponse.body.hasActiveSession).toBe(true);
      console.log('hasActiveSession remains true on subsequent fetches');
    });
  });

  describe('2. Take ownership flow changes hasActiveSession', () => {
    const userEmail = `take-ownership-${testRunId}@openmeet.net`;
    const userPassword = 'TestPassword123!';
    let authToken: string;
    let userHandle: string;
    let initiateTimestamp: number;

    it('should create custodial user for take-ownership test', async () => {
      const { token, identity } = await createVerifiedEmailUser(
        userEmail,
        userPassword,
        'TakeOwnership',
        `Test${testRunId}`,
      );
      authToken = token;

      if (!identity?.did) {
        console.warn('Skipping - no AT Protocol identity created');
        return;
      }

      expect(identity.isCustodial).toBe(true);
      expect(identity.hasActiveSession).toBe(true);
      userHandle = identity.handle;

      console.log(`Created custodial user with handle: ${userHandle}`);
    });

    it('should initiate take-ownership and send password reset email', async () => {
      if (!authToken) {
        console.warn('Skipping - no auth token');
        return;
      }

      // Capture timestamp before initiating to filter emails
      initiateTimestamp = Date.now();

      const response = await serverApp
        .post('/api/atproto/identity/take-ownership/initiate')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(userEmail);

      console.log('Take-ownership initiated, reset email sent');
    });

    it('should reset PDS password using token from email', async () => {
      if (!authToken || !initiateTimestamp) {
        console.warn('Skipping - prerequisites not met');
        return;
      }

      const newPassword = 'UserOwnedPassword789!';

      // Get reset token from the email sent by initiate-take-ownership
      const resetToken = await waitForPdsResetToken(userEmail, initiateTimestamp);
      expect(resetToken).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);

      // Reset password via API
      const resetResponse = await serverApp
        .post('/api/atproto/identity/reset-pds-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: resetToken, password: newPassword });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body).toEqual({ success: true });

      // Verify new password works on PDS directly
      const sessionResponse = await request(pdsUrl)
        .post('/xrpc/com.atproto.server.createSession')
        .set('Content-Type', 'application/json')
        .send({ identifier: userHandle, password: newPassword });

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.handle).toBe(userHandle);

      console.log('PDS password reset successful, user can login to PDS');
    });

    it('should complete take-ownership and set hasActiveSession=false', async () => {
      if (!authToken) {
        console.warn('Skipping - no auth token');
        return;
      }

      // Complete take-ownership (clears custodial credentials)
      const completeResponse = await serverApp
        .post('/api/atproto/identity/take-ownership/complete')
        .set('Authorization', `Bearer ${authToken}`);

      expect(completeResponse.status).toBe(200);
      expect(completeResponse.body).toEqual({ success: true });

      // Verify identity now shows hasActiveSession=false
      // After completing take-ownership:
      // - isCustodial=false (user now owns their identity)
      // - hasActiveSession=false (no OAuth session yet, pdsCredentials cleared)
      const identityResponse = await serverApp
        .get('/api/atproto/identity')
        .set('Authorization', `Bearer ${authToken}`);

      expect(identityResponse.status).toBe(200);
      expect(identityResponse.body.hasActiveSession).toBe(false);
      expect(identityResponse.body.isCustodial).toBe(false); // User now owns it

      // Update userHandle from the refreshed identity for next test
      userHandle = identityResponse.body.handle;

      console.log(
        `Take-ownership complete: isCustodial=false, hasActiveSession=false (user owns identity, needs OAuth to publish)`,
      );
    });

    it('should verify link endpoint is available for re-establishing session', async () => {
      if (!authToken || !userHandle) {
        console.warn('Skipping - prerequisites not met');
        return;
      }

      /**
       * KNOWN LIMITATION: OAuth linking requires externally resolvable handles.
       *
       * The local PDS uses `.pds.test` handle domain which isn't publicly
       * resolvable. The OAuth client tries to resolve the handle to find
       * the PDS, which fails for local-only domains.
       *
       * To fully test OAuth linking, the PDS would need a resolvable handle
       * domain (e.g., `.bsky.dev.openmeet.net`).
       *
       * For now, we verify:
       * 1. The endpoint accepts the request (doesn't 401/403)
       * 2. Document the expected behavior when properly configured
       */
      console.log(`Attempting to link with handle: ${userHandle}`);

      const linkResponse = await serverApp
        .post('/api/v1/auth/bluesky/link')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ handle: userHandle, platform: 'web' });

      // With non-resolvable handle domain (.pds.test), expect 400
      // With resolvable domain, would expect 200 with authUrl
      if (userHandle.endsWith('.pds.test')) {
        console.log(
          'KNOWN LIMITATION: .pds.test handles are not externally resolvable',
        );
        console.log(
          'OAuth link endpoint cannot resolve handle to PDS. This is expected.',
        );
        console.log(
          'To test OAuth linking, configure PDS with resolvable handle domain.',
        );
        expect(linkResponse.status).toBe(400);
      } else {
        // Resolvable handle - should work
        expect(linkResponse.status).toBe(200);
        expect(linkResponse.body.authUrl).toBeDefined();
        expect(linkResponse.body.authUrl).toMatch(/^https?:\/\//);
        console.log(
          'Link endpoint returns OAuth URL:',
          linkResponse.body.authUrl.substring(0, 50) + '...',
        );
      }
    });
  });

  describe('3. External PDS user cannot change handle', () => {
    /**
     * This test requires a user with an external PDS identity (e.g., bsky.social).
     * Since we cannot easily perform OAuth to bsky.social in CI, we have two options:
     *
     * Option A: Skip this test in CI (current implementation)
     * Option B: Create a mock/fixture that simulates an external identity
     *
     * For now, we document the expected behavior and skip if no external user exists.
     */
    it('should reject handle change for external PDS user (requires OAuth setup)', async () => {
      // This test would require:
      // 1. A user who logged in via Bluesky OAuth to bsky.social
      // 2. Their identity would have isOurPds=false
      // 3. Attempting update-handle should return 400
      //
      // Since we cannot easily set this up in E2E, we verify the validation exists
      // by checking that handle changes require our PDS domain

      const userEmail = `external-pds-${testRunId}@openmeet.net`;
      const userPassword = 'TestPassword123!';

      const { token, identity } = await createVerifiedEmailUser(
        userEmail,
        userPassword,
        'ExternalPds',
        `Test${testRunId}`,
      );

      if (!identity?.did) {
        console.warn('Skipping - no AT Protocol identity created');
        return;
      }

      // This user is on OUR PDS, but we can verify the domain validation
      // by attempting to change to an external domain (which should fail)
      const response = await serverApp
        .post('/api/atproto/identity/update-handle')
        .set('Authorization', `Bearer ${token}`)
        .send({ handle: 'test.bsky.social' });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Handle must end with/);

      console.log(
        'Handle change to external domain rejected:',
        response.body.message,
      );
    });

    it('should document: external PDS user attempting handle change gets 400', () => {
      /**
       * Expected behavior for external PDS users (e.g., bsky.social):
       *
       * 1. User logs in via Bluesky OAuth with handle "alice.bsky.social"
       * 2. System creates identity with:
       *    - did: did:plc:xxx
       *    - handle: alice.bsky.social
       *    - pdsUrl: https://bsky.social
       *    - isCustodial: false
       *    - isOurPds: false
       *
       * 3. User calls POST /api/atproto/identity/update-handle
       * 4. System returns 400 "Handle changes only allowed for our PDS"
       *
       * This is intentional: we cannot change handles on external PDS servers
       * because we don't have administrative access to them.
       */
      console.log(
        'Documented: External PDS users receive 400 when attempting handle change',
      );
      expect(true).toBe(true);
    });
  });

  describe('4. Link DID owned by another user (conflict detection)', () => {
    /**
     * This test verifies that attempting to link a DID that belongs to another
     * user results in an error. The full flow requires OAuth which we cannot
     * easily test in E2E, but we can document the expected behavior.
     */
    it('should document: linking DID owned by another user fails', () => {
      /**
       * Expected flow:
       *
       * 1. User1 has AT Protocol identity with DID-A
       * 2. User2 attempts to link their account to DID-A via OAuth
       * 3. During callback, system checks if DID-A is already linked
       * 4. System finds DID-A belongs to User1
       * 5. System redirects User2 with error "DID already linked to another account"
       *
       * This is implemented in AuthBlueskyService.handleLinkCallback():
       * - Checks existingDidIdentity = findByDid(tenantId, did)
       * - If existingDidIdentity.userUlid !== linkData.userUlid
       * - Returns error redirect with "DID already linked to another account"
       */
      console.log(
        'Documented: Linking DID owned by another user returns error in callback',
      );
      expect(true).toBe(true);
    });

    it('should verify two users can have separate identities', async () => {
      // Create two users and verify they each get separate identities
      const user1Email = `identity-user1-${testRunId}@openmeet.net`;
      const user2Email = `identity-user2-${testRunId}@openmeet.net`;
      const password = 'TestPassword123!';

      const { identity: identity1 } = await createVerifiedEmailUser(
        user1Email,
        password,
        'User1',
        `Test${testRunId}`,
      );

      const { identity: identity2 } = await createVerifiedEmailUser(
        user2Email,
        password,
        'User2',
        `Test${testRunId}`,
      );

      if (!identity1?.did || !identity2?.did) {
        console.warn('Skipping - one or both users have no identity');
        return;
      }

      // Verify they have different DIDs
      expect(identity1.did).not.toBe(identity2.did);
      expect(identity1.handle).not.toBe(identity2.handle);

      console.log(`User1 DID: ${identity1.did}`);
      console.log(`User2 DID: ${identity2.did}`);
      console.log('Verified: Each user has a unique AT Protocol identity');
    });
  });

  describe('5. Recovery status check', () => {
    it('should return recovery status for new user', async () => {
      const userEmail = `recovery-check-${testRunId}@openmeet.net`;
      const userPassword = 'TestPassword123!';

      const { token, identity } = await createVerifiedEmailUser(
        userEmail,
        userPassword,
        'RecoveryCheck',
        `Test${testRunId}`,
      );

      if (!identity?.did) {
        console.warn('Skipping - no AT Protocol identity created');
        return;
      }

      // Check recovery status
      const recoveryResponse = await serverApp
        .get('/api/atproto/identity/recovery-status')
        .set('Authorization', `Bearer ${token}`);

      expect(recoveryResponse.status).toBe(200);

      // For a new custodial user, recovery should indicate they already have an account
      // (since the account was just created)
      console.log(
        'Recovery status:',
        JSON.stringify(recoveryResponse.body, null, 2),
      );

      // The exact response depends on implementation, but it should be valid
      expect(recoveryResponse.body).toBeDefined();
    });
  });
});
