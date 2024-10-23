import request from 'supertest';
import {
  APP_URL,
  TESTER_EMAIL,
  TESTER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { EventEntity } from '../../src/event/infrastructure/persistence/relational/entities/event.entity';
import { CategoryEntity } from '../../src/category/infrastructure/persistence/relational/entities/categories.entity';
import { Status } from '../../src/core/constants/constant';

describe('GroupRecommendations (e2e)', () => {
  let token;
  let testGroup;
  let testEvents: EventEntity[] = [];
  let testCategories: CategoryEntity[] = [];

  // Helper function to log in as the test user
  async function loginAsTester() {
    const loginResponse = await request(APP_URL)
      .post('/api/v1/auth/email/login')
      .set('tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTER_EMAIL,
        password: TESTER_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  // Helper function to create a group
  async function createGroup(token, groupData) {
    const response = await request(APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to create a category
  async function createCategory(token, categoryData) {
    const response = await request(APP_URL)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .send(categoryData);
    // console.log('🚀 ~ createCategory ~ response.body:', response.body);
    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to create an event
  async function createEvent(token, eventData) {
    const response = await request(APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .send(eventData);
    // console.log('🚀 ~ createEvent ~ response.body:', response.body);

    expect(response.status).toBe(201);
    return response.body;
  }

  beforeEach(async () => {
    token = await loginAsTester();

    // Create test categories
    testCategories = await Promise.all([
      createCategory(token, {
        name: 'Tech',
        description: 'Tech category',
        slug: 'tech',
      }),
      createCategory(token, {
        name: 'Social',
        description: 'Social category',
        slug: 'social',
      }),
    ]);

    // Create a test group with categories
    testGroup = await createGroup(token, {
      name: 'Test Group',
      description: 'A test group',
      categories: [testCategories[0].id],
    });

    // Create multiple events with different categories
    const baseEvent = {
      title: 'Test Event',
      description: 'Test Description',
      startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      status: Status.Published,
      maxAttendees: 100,
      type: 'in-person',
    };

    // Create events with matching and non-matching categories
    testEvents = await Promise.all([
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 1',
        groupId: testGroup.id,
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 2',
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 3',
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 4',
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 5',
        categories: [testCategories[0].id],
      }),
      
      createEvent(token, {
        ...baseEvent,
        name: 'Social Event 1',
        categories: [testCategories[1].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Social Event 2',
        categories: [testCategories[1].id],
      }),
    ]);
  });

  it('should return recommended events with complete event details', async () => {
    //  group should exist
    const groupResponse = await request(APP_URL)
      .get(`/api/groups/${testGroup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);
    expect(groupResponse.status).toBe(200);

    const response = await request(APP_URL)
      .get(`/api/groups/${testGroup.id}/recommended-events`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    console.log('🚀 ~ response.body:', response.body);
    expect(response.body.length).toBeGreaterThan(2);

    // Check that each event has the required relations
    response.body.forEach((event) => {
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('categories');
      expect(event).toHaveProperty('attendees');

      // Verify that categories is an array
      expect(Array.isArray(event.categories)).toBe(true);

      // Verify that attendees is an array
      expect(Array.isArray(event.attendees)).toBe(true);
    });
  });

  afterEach(async () => {
    // Clean up events
    for (const event of testEvents) {
      await request(APP_URL)
        .delete(`/api/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID);
    }

    // Clean up group
    if (testGroup) {
      await request(APP_URL)
        .delete(`/api/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID);
    }

    // Clean up categories
    for (const category of testCategories) {
      await request(APP_URL)
        .delete(`/api/categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID);
    }
  });
});
