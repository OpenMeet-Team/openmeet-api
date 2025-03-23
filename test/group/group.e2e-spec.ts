import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsTester } from '../utils/functions';

describe('GroupController (e2e)', () => {
  let token;
  let testGroup;

  // Helper function to create a group
  async function createGroup(token, groupData) {
    const response = await request(TESTING_APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to update a group
  async function updateGroup(token, groupSlug: string, groupData) {
    const response = await request(TESTING_APP_URL)
      .patch(`/api/groups/${groupSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(200);
    return response.body;
  }

  // Helper function to get a group
  async function getGroup(token, groupSlug: string) {
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${groupSlug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    return response.body;
  }

  // async function sendGroupDiscussionMessage(
  //   token,
  //   groupSlug: string,
  //   message: string,
  //   topicName: string,
  // ) {
  //   const response = await request(TESTING_APP_URL)
  //     .post(`/api/groups/${groupSlug}/discussions`)
  //     .set('Authorization', `Bearer ${token}`)
  //     .set('x-tenant-id', TESTING_TENANT_ID)
  //     .send({ message, topicName });
  //   console.log(response.body);
  //   expect(response.status).toBe(201);
  //   return response.body;
  // }

  // async function deleteGroupDiscussionMessage(
  //   token,
  //   groupSlug: string,
  //   messageId: number,
  // ) {
  //   const response = await request(TESTING_APP_URL)
  //     .delete(`/api/groups/${groupSlug}/discussions/${messageId}`)
  //     .set('Authorization', `Bearer ${token}`)
  //     .set('x-tenant-id', TESTING_TENANT_ID);

  //   expect(response.status).toBe(200);
  // }

  // Before each test, log in as the test user
  beforeEach(async () => {
    token = await loginAsTester();
  });

  it('should successfully create a group, update it, find it, comment on it, and delete it', async () => {
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
    const updatedGroup = await updateGroup(token, testGroup.slug, {
      name: 'Updated Test Group',
    });
    expect(updatedGroup.name).toBe('Updated Test Group');

    // Get the group
    const foundGroup = await getGroup(token, testGroup.slug);
    expect(foundGroup.name).toBe('Updated Test Group');

    // Comment the group
    // const discussionMessage = await sendGroupDiscussionMessage(
    //   token,
    //   testGroup.slug,
    //   'Hello, world!',
    //   'Test Topic',
    // );
    // expect(discussionMessage.id).toBeDefined();

    // Delete the discussion message
    // await deleteGroupDiscussionMessage(
    //   token,
    //   testGroup.slug,
    //   discussionMessage.id,
    // );
    // expect(discussionMessage.id).toBeDefined();

    // Clean up by deleting the groups
    const deleteGroupResponse = await request(TESTING_APP_URL)
      .delete(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(deleteGroupResponse.status).toBe(200);

    const deleteGroup2Response = await request(TESTING_APP_URL)
      .delete(`/api/groups/${testGroup2.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(deleteGroup2Response.status).toBe(200);
  });

  it('should successfully delete a group that has a chat room', async () => {
    // Create a group that will have a chat room
    testGroup = await createGroup(token, {
      name: 'Group With Chat Room',
      description: 'This group will have a chat room',
    });
    expect(testGroup.name).toBe('Group With Chat Room');

    // Access the group's discussion area to ensure a chat room is created
    const groupDiscussionsResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}/discussions`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(groupDiscussionsResponse.status).toBe(200);

    // Delete the group
    const deleteGroupResponse = await request(TESTING_APP_URL)
      .delete(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteGroupResponse.status).toBe(200);

    // Verify the group was actually deleted
    const verifyDeletedResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(verifyDeletedResponse.status).toBe(404);

    // Set testGroup to null so afterEach doesn't try to delete it again
    testGroup = null;
  });

  it('should successfully delete a group that has a chat room', async () => {
    // Create a group that will have a chat room
    testGroup = await createGroup(token, {
      name: 'Group With Chat Room',
      description: 'This group will have a chat room',
    });
    expect(testGroup.name).toBe('Group With Chat Room');

    // Access the group's discussion area to ensure a chat room is created
    const groupDiscussionsResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}/discussions`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(groupDiscussionsResponse.status).toBe(200);

    // Delete the group
    const deleteGroupResponse = await request(TESTING_APP_URL)
      .delete(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(deleteGroupResponse.status).toBe(200);

    // Verify the group was actually deleted
    const verifyDeletedResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(verifyDeletedResponse.status).toBe(404);

    // Set testGroup to null so afterEach doesn't try to delete it again
    testGroup = null;
  });

  it('should retrieve group members', async () => {
    testGroup = await createGroup(token, {
      name: 'Test Group',
      description: 'A test group',
    });

    const getGroupMembersResponse = await request(TESTING_APP_URL)
      .get(`/api/groups/${testGroup.slug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(getGroupMembersResponse.status).toBe(200);

    // expect getGroupMembersResponse.body to contain the expected member
    expect(getGroupMembersResponse.body).toHaveLength(1);

    const deleteGroupResponse = await request(TESTING_APP_URL)
      .delete(`/api/groups/${testGroup.slug}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);
    expect(deleteGroupResponse.status).toBe(200);
  });

  // After each test, clean up any remaining test groups
  afterEach(async () => {
    if (testGroup && testGroup.slug) {
      try {
        await request(TESTING_APP_URL)
          .delete(`/api/groups/${testGroup.slug}`)
          .set('Authorization', `Bearer ${token}`)
          .set('x-tenant-id', TESTING_TENANT_ID);
      } catch (error) {
        // Ignore errors during cleanup
        console.log(`Cleanup error: ${error.message}`);
      }
    }
  });
});
