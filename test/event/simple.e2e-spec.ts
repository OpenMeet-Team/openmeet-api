import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('Events Module', () => {
  const app = APP_URL;
  let authToken: string;
  let serverApp;

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
        description: 'This is a test event',
        startDate: new Date(),
        endDate: new Date(new Date().getTime() + 3600000), // 1 hour later
        userId: 2,
        categories: [1],
        type: 'hybrid',
        maxAttendees: 10,
      };

      const req = serverApp.post('/api/events').send(newEvent);
      const response = await req;

      expect(response.status).toBe(201);
      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(newEvent.name);

      // clean up
      const deleteResponse = await serverApp.delete(
        `/api/events/${response.body.id}`,
      );
      expect(deleteResponse.status).toBe(200);
    });
  });
});
