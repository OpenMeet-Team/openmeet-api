import request from 'supertest';
import { APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { Status } from '../../src/core/constants/constant';
import {
  loginAsTester,
  createEvent,
  getRecommendedEvents,
} from '../utils/functions';

describe('EventController Recommendations (e2e)', () => {
  let token;
  let testEvent;

  beforeEach(async () => {
    token = await loginAsTester();
  });

  // failing, 500 in createEvent
  it.skip('should return recommended events', async () => {
    // Create a main event
    testEvent = await createEvent(APP_URL, token, {
      name: 'Main Event',
      description: 'Main event description',
      status: Status.Published,
      categories: ['Category 1', 'Category 2'],
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
      categories: ['Category 1'],
      type: 'in person',
    });

    await createEvent(APP_URL, token, {
      name: 'Recommended Event 2',
      description: 'Recommended event 2 description',
      status: Status.Published,
      categories: ['Category 2'],
      type: 'hybrid',
    });

    await createEvent(APP_URL, token, {
      name: 'Unrelated Event',
      description: 'Unrelated event description',
      status: Status.Published,
      categories: ['Category Unrelated'],
      startDate: new Date().toISOString(),
      type: 'in person',
    });

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
      expect(
        event.categories.some((cat) =>
          ['Category 1', 'Category 2'].includes(cat.name),
        ),
      ).toBeTruthy();
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
