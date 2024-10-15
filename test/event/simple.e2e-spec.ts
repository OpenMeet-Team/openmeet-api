import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('Events Module', () => {
  const app = APP_URL;
  let authToken: string;
  let serverApp;

  // Set up authentication before running tests
  beforeAll(async () => {
    authToken = await getAuthToken(app, TESTER_EMAIL, TESTER_PASSWORD);
    serverApp = request
      .agent(app)
      .set('tenant-id', '1')
      .set('Authorization', `Bearer ${authToken}`);
  });

  describe('Create Event', () => {
    it('should successfully create an event and delete it', async () => {
      const newEvent = {
        name: 'Test Event',
        slug: 'test-event',
        image: 'test-image-url',
        description: 'This is a test event',
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
      };

      // Create the event
      const createResponse = await serverApp.post('/api/events').send(newEvent);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toBeDefined();
      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.name).toBe(newEvent.name);

      const eventId = createResponse.body.id;

      // Verify the event exists with a GET request
      const getResponse = await serverApp.get(`/api/events/${eventId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.id).toBe(eventId);
      expect(getResponse.body.name).toBe(newEvent.name);

      // Delete the event
      const deleteResponse = await serverApp.delete(`/api/events/${eventId}`);
      console.log('Delete Response:', deleteResponse.body); // Debugging

      expect(deleteResponse.status).toBe(200);
    });
  });
});
