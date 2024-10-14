import request from 'supertest';
import { APP_URL, TESTER_EMAIL, TESTER_PASSWORD } from '../utils/constants';

describe('GroupMembersController (e2e)', () => {
  let token;
  let testGroup;

  async function loginAsTester() {
    const loginResponse = await request(APP_URL)
      .post('/api/v1/auth/email/login')
      .set('tenant-id', '1')
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
      .set('tenant-id', '1')
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
        .set('tenant-id', '1');
    }
  });

  it('should retrieve group members', async () => {
    const expectedMemberId = 2;
    const groupId = testGroup.id;
    const getGroupMembersResponse = await request(APP_URL)
      .get(`/api/group-members/${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('tenant-id', '1');

    expect(getGroupMembersResponse.status).toBe(200);

    const isMemberPresent = getGroupMembersResponse.body.some(
      (member) => member.user.id === expectedMemberId,
    );
    expect(isMemberPresent).toBe(true);

    if (getGroupMembersResponse.status === 200) {
      const groupMembers = getGroupMembersResponse.body;
      const isMemberPresent = groupMembers.some(
        (member) => member.user.id === expectedMemberId,
      );
      expect(isMemberPresent).toBe(true);
    }
  });
});
