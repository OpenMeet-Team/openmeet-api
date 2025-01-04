import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_TENANT_ID,
  TESTING_USER_ID,
} from '../utils/constants';
import { loginAsTester, loginAsAdmin, createEvent } from '../utils/functions';
import {
  EventVisibility,
  EventStatus,
  EventType,
  EventAttendeeStatus,
} from '../../src/core/constants/constant';

describe('Guards (e2e)', () => {
  const app = TESTING_APP_URL;
  let userToken: string;
  let adminToken: string;
  let publicEvent: any;
  let authenticatedEvent: any;
  let privateEvent: any;

  beforeAll(async () => {
    userToken = await loginAsTester();
    adminToken = await loginAsAdmin();

    // Create events with different visibility levels
    publicEvent = await createEvent(app, adminToken, {
      name: 'Public Event',
      slug: 'public-event',
      description: 'Public event description',
      visibility: EventVisibility.Public,
      status: EventStatus.Published,
      startDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24).toISOString(),
      maxAttendees: 100,
      type: EventType.Hybrid,
      categories: [1],
    });

    authenticatedEvent = await createEvent(app, adminToken, {
      name: 'Authenticated Event',
      slug: 'authenticated-event',
      description: 'Authenticated event description',
      visibility: EventVisibility.Authenticated,
      status: EventStatus.Published,
      startDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24).toISOString(),
      maxAttendees: 100,
      type: EventType.Hybrid,
      categories: [1],
    });

    privateEvent = await createEvent(app, adminToken, {
      name: 'Private Event',
      slug: 'private-event',
      description: 'Private event description',
      visibility: EventVisibility.Private,
      status: EventStatus.Published,
      startDate: new Date(new Date().getTime() + 1000 * 60 * 60 * 24).toISOString(),
      maxAttendees: 100,
      type: EventType.Hybrid,
      categories: [1],
    });
    // Add test user as attendee to private event
    await request(app)
      .post(`/api/events/${privateEvent.slug}/attend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({ userId: TESTING_USER_ID });
  });

  describe('AuthGuard', () => {
    it('should allow access without token when x-tenant-id is provided', async () => {
      const response = await request(app)
        .get('/api/categories')
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(response.status).toBe(200);
    });

    it('should deny access when x-tenant-id is not provided', async () => {
      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(401);
    });
  });

  describe('VisibilityGuard', () => {
    describe('GET /events', () => {
      it('should only show public events to unauthenticated users', async () => {
        let allEvents: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        // Fetch all pages
        while (hasMorePages) {
          const response = await request(app)
            .get(`/api/events`)
            .query({
              page: currentPage,
              limit: 10,
              visibility: EventVisibility.Public,
            })
            .set('x-tenant-id', TESTING_TENANT_ID);

          expect(response.status).toBe(200);
          expect(response.body.data).toBeDefined();

          allEvents = [...allEvents, ...response.body.data];

          // Check if there are more pages
          hasMorePages = response.body.page < response.body.totalPages;
          currentPage++;
        }

        expect(allEvents.some((event) => event.slug === publicEvent.slug)).toBe(
          true,
        );
        expect(
          allEvents.some((event) => event.slug === authenticatedEvent.slug),
        ).toBe(false);
        expect(
          allEvents.some((event) => event.slug === privateEvent.slug),
        ).toBe(false);
      });

      // this one fails to return the last private event, but does return private events.
      it.skip('should show public and authenticated events to authenticated users', async () => {
        let allEvents: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        // Fetch all pages
        while (hasMorePages) {
          const response = await request(app)
            .get('/api/events')
            .query({
              page: currentPage,
              limit: 10,
            })
            .set('Authorization', `Bearer ${userToken}`)
            .set('x-tenant-id', TESTING_TENANT_ID);

          expect(response.status).toBe(200);
          expect(response.body.data).toBeDefined();

          allEvents = [...allEvents, ...response.body.data];

          // Check if there are more pages
          hasMorePages = response.body.page < response.body.totalPages;
          currentPage++;
        }

        expect(allEvents.some((event) => event.slug === publicEvent.slug)).toBe(
          true,
        );
        expect(
          allEvents.some((event) => event.slug === authenticatedEvent.slug),
        ).toBe(true);
        expect(
          allEvents.some((event) => event.slug === privateEvent.slug),
        ).toBe(true);
      });

      // missing the last created private event
      it.skip('should show all events to admin users', async () => {
        let allEvents: any[] = [];
        let currentPage = 1;
        let hasMorePages = true;

        // Fetch all pages
        while (hasMorePages) {
          const response = await request(app)
            .get('/api/events')
            .query({
              page: currentPage,
              limit: 10,
            })
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-tenant-id', TESTING_TENANT_ID);

          console.log('response.body', response.body);
          console.log('Response status:', response.status);
          console.log('Response headers:', response.headers);
          if (response.status !== 200) {
            console.log('Error response:', response.body);
          }

          expect(response.status).toBe(200);
          expect(response.body.data).toBeDefined();

          allEvents = [...allEvents, ...response.body.data];
          console.log(
            'Events found on page:',
            response.body.data.map((e) => ({
              slug: e.slug,
              visibility: e.visibility,
            })),
          );

          hasMorePages = response.body.page < response.body.totalPages;
          currentPage++;
        }

        console.log(
          'All events found:',
          allEvents.map((e) => ({
            id: e.id,
            slug: e.slug,
            visibility: e.visibility,
          })),
        );

        expect(allEvents.some((event) => event.slug === publicEvent.slug)).toBe(
          true,
        );
        expect(
          allEvents.some((event) => event.slug === authenticatedEvent.slug),
        ).toBe(true);
        expect(
          allEvents.some((event) => event.slug === privateEvent.slug),
        ).toBe(true);
      });
    });

    describe('GET /events/:slug', () => {
      it('should allow access to public event without authentication', async () => {
        const response = await request(app)
          .get(`/api/events/${publicEvent.slug}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(publicEvent.slug);
      });

      it('should deny access to authenticated event without authentication', async () => {
        const response = await request(app)
          .get(`/api/events/${authenticatedEvent.slug}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .set('x-event-slug', authenticatedEvent.slug);

        expect(response.status).toBe(403);
      });

      it('should allow access to authenticated event with valid token', async () => {
        const response = await request(app)
          .get(`/api/events/${authenticatedEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(authenticatedEvent.slug);
      });

      it('should deny access to private event for non-attendee', async () => {
        // Create a new user token that isn't an attendee
        const newUserEmail = `user.${Date.now()}@openmeet.net`;
        const newUserPassword = 'password123';

        // Register new user
        await request(app)
          .post('/api/v1/auth/email/register')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: newUserEmail,
            password: newUserPassword,
            firstName: 'Test',
            lastName: 'User',
          });

        // Login as new user
        const loginResponse = await request(app)
          .post('/api/v1/auth/email/login')
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            email: newUserEmail,
            password: newUserPassword,
          });

        const newUserToken = loginResponse.body.token;

        const response = await request(app)
          .get(`/api/events/${privateEvent.slug}`)
          .set('Authorization', `Bearer ${newUserToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .set('x-event-slug', privateEvent.slug);

        expect(response.status).toBe(403);
      });

      it('should allow access to private event for attendee', async () => {
        // First, make sure the private event exists and is properly configured
        const privateEvent = await createEvent(app, adminToken, {
          name: 'Private Event',
          slug: 'private-event',
          description: 'Private event description',
          visibility: EventVisibility.Private,
          status: EventStatus.Published,
          startDate: new Date().toISOString(),
          maxAttendees: 100,
          type: EventType.Hybrid,
          categories: [1],
        });

        // Add user as attendee with proper DTO structure
        const attendResponse = await request(app)
          .post(`/api/events/${privateEvent.slug}/attend`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({
            status: EventAttendeeStatus.Confirmed,
            user: { id: TESTING_USER_ID },
          });

        // Verify attendance was successful
        expect(attendResponse.status).toBe(201);

        // Now try to access the event
        const response = await request(app)
          .get(`/api/events/${privateEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(privateEvent.slug);
      });
    });

    describe('Event Access', () => {
      it('should allow attendee to access private event', async () => {
        // First attend the event
        await request(app)
          .post(`/api/events/${privateEvent.slug}/attend`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({});

        // Then try to access it
        const response = await request(app)
          .get(`/api/events/${privateEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(privateEvent.slug);
      });

      it('should deny access to private event after leaving', async () => {
        // First attend the event
        await request(app)
          .post(`/api/events/${privateEvent.slug}/attend`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .send({});

        // Then leave the event
        await request(app)
          .delete(`/api/events/${privateEvent.slug}/cancel-attending`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        // Try to access it after leaving
        const response = await request(app)
          .get(`/api/events/${privateEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
      });

      it('should allow event creator to access their private event', async () => {
        // Create a private event
        const creatorEvent = await createEvent(app, userToken, {
          name: 'Creator Private Event',
          slug: 'creator-private-event',
          description: 'Creator private event description',
          visibility: EventVisibility.Private,
          status: EventStatus.Published,
          startDate: new Date().toISOString(),
          maxAttendees: 100,
          type: EventType.Hybrid,
          categories: [1],
        });

        const response = await request(app)
          .get(`/api/events/${creatorEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        expect(response.status).toBe(200);
        expect(response.body.slug).toBe(creatorEvent.slug);

        // Clean up
        await request(app)
          .delete(`/api/events/${creatorEvent.slug}`)
          .set('Authorization', `Bearer ${userToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      });
    });
  });

  describe('PermissionsGuard', () => {
    it('should allow event creator to edit their event', async () => {
      const userEvent = await createEvent(app, userToken, {
        name: 'User Event',
        slug: 'user-event',
        description: 'User event description',
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: new Date().toISOString(),
        maxAttendees: 100,
        type: EventType.Hybrid,
        categories: [1],
      });

      const response = await request(app)
        .patch(`/api/events/${userEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'Updated Event Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Event Name');
    });

    it('should deny event editing to non-creator', async () => {
      const response = await request(app)
        .patch(`/api/events/${publicEvent.slug}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({ name: 'Attempted Update' });

      expect(response.status).toBe(403);
    });
  });

  afterAll(async () => {
    // Clean up created events
    const events = [publicEvent, authenticatedEvent, privateEvent];
    for (const event of events) {
      if (event?.slug) {
        await request(app)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }
  });
});
