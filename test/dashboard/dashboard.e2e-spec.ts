import { APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD } from '../utils/constants';
import request from 'supertest';
import { getAuthToken } from '../utils/functions';

async function createGroup(
  app: string,
  authToken: string,
  groupData: any,
): Promise<any> {
  const server = request(app);
  const response = await server
    .post('/groups')
    .set('Authorization', `Bearer ${authToken}`)
    .send(groupData);
  return response.body;
}

async function createEvent(
  app: string,
  authToken: string,
  eventData: any,
): Promise<any> {
  const server = request(app);
  const response = await server
    .post('/events')
    .set('Authorization', `Bearer ${authToken}`)
    .send(eventData);
  return response.body;
}

async function createGroupsAndEvents(
  app: string,
  email: string,
  password: string,
) {
  const authToken = await getAuthToken(app, email, password);

  const groupData = {
    name: 'Test Group',
    description: 'A group created for testing purposes',
    status: 'active',
  };

  const group = await createGroup(app, authToken, groupData);

  const eventData = {
    name: 'Test Event',
    description: 'An event created for testing purposes',
    type: 'public',
    startDate: new Date(),
    endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // One day after the start date
    maxAttendees: 100,
    location: 'Virtual',
    status: 'scheduled',
    groupId: group.id,
  };
  const event = await createEvent(app, authToken, eventData);

  return { group, event };
}

describe('Dashboard', () => {
  const app = APP_URL;
  let authToken: string;

  beforeAll(async () => {
    authToken = await getAuthToken(app, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createGroupsAndEvents(app, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  describe('my-events', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const server = request.agent(app).set('tenant-id', '1');
        const req = server.get('/api/dashboard/my-events');
        const response = await req;
        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should get created events', async () => {
        const server = request
          .agent(app)
          .set('tenant-id', '1')
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-events');
        const response = await req;

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        console.log('response.body', response.body);
      });
    });
  });

  describe('my-groups', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const server = request.agent(app).set('tenant-id', '1');
        const req = server.get('/api/dashboard/my-groups');
        const response = await req;
        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it('should get groups', async () => {
        const server = request
          .agent(app)
          .set('tenant-id', '1')
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-groups');
        const response = await req;
        expect(response.status).toBe(200);
      });
    });
  });
});
