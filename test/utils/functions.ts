import request from 'supertest';
import { TESTING_TENANT_ID } from './constants';
import { CreateEventDto } from '../../src/event/dto/create-event.dto';
import { Status } from '../../src/core/constants/constant';

async function getAuthToken(
  app: string,
  email: string,
  password: string,
): Promise<string> {
  const server = request.agent(app).set('tenant-id', TESTING_TENANT_ID);
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

export async function createGroupsAndEvents(
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
    image: 'https://example.com/event-image.jpg',
    lat: 0,
    lon: 0,
    status: Status.Published,
    group: group.id,
  };

  const event = await createEvent(app, authToken, eventData);
  return { group, event };
}

async function deleteGroup(app: string, authToken: string, groupId: number) {
  const server = request(app);
  await server
    .delete(`/api/groups/${groupId}`)
    .set('tenant-id', TESTING_TENANT_ID)
    .set('Authorization', `Bearer ${authToken}`);
}

async function deleteEvent(app: string, authToken: string, eventId: number) {
  const server = request(app);
  await server
    .delete(`/api/events/${eventId}`)
    .set('tenant-id', TESTING_TENANT_ID)
    .set('Authorization', `Bearer ${authToken}`);
}

export { getAuthToken, createGroup, createEvent, deleteGroup, deleteEvent };
