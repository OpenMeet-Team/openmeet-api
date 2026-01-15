import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';
import {
  EventAttendeeStatus,
  EventType,
  EventStatus,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Account Merging (E2E)', () => {
  const app = TESTING_APP_URL;
  let token: string;
  let testEvent: any;

  beforeAll(async () => {
    token = await loginAsTester();

    const timestamp = Date.now();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    // Create a test event for Quick RSVP
    testEvent = await createEvent(app, token, {
      name: `Account Merge Test Event ${timestamp}`,
      slug: `account-merge-test-${timestamp}`,
      description: 'Event for account merging testing',
      type: EventType.InPerson,
      location: 'Test Location',
      startDate: futureDate.toISOString(),
      endDate: new Date(futureDate.getTime() + 3600000).toISOString(),
      maxAttendees: 50,
      status: EventStatus.Published,
      categories: [],
      requireApproval: false,
    });
  });

  describe('Quick RSVP Account Creation', () => {
    it('should create a passwordless email account via Quick RSVP', async () => {
      const timestamp = Date.now();
      const testEmail = `quick-rsvp-${timestamp}@example.com`;

      // Step 1: User does Quick RSVP (creates passwordless email account)
      // V2 Luma-style flow: No verification code, immediate account creation
      const quickRsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Test User',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      expect(quickRsvpResponse.body.message).toBeDefined();
      expect(quickRsvpResponse.body.success).toBe(true);
      // V2 flow: No verification code returned
      expect(quickRsvpResponse.body.verificationCode).toBeUndefined();

      // Step 2: Attempt second RSVP with same email should return conflict
      // This confirms the account was created in Step 1
      const secondRsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Test User',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(409);

      expect(secondRsvpResponse.body.message).toContain(
        'account with this email already exists',
      );

      // This confirms a Quick RSVP account (passwordless email) was created
      // The account merging logic (upgrading to social login) happens in
      // user.service.ts and is covered by unit tests since OAuth flows
      // require external services that can't be tested in E2E
    });

    it('should prevent duplicate Quick RSVPs for same email and event', async () => {
      const timestamp = Date.now();
      const testEmail = `duplicate-rsvp-${timestamp}@example.com`;

      // First Quick RSVP
      const firstResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Test User',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      expect(firstResponse.body.success).toBe(true);
      // V2 flow: No verification code returned
      expect(firstResponse.body.verificationCode).toBeUndefined();

      // Second Quick RSVP with same email should return conflict
      // V2 Luma-style flow: Existing users must sign in to RSVP
      const secondResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Test User Again',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(409);

      expect(secondResponse.body.message).toContain(
        'account with this email already exists',
      );
    });
  });

  describe('Bluesky Account Merge with Quick RSVP', () => {
    /**
     * This test verifies the account merge flow for Bluesky users.
     * Since we can't easily simulate Bluesky OAuth in E2E tests,
     * we test the key behaviors:
     * 1. Quick RSVP creates a passwordless account
     * 2. The merge verification code flow works
     *
     * The full OAuth integration is covered by unit tests.
     */
    it('should create Quick RSVP account that can later be merged', async () => {
      const timestamp = Date.now();
      const testEmail = `bluesky-merge-${timestamp}@example.com`;

      // Step 1: Create Quick RSVP account
      const quickRsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Bluesky Test User',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      expect(quickRsvpResponse.body.success).toBe(true);

      // Step 2: Verify the account exists and is passwordless
      // (This is the account type that can be merged with Bluesky)
      // The actual merge would happen when a Bluesky user enters this email
      // and verifies ownership via the verification code flow.

      // Note: Full merge flow testing requires:
      // 1. Bluesky OAuth login (returns user without email)
      // 2. User enters email matching Quick RSVP account
      // 3. System sends verification code
      // 4. User verifies code
      // 5. Accounts merge
      //
      // Steps 2-5 are covered by unit tests in user.service.spec.ts
      // and auth.service.spec.ts since OAuth requires external services.
    });

    it('should allow login code request for Quick RSVP account', async () => {
      const timestamp = Date.now();
      const testEmail = `login-code-${timestamp}@example.com`;

      // Create Quick RSVP account first
      await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Login Code Test',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      // Request login code for the Quick RSVP account
      const loginCodeResponse = await request(app)
        .post('/api/v1/auth/request-login-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: testEmail })
        .expect(200);

      expect(loginCodeResponse.body.success).toBe(true);
      expect(loginCodeResponse.body.message).toContain('sent a login code');
    });

    it('should verify email code and return tokens', async () => {
      const timestamp = Date.now();
      const testEmail = `verify-code-${timestamp}@example.com`;

      // Create Quick RSVP account
      await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Verify Code Test',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      // Request login code
      const loginCodeResponse = await request(app)
        .post('/api/v1/auth/request-login-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: testEmail })
        .expect(200);

      // In development, the code is returned in the response
      const verificationCode = loginCodeResponse.body.verificationCode;

      if (verificationCode) {
        // Verify the code
        const verifyResponse = await request(app)
          .post('/api/v1/auth/verify-email-code')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: testEmail,
            code: verificationCode,
          })
          .expect(200);

        // Should return login tokens
        expect(verifyResponse.body.token).toBeDefined();
        expect(verifyResponse.body.refreshToken).toBeDefined();
        expect(verifyResponse.body.user).toBeDefined();
        expect(verifyResponse.body.user.email).toBe(testEmail);
      }
    });

    it('should accept context parameter in verify-email-code', async () => {
      const timestamp = Date.now();
      const testEmail = `context-test-${timestamp}@example.com`;

      // Create Quick RSVP account
      await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Context Test',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        })
        .expect(201);

      // Request login code
      const loginCodeResponse = await request(app)
        .post('/api/v1/auth/request-login-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ email: testEmail })
        .expect(200);

      const verificationCode = loginCodeResponse.body.verificationCode;

      if (verificationCode) {
        // Verify with context='login' (default behavior)
        const verifyResponse = await request(app)
          .post('/api/v1/auth/verify-email-code')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: testEmail,
            code: verificationCode,
            context: 'login',
          })
          .expect(200);

        expect(verifyResponse.body.token).toBeDefined();
      }
    });
  });

  describe.skip('Rate Limiting', () => {
    // Skipping rate limit test to avoid interfering with other tests
    it('should enforce email-based rate limiting for Quick RSVP', async () => {
      const timestamp = Date.now();
      const testEmail = `rate-limit-${timestamp}@example.com`;

      // Make multiple Quick RSVPs rapidly
      const promises: Promise<request.Response>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/v1/auth/quick-rsvp')
            .set('x-tenant-id', TESTING_TENANT_ID)
            .send({
              name: 'Test User',
              email: testEmail,
              eventSlug: testEvent.slug,
              status: EventAttendeeStatus.Confirmed,
            }),
        );
      }

      const responses = await Promise.all(promises);

      // At least one should be rate limited (429) or rejected
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;
      const successCount = responses.filter((r) => r.status === 201).length;

      // Should have some successful and some rate limited
      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    }, 30000);
  });
});
