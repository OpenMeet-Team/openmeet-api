import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';
import request from 'supertest';
import { getAuthToken } from '../utils/functions';
import { CreateEventDto } from '../../src/event/dto/create-event.dto';
import { Status } from '../../src/core/constants/constant';

async function createGroup(
  app: string,
  authToken: string,
  groupData: any,
): Promise<any> {
  const server = request(app);
  const response = await server
    .post('/api/groups')
    .set('tenant-id', '1')
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
    .post('/api/events')
    .set('tenant-id', '1')
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
    status: 'published',
    members: [1, 2],
  };
  const group = await createGroup(app, authToken, groupData);

  const eventData: CreateEventDto = {
    name: 'Test Event',
    description: 'An event created for testing purposes',
    type: 'public',
    startDate: new Date(),
    endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // One day after the start date
    maxAttendees: 100,
    location: 'Virtual',
    locationOnline: 'https://example.com/meeting',
    categories: [1],
    is_public: true,
    image: 'https://example.com/event-image.jpg',
    lat: 0,
    lon: 0,
    status: Status.Published,
    group: group.id,
  };

  const event = await createEvent(app, authToken, eventData);
  return { group, event };
}

describe('Dashboard', () => {
  const app = APP_URL;
  let authToken: string;
  let preparedGroup: any;
  let preparedEvent: any;

  beforeAll(async () => {
    authToken = await getAuthToken(app, TESTER_EMAIL, TESTER_PASSWORD);
    const { group, event } = await createGroupsAndEvents(
      app,
      TESTER_EMAIL,
      TESTER_PASSWORD,
    );
    preparedGroup = group;
    preparedEvent = event;
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
        expect(preparedEvent).toBeDefined();
        expect(preparedEvent.id).toBeDefined();

        const server = request
          .agent(app)
          .set('tenant-id', '1')
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-events');
        const response = await req;

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        const userIdToCheck = 2;
        const hasUserCreatedEvent = response.body.some(
          (event) => event.user.id === userIdToCheck,
        );
        expect(hasUserCreatedEvent).toBe(true);

        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: preparedEvent.id,
            }),
          ]),
        );
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
      // TODO: Fix this test, always empty...
      it('should get groups', async () => {
        expect(preparedGroup).toBeDefined();
        expect(preparedGroup.id).toBeDefined();

        const server = request
          .agent(app)
          .set('tenant-id', '1')
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-groups');
        const response = await req;
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        const hasGroupWithExpectedMember = response.body.some(
          (group) => group.id === preparedGroup.id,
        );
        expect(hasGroupWithExpectedMember).toBe(true);
      });
    });
  });
});
