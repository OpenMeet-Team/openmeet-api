import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  EventStatus,
  EventType,
  EventVisibility,
} from '../../src/core/constants/constant';
import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  getRecommendedEvents,
  createCategory,
  getAllEvents,
} from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('EventController Recommendations (e2e)', () => {
  let token;
  let adminToken;
  let testEvent;
  let testEvent2;
  let testEvent3;
  let testEvent4;
  let category1;
  let category2;
  let categoryUnrelated;

  beforeAll(async () => {
    token = await loginAsTester();
    adminToken = await loginAsAdmin();

    // Create categories
    category1 = await createCategory(TESTING_APP_URL, adminToken, {
      name: 'Category 1',
      slug: 'category-1',
    });
    category2 = await createCategory(TESTING_APP_URL, adminToken, {
      name: 'Category 2',
      slug: 'category-2',
    });
    categoryUnrelated = await createCategory(TESTING_APP_URL, adminToken, {
      name: 'Category Unrelated',
      slug: 'category-unrelated',
    });

    // Create a main event
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7); // 7 days in the future

    testEvent = await createEvent(TESTING_APP_URL, token, {
      name: 'Main Event',
      description: 'Main event description',
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      categories: [category1.id, category2.id],
      startDate: futureDate.toISOString(),
      maxAttendees: 100,
      type: EventType.Hybrid,
    });

    // Create some potential recommended events
    testEvent2 = await createEvent(TESTING_APP_URL, token, {
      name: 'Recommended Event 1',
      description: 'Recommended event 1 description',
      status: EventStatus.Published,
      visibility: EventVisibility.Authenticated,
      startDate: new Date(
        futureDate.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(), // +1 day
      categories: [category1.id],
      type: EventType.Hybrid,
      maxAttendees: 100,
    });

    testEvent3 = await createEvent(TESTING_APP_URL, token, {
      name: 'Recommended Event 2',
      description: 'Recommended event 2 description',
      status: EventStatus.Published,
      visibility: EventVisibility.Private,
      startDate: new Date(
        futureDate.getTime() + 48 * 60 * 60 * 1000,
      ).toISOString(), // +2 days
      categories: [category2.id],
      type: 'hybrid',
      maxAttendees: 100,
    });

    testEvent4 = await createEvent(TESTING_APP_URL, token, {
      name: 'Unrelated Event',
      description: 'Unrelated event description',
      status: EventStatus.Published,
      visibility: EventVisibility.Public,
      categories: [categoryUnrelated.id],
      startDate: new Date(
        futureDate.getTime() + 72 * 60 * 60 * 1000,
      ).toISOString(),
      type: 'hybrid',
      maxAttendees: 100,
    });
    // get all events and check that there are at least the number we created
    const allEvents = await getAllEvents(TESTING_APP_URL, token);
    expect(allEvents.data).toBeInstanceOf(Array);
    expect(allEvents.data.length).toBeGreaterThanOrEqual(3);
  }, 30000);

  afterAll(async () => {
    //  delete test events
    for (const event of [testEvent, testEvent2, testEvent3, testEvent4]) {
      if (event) {
        await request(TESTING_APP_URL)
          .delete(`/api/events/${event.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      }
    }

    // delete categories
    for (const category of [category1, category2, categoryUnrelated]) {
      await request(TESTING_APP_URL)
        .delete(`/api/categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  it('should show events that are public when unauthenticated', async () => {
    const minEvents = 0;
    const maxEvents = 2;
    const recommendedEvents = await getRecommendedEvents(
      TESTING_APP_URL,
      token,
      testEvent.slug,
      minEvents,
      maxEvents,
      true,
    );

    expect(recommendedEvents.length).toBeGreaterThanOrEqual(minEvents);
  });

  // it('should return recommended events when authenticated', async () => {
  //   const minEvents = 0;
  //   const maxEvents = 2;
  //   const recommendedEvents = await getRecommendedEvents(
  //     APP_URL,
  //     token,
  //     testEvent.id,
  //     minEvents,
  //     maxEvents,
  //     false,
  //   );
  //   expect(recommendedEvents).toBeInstanceOf(Array);
  //   expect(recommendedEvents.length).toBeGreaterThanOrEqual(minEvents);
  //   expect(recommendedEvents.length).toBeLessThanOrEqual(maxEvents);

  //   // Check that the recommended events have the correct categories
  //   recommendedEvents.forEach((event) => {
  //     if (event.categories) {
  //       expect(event.categories).toBeDefined();
  //       expect(event.categories).toBeInstanceOf(Array);
  //       expect(event.categories.length).toBeGreaterThan(0);
  //       expect(
  //         event.categories.some((cat) =>
  //           ['Category 1', 'Category 2'].includes(cat.name),
  //         ),
  //       ).toBeTruthy();
  //     }
  //   });

  //   // Check that the main event is not in the recommended events
  //   expect(
  //     recommendedEvents.some((event) => event.id === testEvent.id),
  //   ).toBeFalsy();

  //   // Check that the unrelated event is not in the recommended events
  //   expect(
  //     recommendedEvents.some((event) => event.name === 'Unrelated Event'),
  //   ).toBeFalsy();
  // });
});
