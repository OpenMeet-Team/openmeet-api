import request from 'supertest';
import { APP_URL } from '../utils/constants';
import { loginAsTester, createEvent } from '../utils/functions';

describe('Event Comments API Tests', () => {
  let token: string;
  let testEvent: any;

  const commentData = {
    message: 'hello',
  };

  beforeAll(async () => {
    // Log in as a test user and get a token
    token = await loginAsTester();

    // Create an event to add comments to
    testEvent = await createEvent(APP_URL, token, {
      name: 'Comment Test Event',
      slug: 'comment-test-event',
      description: 'Testing event comments',
      startDate: new Date().toISOString(),
      endDate: new Date(new Date().getTime() + 3600000).toISOString(), // 1 hour later
      type: 'hybrid',
      location: 'Test Location',
      locationOnline: 'https://test-event.com',
      maxAttendees: 10,
      categories: [],
      lat: 0.0,
      lon: 0.0,
      status: 'draft',
      group: null,
    });
  });

  afterAll(async () => {
    // Clean up by deleting the event after tests
    if (testEvent && testEvent.id) {
      await request(APP_URL)
        .delete(`/api/events/${testEvent.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', '1');
    }
  });

  // Test Case 1: Add Comment to Event
  it('should add a comment to the event', async () => {
    const response = await request(APP_URL)
      .post(`/api/events/${testEvent.id}/comment`)
      .send(commentData)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(response.status).toBe(201);
    // expect(response.body.result).toBe('success');
  });

  // Test Case 2: Add Comment Reply to a Topic in the Event
  it('should add a reply to a specific topic in the event', async () => {
    const topicName = '1730800283447-hello'; // Use a unique topic name
    const replyData = { message: 'string' };

    const response = await request(APP_URL)
      .post(`/api/events/comment-reply/${testEvent.id}/${topicName}`)
      .send(replyData)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(response.status).toBe(201);
    // expect(response.body.result).toBe('success');
  });

  // Test Case 3: Retrieve Comments for an Event
  it('should retrieve comments for the event', async () => {
    const response = await request(APP_URL)
      .get(`/api/events/get-comments/${testEvent.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });
});
