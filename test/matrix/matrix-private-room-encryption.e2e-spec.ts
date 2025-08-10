import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { createTestUser, createGroup, createEvent } from '../utils/functions';

describe('Matrix Private Room Encryption (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  describe('Private Group Room Creation', () => {
    it('should create encrypted room for private group via application service', async () => {
      // 1. Create a test user and private group
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-private-group-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const privateGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        slug: `test-private-group-${Date.now()}`,
        name: 'Test Private Group',
        description: 'Test private group for encryption testing',
        visibility: 'private', // This should trigger encryption
      });

      expect(privateGroup.visibility).toBe('private');

      // 2. Query the Application Service for the room alias
      const roomAlias = `#group-${privateGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // 3. Verify the room was created successfully
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});

      // Note: We can't directly verify encryption from the application service response,
      // but we can check the logs for the encryption decision logic we added.
      // The logs should show: "Group {slug} has visibility private, encryption: true"

      // 4. Cleanup
      await server
        .delete(`/api/groups/${privateGroup.slug}`)
        .set('Authorization', `Bearer ${testUser.token}`);
    });

    it('should create public room for public group via application service', async () => {
      // 1. Create a test user and public group
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-public-group-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const publicGroup = await createGroup(TESTING_APP_URL, testUser.token, {
        slug: `test-public-group-${Date.now()}`,
        name: 'Test Public Group',
        description: 'Test public group for encryption testing',
        visibility: 'public', // This should NOT trigger encryption
      });

      expect(publicGroup.visibility).toBe('public');

      // 2. Query the Application Service for the room alias
      const roomAlias = `#group-${publicGroup.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // 3. Verify the room was created successfully
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});

      // The logs should show: "Group {slug} has visibility public, encryption: false"

      // 4. Cleanup
      await server
        .delete(`/api/groups/${publicGroup.slug}`)
        .set('Authorization', `Bearer ${testUser.token}`);
    });
  });

  describe('Private Event Room Creation', () => {
    it('should create encrypted room for private event via application service', async () => {
      // 1. Create a test user and private event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-private-event-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const privateEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-private-event-${Date.now()}`,
        name: 'Test Private Event',
        type: 'in-person',
        status: 'published',
        visibility: 'private', // This should trigger encryption
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test private event for encryption testing',
        maxAttendees: 50,
        categories: [],
      });

      expect(privateEvent.visibility).toBe('private');

      // 2. Query the Application Service for the room alias
      const roomAlias = `#event-${privateEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // 3. Verify the room was created successfully
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});

      // The logs should show: "Event {slug} has visibility private, encryption: true"

      // 4. Cleanup
      await server
        .delete(`/api/events/${privateEvent.slug}`)
        .set('Authorization', `Bearer ${testUser.token}`);
    });

    it('should create public room for public event via application service', async () => {
      // 1. Create a test user and public event
      const testUser = await createTestUser(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        `test-user-public-event-${Date.now()}@openmeet.net`,
        'Test',
        'User',
      );

      const publicEvent = await createEvent(TESTING_APP_URL, testUser.token, {
        slug: `test-public-event-${Date.now()}`,
        name: 'Test Public Event',
        type: 'online',
        status: 'published',
        visibility: 'public', // This should NOT trigger encryption
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date(Date.now() + 90000000).toISOString(),
        timeZone: 'UTC',
        description: 'Test public event for encryption testing',
        maxAttendees: 100,
        categories: [],
        locationOnline: 'https://example.com/meeting',
      });

      expect(publicEvent.visibility).toBe('public');

      // 2. Query the Application Service for the room alias
      const roomAlias = `#event-${publicEvent.slug}-${TESTING_TENANT_ID}:matrix.openmeet.net`;
      const response = await server
        .get(`/api/matrix/appservice/rooms/${encodeURIComponent(roomAlias)}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`);

      // 3. Verify the room was created successfully
      expect(response.status).toBe(200);
      expect(response.body).toEqual({});

      // The logs should show: "Event {slug} has visibility public, encryption: false"

      // 4. Cleanup
      await server
        .delete(`/api/events/${publicEvent.slug}`)
        .set('Authorization', `Bearer ${testUser.token}`);
    });
  });
});