import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
} from './constants';
import { CreateEventDto } from '../../src/event/dto/create-event.dto';
import { EventStatus, GroupStatus } from '../../src/core/constants/constant';

async function getAuthToken(
  app: string,
  email: string,
  password: string,
): Promise<string> {
  const server = request.agent(app).set('x-tenant-id', TESTING_TENANT_ID);
  const response = await server
    .post('/api/v1/auth/email/login')
    .send({ email, password });
  return response.body.token;
}

async function createGroup(
  app: string,
  authToken: string,
  groupData: any,
): Promise<any> {
  const server = request(app);
  const response = await server
    .post('/api/groups')
    .set('x-tenant-id', TESTING_TENANT_ID)
    .set('Authorization', `Bearer ${authToken}`)
    .send(groupData);
  // console.log('createGroup response.body', response.body);
  return response.body;
}

export async function createGroupsAndEvents(
  app: string,
  email: string,
  password: string,
) {
  const authToken = await getAuthToken(app, email, password);

  const groupData = {
    name: 'Test Group',
    description: 'A group created for testing purposes',
    status: GroupStatus.Published,
    members: [1, 2],
  };
  const group = await createGroup(app, authToken, groupData);

  const eventData: CreateEventDto = {
    name: 'Test Event',
    description: 'An event created for testing purposes',
    type: 'hybrid',
    startDate: new Date(),
    endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // One day after the start date
    maxAttendees: 100,
    location: 'Virtual',
    locationOnline: 'https://example.com/meeting',
    categories: [1],
    // image: { id: 1 } as FileEntity,
    lat: 0,
    lon: 0,
    status: EventStatus.Published,
    group: group.id,
  };

  const event = await createEvent(app, authToken, eventData);
  return { group, event };
}

async function deleteGroup(app: string, authToken: string, groupId: number) {
  const server = request(app);
  await server
    .delete(`/api/groups/${groupId}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .set('Authorization', `Bearer ${authToken}`);
}

async function deleteEvent(app: string, authToken: string, eventId: number) {
  const server = request(app);
  await server
    .delete(`/api/events/${eventId}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .set('Authorization', `Bearer ${authToken}`);
}

async function loginAsTester() {
  const loginResponse = await request(TESTING_APP_URL)
    .post('/api/v1/auth/email/login')
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send({
      email: TESTING_USER_EMAIL,
      password: TESTING_USER_PASSWORD,
    });

  expect(loginResponse.status).toBe(200);
  return loginResponse.body.token;
}
async function createCategory(app, token, categoryData) {
  const response = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send(categoryData);
  // console.log('createCategory response.body', response.body);
  expect(response.status).toBe(201);
  return response.body;
}

async function createEvent(app, token, eventData) {
  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send(eventData);
  // console.log('createEvent response.body', response.body);
  expect(response.status).toBe(201);
  return response.body;
}

async function getRecommendedEvents(
  app,
  token,
  eventId,
  minEvents = 0,
  maxEvents = 5,
  isAuthenticated = false,
) {
  const getRecommendedEventsUrl = `/api/events/${eventId}/recommended-events?minEvents=${minEvents}&maxEvents=${maxEvents}`;

  let response;

  const event = await getEvent(app, token, eventId);
  expect(event.id).toBe(eventId);

  if (isAuthenticated) {
    response = await request(app)
      .get(getRecommendedEventsUrl)
      .set('x-tenant-id', TESTING_TENANT_ID);
  } else {
    response = await request(app)
      .get(getRecommendedEventsUrl)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
  }
  expect(response.status).toBe(200);
  return response.body;
}

async function updateEvent(app, token, eventId, eventData) {
  const response = await request(app)
    .patch(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send(eventData);

  expect(response.status).toBe(200);

  return response.body;
}

async function getAllEvents(app, token) {
  const response = await request(app)
    .get(`/api/events`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);

  expect(response.status).toBe(200);

  return response.body;
}

async function getEvent(app, token, eventId) {
  const response = await request(app)
    .get(`/api/events/${eventId}`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);
  // console.log('getEvent response', response.body);
  expect(response.status).toBe(200);

  return response.body;
}
async function getMyEvents(app, token) {
  const response = await request(app)
    .get(`/api/dashboard/my-events`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);

  expect(response.status).toBe(200);
  return response.body;
}

export {
  getAuthToken,
  createGroup,
  createEvent,
  deleteGroup,
  deleteEvent,
  loginAsTester,
  getRecommendedEvents,
  updateEvent,
  getEvent,
  getMyEvents,
  createCategory,
  getAllEvents,
};
