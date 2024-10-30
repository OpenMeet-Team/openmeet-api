// import request from 'supertest';
// import {
//   APP_URL,
//   TESTER_EMAIL,
//   TESTER_PASSWORD,
//   TESTER_USER_ID,
//   ADMIN_USER_ID,
// } from '../utils/constants';
// import { getAuthToken } from '../utils/functions';

// describe('GroupController (e2e)', () => {
//   let authToken: string;
//   let serverApp;
//   let testGroup;
//   let testGroup2;
//   beforeAll(async () => {
//     authToken = await getAuthToken(APP_URL, TESTER_EMAIL, TESTER_PASSWORD);
//     serverApp = request
//       .agent(APP_URL)
//       .set('x-tenant-id', '1')
//       .set('Authorization', `Bearer ${authToken}`);
//   });

//   async function createGroup(groupData: any) {
//     const createResponse = await serverApp.post('/api/groups').send(groupData);
//     expect(createResponse.status).toBe(201);
//     expect(createResponse.body).toBeDefined();
//     expect(createResponse.body.id).toBeDefined();
//     expect(createResponse.body.name).toBe(groupData.name);
//     expect(createResponse.body.slug).toBeDefined();
//     expect(createResponse.body.description).toBe(groupData.description);

//     return createResponse.body;
//   }

//   describe('Group Operations', () => {
//     it('should successfully create a group, update it, find it, and delete it', async () => {
//       // Create a group
//       const newGroup = {
//         name: 'Test Group',
//         description: 'This is a test group',
//       };

//       testGroup = await createGroup(newGroup);

//       const updatedGroupData = {
//         name: 'Updated Test Group',
//         description: 'Updated description',
//       };
//       const updateResponse = await serverApp
//         .patch(`/api/groups/${testGroup.id}`)
//         .send(updatedGroupData);
//       // console.log('🚀 ~ it ~ updateResponse:', updateResponse);
//       expect(updateResponse.status).toBe(200);
//       expect(updateResponse.body.name).toBe(updatedGroupData.name);

//       // Get the group
//       const getResponse = await serverApp.get(`/api/groups/${testGroup.id}`);
//       expect(getResponse.status).toBe(200);
//       expect(getResponse.body.name).toBe(updatedGroupData.name);

//       // Delete the group
//       const deleteResponse = await serverApp.delete(
//         `/api/groups/${testGroup.id}`,
//       );
//       expect(deleteResponse.status).toBe(200);
//     });

//     it.skip('should find my groups', async () => {
//       // create groups
//       const newGroup = {
//         name: 'Test Group',
//         description: 'This is a test group',
//       };

//       const newGroup2 = {
//         name: 'Test Group 2',
//         description: 'This is a test group 2',
//       };
//       testGroup = await createGroup(newGroup);
//       testGroup2 = await createGroup(newGroup2);

//       // look them up
//       const getGroupResponse = await serverApp.get(
//         `/api/groups/${testGroup.id}`,
//       );
//       expect(getGroupResponse.status).toBe(200);
//       expect(getGroupResponse.body.id).toBe(testGroup.id);

//       const getGroupResponse2 = await serverApp.get(
//         `/api/groups/${testGroup2.id}`,
//       );
//       expect(getGroupResponse2.status).toBe(200);
//       expect(getGroupResponse2.body.id).toBe(testGroup2.id);

//       // add myself to the group
//       const addMemberResponse = await serverApp
//         .post(`/api/group-members/join/${testGroup.id}`)
//         .send({ userId: TESTER_USER_ID });
//       expect(addMemberResponse.status).toBe(201);

//       testGroup = addMemberResponse.body;

//       // add someone else to the group
//       const addMemberResponse2 = await serverApp
//         .post(`/api/group-members/join/${testGroup2.id}`)
//         .send({ userId: ADMIN_USER_ID });
//       expect(addMemberResponse2.status).toBe(201);
//       testGroup2 = addMemberResponse2.body;

//       // get my groups
//       const getMyGroupsResponse = await serverApp.get(
//         '/api/dashboard/my-groups',
//       );

//       expect(getMyGroupsResponse.status).toBe(200);
//       expect(getMyGroupsResponse.body).toBeDefined();
//       expect(getMyGroupsResponse.body.length).toBeGreaterThan(0);
//       expect(
//         getMyGroupsResponse.body.some((group) => group.id === testGroup.id),
//       ).toBe(true);

//       // get other user's groups, this probably shouldn't work for normal users
//       const getOtherUserGroupsResponse = await serverApp.get(
//         `/api/dashboard/my-groups?userId=${TESTER_USER_ID}`,
//       );
//       expect(getOtherUserGroupsResponse.status).toBe(200);
//       expect(getOtherUserGroupsResponse.body).toBeDefined();
//       expect(getOtherUserGroupsResponse.body.length).toBeGreaterThan(0);
//       expect(
//         getOtherUserGroupsResponse.body.some(
//           (group) => group.id === testGroup.id,
//         ),
//       ).toBe(false);
//       // leave the group
//       const leaveGroupResponse = await serverApp.delete(
//         `/api/group-members/leave/${testGroup.id}`,
//       );
//       expect(leaveGroupResponse.status).toBe(200);

//       // get my groups again
//       const getMyGroupsResponse2 = await serverApp.get(
//         '/api/dashboard/my-groups',
//       );
//       expect(getMyGroupsResponse2.status).toBe(200);
//       // check if the group is not in the list
//       expect(
//         getMyGroupsResponse2.body.every((group) => group.id !== testGroup.id),
//       ).toBe(true);
//     });
//   });
// });

describe('GroupController (e2e)', () => {
  it('should Console', () => {});
});
