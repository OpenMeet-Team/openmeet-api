import request from 'supertest';
import {
  APP_URL,
  TESTER_EMAIL,
  TESTER_PASSWORD,
  TESTING_TENANT_ID,
} from '../utils/constants';

describe('GroupMembersController (e2e)', () => {
  let token;
  let testGroup;

  async function loginAsTester() {
    const loginResponse = await request(APP_URL)
      .post('/api/v1/auth/email/login')
      .set('x-tenant-id', '1')
      .send({
        email: TESTER_EMAIL,
        password: TESTER_PASSWORD,
      });

    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token;
  }

  async function createGroup(token) {
    const groupResponse = await request(APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', '1')
      .send({
        name: 'Test Group',
        description: 'A test group',
        members: [1, 2],
      });

    expect(groupResponse.status).toBe(201);
    return groupResponse.body;
  }

  beforeEach(async () => {
    token = await loginAsTester();
    testGroup = await createGroup(token);
  });

  afterEach(async () => {
    if (testGroup && testGroup.id) {
      await request(APP_URL)
        .delete(`/api/groups/${testGroup.id}`)
        .set('Authorization', `Bearer ${token}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    }
  });

  describe.skip('getGroupMembers', () => {
    it('should return group members', () => {
      console.log(testGroup);
    });
  });
});
