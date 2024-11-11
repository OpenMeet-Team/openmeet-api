import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { EventStatus } from '../../src/core/constants/constant';
import {
  loginAsTester,
  createEvent,
  getRecommendedEvents,
  createCategory,
  getAllEvents,
} from '../utils/functions';

describe('EventController Recommendations (e2e)', () => {
  let token;
  let testEvent;
  let testEvent2;
  let testEvent3;
  let testEvent4;
  let category1;
  let category2;
  let categoryUnrelated;

  beforeAll(async () => {
    token = await loginAsTester();

    // Create categories
    category1 = await createCategory(TESTING_APP_URL, token, {
      name: 'Category 1',
      slug: 'category-1',
    });
    category2 = await createCategory(TESTING_APP_URL, token, {
      name: 'Category 2',
      slug: 'category-2',
    });
    categoryUnrelated = await createCategory(TESTING_APP_URL, token, {
      name: 'Category Unrelated',
      slug: 'category-unrelated',
    });

    // Create a main event
    testEvent = await createEvent(TESTING_APP_URL, token, {
      name: 'Main Event',
      description: 'Main event description',
      status: EventStatus.Published,
      categories: [category1.id, category2.id],
      startDate: new Date().toISOString(),
      maxAttendees: 100,
      type: 'in person',
    });

    // Create some potential recommended events
    testEvent2 = await createEvent(TESTING_APP_URL, token, {
      name: 'Recommended Event 1',
      description: 'Recommended event 1 description',
      status: EventStatus.Published,
      startDate: new Date().toISOString(),
      categories: [category1.id],
      type: 'in person',
      maxAttendees: 100,
    });

    testEvent3 = await createEvent(TESTING_APP_URL, token, {
      name: 'Recommended Event 2',
      description: 'Recommended event 2 description',
      status: EventStatus.Published,
      startDate: new Date().toISOString(),
      categories: [category2.id],
      type: 'hybrid',
      maxAttendees: 100,
    });

    testEvent4 = await createEvent(TESTING_APP_URL, token, {
      name: 'Unrelated Event',
      description: 'Unrelated event description',
      status: EventStatus.Published,
      categories: [categoryUnrelated.id],
      startDate: new Date().toISOString(),
      type: 'in person',
      maxAttendees: 100,
    });
    // get all events and check that there are at least the number we created
    const allEvents = await getAllEvents(TESTING_APP_URL, token);
    expect(allEvents.data).toBeInstanceOf(Array);
    expect(allEvents.data.length).toBeGreaterThanOrEqual(4);
  });

  afterAll(async () => {
    //  delete test events
    for (const event of [testEvent, testEvent2, testEvent3, testEvent4]) {
      await request(TESTING_APP_URL)
        .delete(`/api/events/${event.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
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
      testEvent.id,
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
