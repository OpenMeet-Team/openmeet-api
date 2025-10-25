import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';
import { EventType } from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Quick RSVP (e2e)', () => {
  const app = TESTING_APP_URL;
  let token: string;
  let publicEvent: any;

  beforeAll(async () => {
    token = await loginAsTester();

    // Create a public event for testing
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    publicEvent = await createEvent(app, token, {
      name: `Quick RSVP Test Event ${Date.now()}`,
      description: 'Public event for quick RSVP testing',
      type: EventType.InPerson,
      location: 'Test Location',
      startDate: futureDate.toISOString(),
      endDate: new Date(futureDate.getTime() + 3600000).toISOString(),
      maxAttendees: 50,
      categories: [],
      requireApproval: false,
    });

    // TODO: Create a group event when we implement group blocking
    // groupEvent = await createGroupEvent(...)
  });

  describe('POST /api/v1/auth/quick-rsvp', () => {
    describe('Happy path: New user RSVPs to public event', () => {
      it('should create user, RSVP, and return verification code', async () => {
        const timestamp = Date.now();
        const quickRsvpData = {
          name: 'New User',
          email: `newuser.${timestamp}@example.com`,
          eventSlug: publicEvent.slug,
        };

        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          message: expect.stringContaining('email'),
        });

        // Verification code should be returned for testing
        expect(response.body.verificationCode).toMatch(/^\d{6}$/);

        // Cookie should be set for auto-login
        const cookies = response.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(
          cookies.some((c: string) =>
            c.includes('openmeet_pending_verification'),
          ),
        ).toBe(true);
      });

      it('should normalize email to lowercase', async () => {
        const timestamp = Date.now();
        const quickRsvpData = {
          name: 'Case Test',
          email: `CaseSensitive.${timestamp}@EXAMPLE.COM`,
          eventSlug: publicEvent.slug,
        };

        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(201);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Existing user RSVPs', () => {
      it('should use existing user and create RSVP', async () => {
        const timestamp = Date.now();
        const email = `existing.${timestamp}@example.com`;

        // First RSVP creates user
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Existing User',
            email,
            eventSlug: publicEvent.slug,
          })
          .expect(201);

        // Create another event
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 14);
        const secondEvent = await createEvent(app, token, {
          name: `Second Event ${timestamp}`,
          description: 'Another event',
          type: EventType.InPerson,
          location: 'Test Location',
          startDate: futureDate.toISOString(),
          endDate: new Date(futureDate.getTime() + 3600000).toISOString(),
          maxAttendees: 50,
          categories: [],
        });

        // Second RSVP should reuse existing user
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Different Name', // Name might be different
            email,
            eventSlug: secondEvent.slug,
          })
          .expect(201);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Idempotency', () => {
      it('should return success if user already has RSVP', async () => {
        const timestamp = Date.now();
        const quickRsvpData = {
          name: 'Duplicate Test',
          email: `duplicate.${timestamp}@example.com`,
          eventSlug: publicEvent.slug,
        };

        // First RSVP
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(201);

        // Second RSVP to same event - should be idempotent
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(201);

        expect(response.body.success).toBe(true);
      });
    });

    describe('Validation errors', () => {
      it('should reject if event does not exist', async () => {
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Test User',
            email: 'test@example.com',
            eventSlug: 'nonexistent-event-slug',
          })
          .expect(404);

        expect(response.body.message).toMatch(/event.*not found/i);
      });

      it('should reject invalid email format', async () => {
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Test User',
            email: 'invalid-email',
            eventSlug: publicEvent.slug,
          })
          .expect(400);
      });

      it('should reject missing name', async () => {
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: 'test@example.com',
            eventSlug: publicEvent.slug,
          })
          .expect(400);
      });

      it('should reject missing email', async () => {
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Test User',
            eventSlug: publicEvent.slug,
          })
          .expect(400);
      });
    });

    describe.skip('Group event restrictions (V1 limitation)', () => {
      // Skip until we create group events in beforeAll
      it.todo('should reject quick RSVP for events requiring group membership');
      it.todo(
        'should return clear error message directing to full registration',
      );
    });
  });

  describe('POST /api/v1/auth/verify-email-code', () => {
    it('should verify code and log in user', async () => {
      const timestamp = Date.now();
      const email = `verify.test.${timestamp}@example.com`;

      // Step 1: Quick RSVP
      const rsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'Verify Test',
          email,
          eventSlug: publicEvent.slug,
        })
        .expect(201);

      const { verificationCode } = rsvpResponse.body;

      // Step 2: Verify email with code
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ code: verificationCode })
        .expect(200);

      // Should return JWT tokens
      expect(verifyResponse.body).toMatchObject({
        token: expect.any(String),
        refreshToken: expect.any(String),
        tokenExpires: expect.any(Number),
        user: expect.objectContaining({
          email,
        }),
      });

      // Should be able to access protected routes
      const meResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${verifyResponse.body.token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(meResponse.body.email).toBe(email);
    });

    it('should reject invalid code', async () => {
      await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ code: '999999' })
        .expect(401);
    });

    it('should reject code after one use', async () => {
      const timestamp = Date.now();
      const email = `onetime.${timestamp}@example.com`;

      // Quick RSVP
      const rsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name: 'One Time Test',
          email,
          eventSlug: publicEvent.slug,
        })
        .expect(201);

      const { verificationCode } = rsvpResponse.body;

      // First use - should succeed
      await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ code: verificationCode })
        .expect(200);

      // Second use - should fail
      await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ code: verificationCode })
        .expect(401);
    });
  });

  describe('Integration: Complete quick RSVP flow', () => {
    it('should complete full flow: RSVP → verify → access event', async () => {
      const timestamp = Date.now();
      const email = `fullflow.${timestamp}@example.com`;
      const name = 'Full Flow Test';

      // Step 1: Quick RSVP
      const rsvpResponse = await request(app)
        .post('/api/v1/auth/quick-rsvp')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({
          name,
          email,
          eventSlug: publicEvent.slug,
        })
        .expect(201);

      expect(rsvpResponse.body.success).toBe(true);
      const { verificationCode } = rsvpResponse.body;

      // Step 2: Verify email
      const verifyResponse = await request(app)
        .post('/api/v1/auth/verify-email-code')
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ code: verificationCode })
        .expect(200);

      const { token } = verifyResponse.body;

      // Step 3: Check user is logged in
      const meResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      expect(meResponse.body.email).toBe(email);

      // Step 4: Verify RSVP exists
      const eventResponse = await request(app)
        .get(`/api/events/${publicEvent.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // User should be attending this event
      expect(eventResponse.body.userAttendanceStatus).toBeDefined();
    });
  });
});
