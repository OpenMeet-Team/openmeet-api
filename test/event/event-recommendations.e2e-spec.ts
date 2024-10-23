import request from 'supertest';
import { APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { Status } from '../../src/core/constants/constant';
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

  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should return recommended events', async () => {
    // Create categories
    const category1 = await createCategory(APP_URL, token, {
      name: 'Category 1',
      slug: 'category-1',
    });
    const category2 = await createCategory(APP_URL, token, {
      name: 'Category 2',
      slug: 'category-2',
    });
    const categoryUnrelated = await createCategory(APP_URL, token, {
      name: 'Category Unrelated',
      slug: 'category-unrelated',
    });

    // Create a main event
    testEvent = await createEvent(APP_URL, token, {
      name: 'Main Event',
      description: 'Main event description',
      status: Status.Published,
      categories: [category1.id, category2.id],
      startDate: new Date().toISOString(),
      maxAttendees: 100,
      type: 'in person',
    });

    // Create some potential recommended events
    await createEvent(APP_URL, token, {
      name: 'Recommended Event 1',
      description: 'Recommended event 1 description',
      status: Status.Published,
      startDate: new Date().toISOString(),
      categories: [category1.id],
      type: 'in person',
      maxAttendees: 100,
    });

    await createEvent(APP_URL, token, {
      name: 'Recommended Event 2',
      description: 'Recommended event 2 description',
      status: Status.Published,
      startDate: new Date().toISOString(),
      categories: [category2.id],
      type: 'hybrid',
      maxAttendees: 100,
    });

    await createEvent(APP_URL, token, {
      name: 'Unrelated Event',
      description: 'Unrelated event description',
      status: Status.Published,
      categories: [categoryUnrelated.id],
      startDate: new Date().toISOString(),
      type: 'in person',
      maxAttendees: 100,
    });

    // get all events and check that there are at least the number we created
    const allEvents = await getAllEvents(APP_URL, token);
    expect(allEvents.data).toBeInstanceOf(Array);
    expect(allEvents.data.length).toBeGreaterThanOrEqual(4);

    // Get recommended events
    const recommendedEvents = await getRecommendedEvents(
      APP_URL,
      token,
      testEvent.id,
    );
    expect(recommendedEvents).toBeInstanceOf(Array);
    expect(recommendedEvents.length).toBeGreaterThanOrEqual(2);
    expect(recommendedEvents.length).toBeLessThanOrEqual(5);

    // Check that the recommended events have the correct categories
    recommendedEvents.forEach((event) => {
      if (event.categories) {
        expect(event.categories).toBeDefined();
        expect(event.categories).toBeInstanceOf(Array);
        expect(event.categories.length).toBeGreaterThan(0);
        expect(
          event.categories.some((cat) =>
            ['Category 1', 'Category 2'].includes(cat.name),
          ),
        ).toBeTruthy();
      }
    });

    // Check that the main event is not in the recommended events
    expect(
      recommendedEvents.some((event) => event.id === testEvent.id),
    ).toBeFalsy();

    // Check that the unrelated event is not in the recommended events
    expect(
      recommendedEvents.some((event) => event.name === 'Unrelated Event'),
    ).toBeFalsy();
  });

  it('should return 404 for non-existent event', async () => {
    await request(APP_URL)
      .get('/api/events/99999/recommended-events')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .expect(404);
  });

  afterEach(async () => {
    if (testEvent && testEvent.id) {
      await request(APP_URL)
        .delete(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID);
    }
  });
});
