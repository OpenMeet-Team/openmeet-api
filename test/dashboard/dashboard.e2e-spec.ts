import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';
import request from 'supertest';
import { getAuthToken } from '../utils/functions';
import {
  createGroupsAndEvents,
  deleteGroup,
  deleteEvent,
} from '../utils/functions';

describe('Dashboard', () => {
  const app = TESTING_APP_URL;
  let authToken: string;
  let preparedGroup: any;
  let preparedEvent: any;

  beforeAll(async () => {
    authToken = await getAuthToken(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
    const { group, event } = await createGroupsAndEvents(
      app,
      TESTING_USER_EMAIL,
      TESTING_USER_PASSWORD,
    );
    preparedGroup = group;
    preparedEvent = event;
  });
  afterAll(async () => {
    await deleteGroup(app, authToken, preparedGroup.id);
    await deleteEvent(app, authToken, preparedEvent.id);
  });

  describe('my-events', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const server = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
        const req = server.get('/api/dashboard/my-events');
        const response = await req;
        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it.skip('should get all events that I am a participant of, or that I created, and no more', async () => {
        expect(preparedEvent).toBeDefined();
        expect(preparedEvent.id).toBeDefined();

        const server = request
          .agent(app)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-events');
        const response = await req;

        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        // const hasUserCreatedEvent = response.body.some(
        //   (event) => event.user.id === TESTING_USER_ID,
        // );
        // expect(hasUserCreatedEvent).toBe(true);

        // Check if the response contains the prepared event
        expect(response.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: preparedEvent.id,
            }),
          ]),
        );

        // Check if every event in the response has the expected attendee, or was created by the user
        // const hasNoEventsWithoutExpectedAttendee = response.body.every(
        //   (event) =>
        //     event.attendees?.some(
        //       (attendee) => attendee.id === TESTING_USER_ID,
        //     ) || event.user.id === TESTING_USER_ID,
        // );
        // expect(hasNoEventsWithoutExpectedAttendee).toBe(true);
      });
    });
  });

  describe('my-groups', () => {
    describe('when unauthenticated', () => {
      it('should fail with 401', async () => {
        const server = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
        const req = server.get('/api/dashboard/my-groups');
        const response = await req;
        expect(response.status).toBe(401);
      });
    });

    describe('when authenticated', () => {
      it.skip('should get all groups that I am a member of, and no more', async () => {
        expect(preparedGroup).toBeDefined();
        expect(preparedGroup.id).toBeDefined();

        const server = request
          .agent(app)
          .set('x-tenant-id', TESTING_TENANT_ID)
          .set('Authorization', `Bearer ${authToken}`);

        const req = server.get('/api/dashboard/my-groups');
        const response = await req;
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();

        const hasGroupWithExpectedMember = response.body.some(
          (group) => group.id === preparedGroup.id,
        );
        expect(hasGroupWithExpectedMember).toBe(true);

        const hasNoGroupsWithoutExpectedMember = response.body.every((group) =>
          group.groupMembers.some((member) => member.user.id === 2),
        );
        expect(hasNoGroupsWithoutExpectedMember).toBe(true);
      });
    });
  });
});
