import request from 'supertest';
import {
  TESTING_APP_URL,
  TESTING_USER_EMAIL,
  TESTING_USER_PASSWORD,
  TESTING_TENANT_ID,
  TESTING_ADMIN_EMAIL,
  TESTING_ADMIN_PASSWORD,
} from './constants';
import { CreateEventDto } from '../../src/event/dto/create-event.dto';
import {
  EventStatus,
  EventType,
  GroupStatus,
} from '../../src/core/constants/constant';
import { EventEntity } from '../../src/event/infrastructure/persistence/relational/entities/event.entity';
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
    type: EventType.Hybrid,
    startDate: new Date(),
    endDate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), // One day after the start date
    maxAttendees: 100,
    // location: 'Virtual',
    locationOnline: 'https://example.com/meeting',
    categories: [1],
    // image: { id: 1 } as FileEntity,
    lat: 0,
    lon: 0,
    status: EventStatus.Published,
    group: group.id,
    timeZone: 'UTC',
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
async function loginAsAdmin() {
  const loginResponse = await request(TESTING_APP_URL)
    .post('/api/v1/auth/email/login')
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send({
      email: TESTING_ADMIN_EMAIL,
      password: TESTING_ADMIN_PASSWORD,
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
  expect(response.status).toBe(201);
  return response.body;
}

async function createEvent(app: string, authToken: string, eventData: any) {
  // console.log('Creating event with data:', JSON.stringify(eventData, null, 2));

  const payload = {
    timeZone: 'UTC', // Default timezone
    ...eventData, // Spread incoming eventData, potentially overriding the default timeZone if provided
  };

  const response = await request(app)
    .post('/api/events')
    .set('Authorization', `Bearer ${authToken}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send(payload);

  // console.log('Create event response:', {
  //  status: response.status,
  //  body: response.body,
  // });

  if (response.status !== 201) {
    console.error('Create event failed:', {
      status: response.status,
      body: response.body,
    });
  }

  expect(response.status).toBe(201);
  return response.body;
}

async function getRecommendedEvents(
  app,
  token,
  eventSlug,
  minEvents = 0,
  maxEvents = 5,
  isAuthenticated = false,
) {
  const getRecommendedEventsUrl = `/api/events/${eventSlug}/recommended-events?minEvents=${minEvents}&maxEvents=${maxEvents}`;

  let response;

  const event = await getEvent(app, token, eventSlug);
  expect(event.slug).toBe(eventSlug);

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

async function updateEvent(app, token, eventSlug, eventData) {
  const response = await request(app)
    .patch(`/api/events/${eventSlug}`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID)
    .send(eventData);

  if (response.status !== 200) {
    console.error('Update event failed:', {
      status: response.status,
      body: response.body,
    });
  }

  expect(response.status).toBe(200);
  expect(eventSlug).toBe(response.body.slug);
  if (eventData.name) {
    expect(eventData.name).toBe(response.body.name);
  }

  // console.log('Update event response:', JSON.stringify(response.body, null, 2));
  return response.body as EventEntity;
}

async function getAllEvents(app, token) {
  const response = await request(app)
    .get(`/api/events`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);

  expect(response.status).toBe(200);

  return response.body;
}

async function getEvent(app, token, eventSlug) {
  const response = await request(app)
    .get(`/api/events/${eventSlug}`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);
  expect(response.status).toBe(200);

  return response.body;
}
async function getMyEvents(app, token) {
  const response = await request(app)
    .get(`/api/events/dashboard`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-tenant-id', TESTING_TENANT_ID);

  expect(response.status).toBe(200);
  return response.body;
}

async function createTestUser(
  app,
  tenantId,
  email,
  firstName,
  lastName,
  password = 'Test@1234',
) {
  const response = await request(app)
    .post('/api/v1/auth/email/register')
    .set('x-tenant-id', tenantId)
    .send({
      email: email,
      password: password,
      firstName: firstName,
      lastName: lastName,
    });

  if (response.status !== 201) {
    console.error('Failed to create test user:', response.body);
    throw new Error(`Failed to create test user: ${response.status}`);
  }

  return {
    id: response.body.user.id,
    token: response.body.token,
    slug: response.body.user.slug,
    user: response.body.user,
    email: response.body.user.email || email, // fallback to the email we used to register
  };
}

async function joinGroup(app, tenantId, groupSlug, userToken) {
  const joinResponse = await request(app)
    .post(`/api/groups/${groupSlug}/join`)
    .set('Authorization', `Bearer ${userToken}`)
    .set('x-tenant-id', tenantId);

  if (joinResponse.status !== 201) {
    console.error('Failed to join group:', joinResponse.body);
    throw new Error(`Failed to join group: ${joinResponse.status}`);
  }

  return joinResponse.body;
}

async function approveMember(
  app,
  tenantId,
  groupSlug,
  groupMemberId,
  ownerToken,
) {
  const approveResponse = await request(app)
    .post(`/api/groups/${groupSlug}/members/${groupMemberId}/approve`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .set('x-tenant-id', tenantId);

  if (approveResponse.status !== 201) {
    console.error('Failed to approve member:', approveResponse.body);
    throw new Error(`Failed to approve member: ${approveResponse.status}`);
  }

  return approveResponse.body;
}

async function updateGroupMemberRole(
  app,
  tenantId,
  groupSlug,
  memberId,
  role,
  adminToken,
) {
  const updateRoleResponse = await request(app)
    .patch(`/api/groups/${groupSlug}/members/${memberId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('x-tenant-id', tenantId)
    .send({
      name: role,
    });

  if (updateRoleResponse.status !== 200) {
    console.error(
      'Failed to update group member role:',
      updateRoleResponse.body,
    );
    throw new Error(
      `Failed to update group member role: ${updateRoleResponse.status}`,
    );
  }

  return updateRoleResponse.body;
}

async function getGroupMembers(app, tenantId, groupSlug, adminToken) {
  const membersResponse = await request(app)
    .get(`/api/groups/${groupSlug}/members`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('x-tenant-id', tenantId);

  if (membersResponse.status !== 200) {
    console.error('Failed to get group members:', membersResponse.body);
    throw new Error(`Failed to get group members: ${membersResponse.status}`);
  }

  return membersResponse.body;
}

async function getCurrentUser(app, tenantId, userToken) {
  const userResponse = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${userToken}`)
    .set('x-tenant-id', tenantId);

  if (userResponse.status !== 200) {
    console.error('Failed to get current user:', userResponse.body);
    throw new Error(`Failed to get current user: ${userResponse.status}`);
  }

  return userResponse.body;
}

async function registerMatrixUserIdentity(app, tenantId, userToken, userSlug) {
  // Generate a Matrix user ID based on the user slug (simulating MAS authentication)
  const serverName = process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
  const matrixUserId = `@${userSlug}:${serverName}`;
  
  const response = await request(app)
    .post('/api/matrix/sync-user-identity')
    .set('Authorization', `Bearer ${userToken}`)
    .set('x-tenant-id', tenantId)
    .send({ matrixUserId });

  if (response.status !== 200) {
    console.error('Failed to register Matrix user identity:', response.body);
    throw new Error(`Failed to register Matrix user identity: ${response.status}`);
  }

  return response.body;
}

export {
  getAuthToken,
  createGroup,
  createEvent,
  deleteGroup,
  deleteEvent,
  loginAsTester,
  loginAsAdmin,
  getRecommendedEvents,
  updateEvent,
  getEvent,
  getMyEvents,
  createCategory,
  getAllEvents,
  createTestUser,
  joinGroup,
  approveMember,
  updateGroupMemberRole,
  getGroupMembers,
  getCurrentUser,
  registerMatrixUserIdentity,
};
