import request from 'supertest';
import {
  APP_URL,
  TESTER_EMAIL,
  TESTER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';

describe('GroupController (e2e)', () => {
  let token;
  let testGroup;

  // Helper function to log in as the test user
  async function loginAsTester() {
    const loginResponse = await request(APP_URL)
      .post('/api/v1/auth/email/login')
      .set('tenant-id', TESTING_TENANT_ID)
      .send({
        email: TESTER_EMAIL,
        password: TESTER_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  // Helper function to create a group
  async function createGroup(token, groupData) {
    const response = await request(APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to update a group
  async function updateGroup(token, groupId, groupData) {
    const response = await request(APP_URL)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(200);
    return response.body;
  }

  // Helper function to get a group
  async function getGroup(token, groupId) {
    const response = await request(APP_URL)
      .get(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    return response.body;
  }

  // Before each test, log in as the test user
  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should successfully create a group, update it, find it, and delete it', async () => {
    // Create a group
    testGroup = await createGroup(token, {
      name: 'Test Group',
      description: 'A test group',
    });

    expect(testGroup.name).toBe('Test Group');
    expect(testGroup.description).toBe('A test group');

    // Create another group
    const testGroup2 = await createGroup(token, {
      name: 'Test Group 2',
      description: 'Another test group',
    });

    expect(testGroup2.name).toBe('Test Group 2');
    expect(testGroup2.description).toBe('Another test group');

    // Update the group
    const updatedGroup = await updateGroup(token, testGroup.id, {
      name: 'Updated Test Group',
    });

    expect(updatedGroup.name).toBe('Updated Test Group');

    // Get the group
    const foundGroup = await getGroup(token, testGroup.id);
    expect(foundGroup.name).toBe('Updated Test Group');

    // Clean up by deleting the groups
    const deleteGroupResponse = await request(APP_URL)
      .delete(`/api/groups/${testGroup.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);
    expect(deleteGroupResponse.status).toBe(200);

    const deleteGroup2Response = await request(APP_URL)
      .delete(`/api/groups/${testGroup2.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);
    expect(deleteGroup2Response.status).toBe(200);
  });

  it.skip('should retrieve group members', async () => {
    const expectedMemberId = 2;
    const groupId = testGroup.id;
    const getGroupMembersResponse = await request(APP_URL)
      .get(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', TESTING_TENANT_ID);

    expect(getGroupMembersResponse.status).toBe(200);

    const isMemberPresent = getGroupMembersResponse.body.data?.some(
      (member) => member.user.id === expectedMemberId,
    );
    expect(isMemberPresent).toBe(true);

    if (getGroupMembersResponse.status === 200) {
      const groupMembers = getGroupMembersResponse.body.data;
      const isMemberPresent = groupMembers.some(
        (member) => member.user.id === expectedMemberId,
      );
      console.log(isMemberPresent);
      expect(isMemberPresent).toBe(true);
    }
  });

  // After each test, clean up any remaining test groups
  afterEach(async () => {
    if (testGroup && testGroup.id) {
      await request(APP_URL)
        .delete(`/api/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('tenant-id', TESTING_TENANT_ID);
    }
  });
});
