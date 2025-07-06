import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsAdmin,
  createEvent,
  createGroup,
  getEvent,
} from '../utils/functions';
import {
  EventType,
  EventStatus,
  GroupStatus,
} from '../../src/core/constants/constant';

// Set a global timeout for this entire test file
jest.setTimeout(60000);

describe('Matrix Bot Operations (E2E)', () => {
  describe('Bot Authentication', () => {
    it('should authenticate bot successfully', async () => {
      console.log('🤖 Testing bot authentication via event creation...');

      const token = await loginAsAdmin();
      const eventData = {
        name: `Bot Test Event ${Date.now()}`,
        slug: `bot-test-event-${Date.now()}`,
        description: 'A test event for bot operations',
        startDate: '2024-12-31T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://test-online-location.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      const testEvent = await createEvent(TESTING_APP_URL, token, eventData);

      // Creating an event should trigger bot room creation, which tests bot authentication
      expect(testEvent).toBeDefined();
      expect(testEvent.slug).toBeDefined();
      console.log('✅ Bot authenticated successfully (event created)');
    });
  });

  describe('Bot Room Creation', () => {
    it('should create Matrix room for event', async () => {
      console.log('🏠 Testing bot room creation for event...');

      const token = await loginAsAdmin();
      const eventData = {
        name: `Bot Test Event ${Date.now()}`,
        slug: `bot-test-event-${Date.now()}`,
        description: 'A test event for bot operations',
        startDate: '2024-12-31T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://test-online-location.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      const testEvent = await createEvent(TESTING_APP_URL, token, eventData);

      // Join the event chat room (triggers Matrix room creation by bot)
      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${testEvent.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(joinResponse.status).toBe(201);
      expect(joinResponse.body).toHaveProperty('success');
      expect(joinResponse.body.success).toBe(true);

      // Verify the event now has a Matrix room ID
      const updatedEvent = await getEvent(
        TESTING_APP_URL,
        token,
        testEvent.slug,
      );
      expect(updatedEvent).toHaveProperty('matrixRoomId');
      expect(updatedEvent.matrixRoomId).toMatch(/^!/); // Matrix room IDs start with !
      console.log(`✅ Bot created Matrix room: ${updatedEvent.matrixRoomId}`);
    });

    it('should create Matrix room for group', async () => {
      console.log('🏠 Testing bot room creation for group...');

      const token = await loginAsAdmin();
      const groupData = {
        name: `Bot Test Group ${Date.now()}`,
        slug: `bot-test-group-${Date.now()}`,
        description: 'A test group for bot operations',
        type: 'public',
        status: GroupStatus.Published,
        categories: [1],
      };

      const testGroup = await createGroup(TESTING_APP_URL, token, groupData);

      // Join the group chat room (triggers Matrix room creation by bot)
      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${testGroup.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(joinResponse.status).toBe(201);
      expect(joinResponse.body).toHaveProperty('success');
      expect(joinResponse.body.success).toBe(true);

      // Verify the group now has a Matrix room ID
      const groupResponse = await request(TESTING_APP_URL)
        .get(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      expect(groupResponse.status).toBe(200);
      expect(groupResponse.body).toHaveProperty('matrixRoomId');
      expect(groupResponse.body.matrixRoomId).toMatch(/^!/); // Matrix room IDs start with !
      console.log(
        `✅ Bot created Matrix room: ${groupResponse.body.matrixRoomId}`,
      );
    });
  });

  describe('Bot Room Management', () => {
    it('should handle user joining event chat room', async () => {
      console.log('🚪 Testing bot room management - join event...');

      const token = await loginAsAdmin();
      const eventData = {
        name: `Bot Test Event ${Date.now()}`,
        slug: `bot-test-event-${Date.now()}`,
        description: 'A test event for bot operations',
        startDate: '2024-12-31T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://test-online-location.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      const testEvent = await createEvent(TESTING_APP_URL, token, eventData);

      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${testEvent.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(joinResponse.status).toBe(201);
      expect(joinResponse.body).toHaveProperty('success');
      expect(joinResponse.body.success).toBe(true);
      expect(joinResponse.body).toHaveProperty('message');
      console.log(`✅ Bot handled room join: ${joinResponse.body.message}`);
    });

    it.skip('should handle user leaving event chat room', async () => {
      console.log('🚪 Testing bot room management - leave event...');

      const token = await loginAsAdmin();
      const eventData = {
        name: `Bot Test Event ${Date.now()}`,
        slug: `bot-test-event-${Date.now()}`,
        description: 'A test event for bot operations',
        startDate: '2024-12-31T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'https://test-online-location.com',
        maxAttendees: 100,
        categories: [1],
        lat: 40.7128,
        lon: -74.006,
        status: EventStatus.Published,
        timeZone: 'UTC',
      };

      const testEvent = await createEvent(TESTING_APP_URL, token, eventData);

      // First join the room
      await request(TESTING_APP_URL)
        .post(`/api/chat/event/${testEvent.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Then leave the room
      const leaveResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/event/${testEvent.slug}/leave`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(leaveResponse.status).toBe(200);
      console.log('✅ Bot handled room leave successfully');
    });

    it('should handle user joining group chat room', async () => {
      console.log('🚪 Testing bot room management - join group...');

      const token = await loginAsAdmin();
      const groupData = {
        name: `Bot Test Group ${Date.now()}`,
        slug: `bot-test-group-${Date.now()}`,
        description: 'A test group for bot operations',
        type: 'public',
        status: GroupStatus.Published,
        categories: [1],
      };

      const testGroup = await createGroup(TESTING_APP_URL, token, groupData);

      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${testGroup.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(joinResponse.status).toBe(201);
      expect(joinResponse.body).toHaveProperty('success');
      expect(joinResponse.body.success).toBe(true);
      expect(joinResponse.body).toHaveProperty('message');
      console.log(`✅ Bot handled room join: ${joinResponse.body.message}`);
    });

    it.skip('should handle user leaving group chat room', async () => {
      console.log('🚪 Testing bot room management - leave group...');

      const token = await loginAsAdmin();
      const groupData = {
        name: `Bot Test Group ${Date.now()}`,
        slug: `bot-test-group-${Date.now()}`,
        description: 'A test group for bot operations',
        type: 'public',
        status: GroupStatus.Published,
        categories: [1],
      };

      const testGroup = await createGroup(TESTING_APP_URL, token, groupData);

      // First join the room
      await request(TESTING_APP_URL)
        .post(`/api/chat/group/${testGroup.slug}/join`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      // Then leave the room
      const leaveResponse = await request(TESTING_APP_URL)
        .post(`/api/chat/group/${testGroup.slug}/leave`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send({});

      expect(leaveResponse.status).toBe(200);
      console.log('✅ Bot handled room leave successfully');
    });
  });

});
