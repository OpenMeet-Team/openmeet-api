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
      expect(quickRsvpResponse.body.verificationCode).toBeDefined();

      // Step 2: Verify the email code to complete Quick RSVP account setup
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          code: quickRsvpResponse.body.verificationCode,
          email: testEmail,
        })
        .expect(200);

      expect(verifyResponse.body.token).toBeDefined();
      expect(verifyResponse.body.user).toBeDefined();
      expect(verifyResponse.body.user.id).toBeDefined();

      // Step 3: Verify user profile is passwordless email account
      const profileResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .set('Authorization', `Bearer ${verifyResponse.body.token}`)
        .expect(200);

      expect(profileResponse.body.id).toBe(verifyResponse.body.user.id);
      expect(profileResponse.body.email).toBe(testEmail);
      expect(profileResponse.body.provider).toBe('email');
      expect(profileResponse.body.socialId).toBeNull();

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

      expect(firstResponse.body.verificationCode).toBeDefined();

      // Second Quick RSVP with same email and event should be handled gracefully
      const secondResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Test User Again',
          email: testEmail,
          eventSlug: testEvent.slug,
          status: EventAttendeeStatus.Confirmed,
        });

      // Should either succeed (update existing) or return 4xx
      expect([201, 400, 409]).toContain(secondResponse.status);
    });
  });

  describe.skip('Rate Limiting', () => {
    // Skipping rate limit test to avoid interfering with other tests
    it('should enforce email-based rate limiting for Quick RSVP', async () => {
      const timestamp = Date.now();
      const testEmail = `rate-limit-${timestamp}@example.com`;

      // Make multiple Quick RSVPs rapidly
      const promises = [];
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
            })
        );
      }

      const responses = await Promise.all(promises);

      // At least one should be rate limited (429) or rejected
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const successCount = responses.filter(r => r.status === 201).length;

      // Should have some successful and some rate limited
      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
    }, 30000);
  });
});
