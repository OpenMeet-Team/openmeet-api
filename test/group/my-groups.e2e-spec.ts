import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';
import { getAuthToken } from '../utils/functions';

describe('GroupController (e2e)', () => {
  let authToken: string;
  let serverApp;
  let testGroup;

  beforeAll(async () => {
    authToken = await getAuthToken(APP_URL, TESTER_EMAIL, TESTER_PASSWORD);
    serverApp = request
      .agent(APP_URL)
      .set('tenant-id', '1')
      .set('Authorization', `Bearer ${authToken}`);
  });

  describe('Group Operations', () => {
    // TODO: failing in delete with
    //  update or delete on table "groups" violates foreign key constraint "FK_08cacea15f2aef324f78fddebff" on table "groupMembers"
    it.skip('should successfully create a group, update it, find it, and delete it', async () => {
      // Create a group
      const newGroup = {
        name: 'Test Group',
        description: 'This is a test group',
        // ... other required group details
      };

      const createResponse = await serverApp.post('/api/groups').send(newGroup);
      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toBeDefined();
      expect(createResponse.body.id).toBeDefined();
      expect(createResponse.body.name).toBe(newGroup.name);
      testGroup = createResponse.body;

      // Update the group
      const updatedGroupData = {
        name: 'Updated Test Group',
        description: 'Updated description',
        // ... other updated group details
      };
      const updateResponse = await serverApp
        .patch(`/api/groups/${testGroup.id}`)
        .send(updatedGroupData);
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.name).toBe(updatedGroupData.name);

      // Get the group
      const getResponse = await serverApp.get(`/api/groups/${testGroup.id}`);
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.name).toBe(updatedGroupData.name);

      // Delete the group
      const deleteResponse = await serverApp.delete(
        `/api/groups/${testGroup.id}`,
      );
      console.log(deleteResponse.body);
      expect(deleteResponse.status).toBe(200);
    });
  });
});
