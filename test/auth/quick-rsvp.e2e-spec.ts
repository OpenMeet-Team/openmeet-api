import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
} from '../../src/core/constants/constant';

jest.setTimeout(60000);

describe('Quick RSVP (e2e)', () => {
  const app = TESTING_APP_URL;
  let token: string;
  let publicEvent: any;
  let groupEventWithMembershipRequired: any;
  let groupEventNoMembershipRequired: any;
  let testGroup: any;

  beforeAll(async () => {
    token = await loginAsTester();

    const timestamp = Date.now();

    // Create a public event for testing
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    publicEvent = await createEvent(app, token, {
      name: `Quick RSVP Test Event ${timestamp}`,
      description: 'Public event for quick RSVP testing',
      type: EventType.InPerson,
      location: 'Test Location',
      startDate: futureDate.toISOString(),
      endDate: new Date(futureDate.getTime() + 3600000).toISOString(),
      maxAttendees: 50,
      categories: [],
      requireApproval: false,
    });

    // Create a group for testing group membership logic
    const groupResponse = await request(app)
      .post('/api/groups')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Quick RSVP Test Group ${timestamp}`,
        description: 'Test group for Quick RSVP functionality',
        status: GroupStatus.Published,
      });
    testGroup = groupResponse.body;

    // Create group event requiring membership
    groupEventWithMembershipRequired = await createEvent(app, token, {
      name: `Group Event Membership Required ${timestamp}`,
      slug: `group-event-req-${timestamp}`,
      description: 'Event requiring group membership',
      type: EventType.Hybrid,
      startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      status: EventStatus.Published,
      group: testGroup.id,
      requireGroupMembership: true, // This is the key setting
      timeZone: 'UTC',
      categories: [],
    });

    // Create group event NOT requiring membership (should allow Quick RSVP)
    groupEventNoMembershipRequired = await createEvent(app, token, {
      name: `Group Event No Membership Required ${timestamp}`,
      slug: `group-event-no-req-${timestamp}`,
      description: 'Group event not requiring membership',
      type: EventType.Hybrid,
      startDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(new Date().getTime() + 48 * 60 * 60 * 1000),
      maxAttendees: 100,
      locationOnline: 'https://example.com/meeting',
      status: EventStatus.Published,
      group: testGroup.id,
      requireGroupMembership: false, // This allows anyone to join
      timeZone: 'UTC',
      categories: [],
    });
  });

  describe('POST /api/v1/auth/quick-rsvp', () => {
    describe('Happy path: New user RSVPs to public event', () => {
      it('should create user, RSVP, and send calendar invite', async () => {
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
          message: expect.stringContaining('calendar invite'),
        });

        // No verification code - calendar invite sent immediately
        expect(response.body.verificationCode).toBeUndefined();
      });

      it('should create user with "Can\'t go" status when status is cancelled', async () => {
        const timestamp = Date.now();
        const quickRsvpData = {
          name: 'Declining User',
          email: `declining.${timestamp}@example.com`,
          eventSlug: publicEvent.slug,
          status: 'cancelled',
        };

        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          message: expect.stringContaining('calendar invite'),
        });
        expect(response.body.verificationCode).toBeUndefined();
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
      it('should return 409 conflict for existing users', async () => {
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

        // Second RSVP should return 409 for existing user (Luma-style)
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Different Name', // Name might be different
            email,
            eventSlug: secondEvent.slug,
          })
          .expect(409);

        expect(response.body.message).toContain('already exists');
        expect(response.body.message).toContain('sign in');
      });
    });

    describe('Idempotency', () => {
      it('should return 409 for duplicate Quick RSVP attempts', async () => {
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

        // Second RSVP to same event - should return 409 (user exists, use login)
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send(quickRsvpData)
          .expect(409);

        expect(response.body.message).toContain('already exists');
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
          .expect(422);
      });

      it('should reject missing name', async () => {
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: 'test@example.com',
            eventSlug: publicEvent.slug,
          })
          .expect(422);
      });

      it('should reject missing email', async () => {
        await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Test User',
            eventSlug: publicEvent.slug,
          })
          .expect(422);
      });
    });

    describe('Group event restrictions', () => {
      it('should reject quick RSVP for events requiring group membership', async () => {
        const timestamp = Date.now();
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Group Test User',
            email: `grouptest.${timestamp}@example.com`,
            eventSlug: groupEventWithMembershipRequired.slug,
          })
          .expect(403);

        expect(response.body.message).toMatch(/group membership/i);
      });

      it('should return clear error message directing to full registration', async () => {
        const timestamp = Date.now();
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Group Test User',
            email: `grouptest2.${timestamp}@example.com`,
            eventSlug: groupEventWithMembershipRequired.slug,
          })
          .expect(403);

        expect(response.body.message).toContain(
          'Please register for a full account',
        );
      });

      it('should ALLOW quick RSVP for group events NOT requiring membership', async () => {
        const timestamp = Date.now();
        const response = await request(app)
          .post('/api/v1/auth/quick-rsvp')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            name: 'Group Event No Membership Test',
            email: `groupnomembership.${timestamp}@example.com`,
            eventSlug: groupEventNoMembershipRequired.slug,
          })
          .expect(201);

        expect(response.body).toMatchObject({
          success: true,
          message: expect.stringContaining('calendar invite'),
        });
        expect(response.body.verificationCode).toBeUndefined();
      });
    });
  });

  // NOTE: verify-email-code tests have been removed from this file
  // because Quick RSVP no longer uses verification codes.
  // The verify-email-code endpoint is still used for passwordless login
  // and should be tested in a separate passwordless-login.e2e-spec.ts file.

  describe('Integration: Complete quick RSVP flow', () => {
    it('should complete full flow: RSVP → calendar invite sent → RSVP created', async () => {
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
      expect(rsvpResponse.body.message).toContain('calendar invite');
      expect(rsvpResponse.body.verificationCode).toBeUndefined();

      // Step 2: Verify RSVP was created by checking attendees endpoint
      const attendeesResponse = await request(app)
        .get(`/api/events/${publicEvent.slug}/attendees`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(200);

      // User should be in the attendees list with confirmed status
      const userAttendee = attendeesResponse.body.data.find(
        (a: any) => a.user.name === 'Full Flow Test',
      );
      expect(userAttendee).toBeDefined();
      expect(userAttendee.status).toBe('confirmed');
      expect(userAttendee.user).toBeDefined();
      expect(userAttendee.user.name).toBe('Full Flow Test');
    });
  });
});
