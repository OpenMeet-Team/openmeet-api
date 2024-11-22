import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import { EventEntity } from '../../src/event/infrastructure/persistence/relational/entities/event.entity';
import { CategoryEntity } from '../../src/category/infrastructure/persistence/relational/entities/categories.entity';
import { EventStatus } from '../../src/core/constants/constant';

describe('GroupRecommendations (e2e)', () => {
  let token;
  let testGroup;
  let testGroupSocial;
  let testEvents: EventEntity[] = [];
  let testCategories: CategoryEntity[] = [];

  // Helper function to log in as the test user
  async function loginAsTester() {
    const loginResponse = await request(TESTING_APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTING_USER_EMAIL,
        password: TESTING_USER_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  // Helper function to create a group
  async function createGroup(token, groupData) {
    const response = await request(TESTING_APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to create a category
  async function createCategory(token, categoryData) {
    const response = await request(TESTING_APP_URL)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(categoryData);
    // console.log('🚀 ~ createCategory ~ response.body:', response.body);
    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to create an event
  async function createEvent(token, eventData) {
    const response = await request(TESTING_APP_URL)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
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

    // Create test groups with categories for tech and social
    testGroup = await createGroup(token, {
      name: 'Test Group',
      description: 'A test group',
      categories: [testCategories[0].id],
    });
    testGroupSocial = await createGroup(token, {
      name: 'Test Group Social',
      description: 'A test group',
      categories: [testCategories[1].id],
    });

    // Create multiple events with different categories and groups
    const baseEvent = {
      name: 'Test Event',
      description: 'Test Description',
      startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      status: EventStatus.Published,
      maxAttendees: 100,
      type: 'in-person',
      group: testGroup.id,
    };

    // Create events with matching and non-matching categories
    testEvents = await Promise.all([
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 1',
        group: testGroup.id,
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 2',
        group: null,
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 3',
        group: null,
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 4',
        group: null,
        categories: [testCategories[0].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Tech Event 5',
        group: null,
        categories: [testCategories[0].id],
      }),

      createEvent(token, {
        ...baseEvent,
        name: 'Social Event 1',
        group: testGroupSocial.id,
        categories: [testCategories[1].id],
      }),
      createEvent(token, {
        ...baseEvent,
        name: 'Social Event 2',
        group: null,
        categories: [testCategories[1].id],
      }),
    ]);

    expect(testEvents.length).toBeGreaterThanOrEqual(7);
  });

  it('should return recommended events with complete event details', async () => {
    //  group should exist
    const groupResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(groupResponse.status).toBe(200);

    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}/recommended-events`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(4);

    // test event 1 should not be in the response
    expect(response.body).not.toContain(testEvents[0]);

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
      await request(TESTING_APP_URL)
        .delete(`/api/events/${event.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    // Clean up group
    if (testGroup) {
      await request(TESTING_APP_URL)
        .delete(`/api/groups/${testGroup.slug}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }

    // Clean up categories
    for (const category of testCategories) {
      await request(TESTING_APP_URL)
        .delete(`/api/categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });
});
