import * as request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  createTestUser,
  createGroup,
  joinGroup,
  getGroupMembers,
} from '../utils/functions';

describe('Group Member Alphabetical Order (e2e)', () => {
  const testTenantId = TESTING_TENANT_ID;
  let serverApp: any;
  let groupOwner: any;
  let testGroup: any;
  const testMembers: any[] = [];

  beforeAll(async () => {
    // Set up server app agent with tenant
    serverApp = request.agent(TESTING_APP_URL).set('x-tenant-id', testTenantId);

    // Create group owner
    const timestamp = Date.now();
    groupOwner = await createTestUser(
      TESTING_APP_URL,
      testTenantId,
      `openmeet-test-group-owner-alphabetical-${timestamp}@openmeet.net`,
      'Group',
      'Owner',
    );

    // Create test group
    testGroup = await createGroup(TESTING_APP_URL, groupOwner.token, {
      name: 'Test Group for Alphabetical Ordering',
      description: 'Test group for testing member list alphabetical ordering',
      visibility: 'public',
      status: 'published',
    });

    // Create test members with different last names to test sorting
    // Create them in reverse alphabetical order to ensure sorting is actually working
    const memberData = [
      { firstName: 'Charlie', lastName: 'Zebra' },
      { firstName: 'Alice', lastName: 'Young' },
      { firstName: 'Bob', lastName: 'Xray' },
      { firstName: 'Diana', lastName: 'Wilson' },
      { firstName: 'Eve', lastName: 'Alpha' },
      { firstName: 'Frank', lastName: 'Beta' },
    ];

    for (let i = 0; i < memberData.length; i++) {
      const member = await createTestUser(
        TESTING_APP_URL,
        testTenantId,
        `openmeet-test-member-${timestamp}-${i}@openmeet.net`,
        memberData[i].firstName,
        memberData[i].lastName,
      );

      // Have each member join the group
      await joinGroup(
        TESTING_APP_URL,
        testTenantId,
        testGroup.slug,
        member.token,
      );

      testMembers.push({
        ...member,
        firstName: memberData[i].firstName,
        lastName: memberData[i].lastName,
      });
    }
  }, 30000);

  it('should return group members sorted by last name then first name', async () => {
    const members = await getGroupMembers(
      TESTING_APP_URL,
      testTenantId,
      testGroup.slug,
      groupOwner.token,
    );

    // Filter out the group owner and focus on the test members we added
    const membersSortedByApi = members.filter(
      (member: any) =>
        member.user.firstName !== 'Group' || member.user.lastName !== 'Owner',
    );

    // Expected order based on lastName then firstName
    const expectedOrder = [
      { firstName: 'Eve', lastName: 'Alpha' },
      { firstName: 'Frank', lastName: 'Beta' },
      { firstName: 'Diana', lastName: 'Wilson' },
      { firstName: 'Bob', lastName: 'Xray' },
      { firstName: 'Alice', lastName: 'Young' },
      { firstName: 'Charlie', lastName: 'Zebra' },
    ];

    // Verify we have the expected number of members
    expect(membersSortedByApi.length).toBeGreaterThanOrEqual(
      expectedOrder.length,
    );

    // Check that members are sorted correctly
    for (
      let i = 0;
      i < Math.min(membersSortedByApi.length - 1, expectedOrder.length - 1);
      i++
    ) {
      const currentMember = membersSortedByApi[i];
      const nextMember = membersSortedByApi[i + 1];

      const currentLastName = currentMember.user.lastName;
      const nextLastName = nextMember.user.lastName;

      // Primary sort: lastName should be in ascending order
      if (currentLastName !== nextLastName) {
        expect(currentLastName.localeCompare(nextLastName)).toBeLessThanOrEqual(
          0,
        );
      } else {
        // Secondary sort: if lastNames are equal, firstName should be in ascending order
        const currentFirstName = currentMember.user.firstName;
        const nextFirstName = nextMember.user.firstName;
        expect(
          currentFirstName.localeCompare(nextFirstName),
        ).toBeLessThanOrEqual(0);
      }
    }

    // Verify specific members are in expected positions
    const actualOrder = membersSortedByApi.map((member: any) => ({
      firstName: member.user.firstName,
      lastName: member.user.lastName,
    }));

    // Check that our test members appear in the correct alphabetical order
    let lastFoundIndex = -1;
    for (const expectedMember of expectedOrder) {
      const foundIndex = actualOrder.findIndex(
        (actual: any) =>
          actual.firstName === expectedMember.firstName &&
          actual.lastName === expectedMember.lastName,
      );

      if (foundIndex !== -1) {
        expect(foundIndex).toBeGreaterThan(lastFoundIndex);
        lastFoundIndex = foundIndex;
      }
    }
  }, 15000);

  it('should handle members with same last name sorted by first name', async () => {
    // Create additional members with the same last name but different first names
    const timestamp = Date.now();
    const sameSurnameMembers = [
      { firstName: 'Zoe', lastName: 'SameName' },
      { firstName: 'Adam', lastName: 'SameName' },
      { firstName: 'Mike', lastName: 'SameName' },
    ];

    const addedMembers: any[] = [];
    for (let i = 0; i < sameSurnameMembers.length; i++) {
      const member = await createTestUser(
        TESTING_APP_URL,
        testTenantId,
        `openmeet-test-samename-${timestamp}-${i}@openmeet.net`,
        sameSurnameMembers[i].firstName,
        sameSurnameMembers[i].lastName,
      );

      await joinGroup(
        TESTING_APP_URL,
        testTenantId,
        testGroup.slug,
        member.token,
      );
      addedMembers.push(member);
    }

    const members = await getGroupMembers(
      TESTING_APP_URL,
      testTenantId,
      testGroup.slug,
      groupOwner.token,
    );

    // Find members with the same last name
    const sameNameMembers = members.filter(
      (member: any) => member.user.lastName === 'SameName',
    );

    expect(sameNameMembers.length).toBe(3);

    // Verify they are sorted by first name
    const firstNames = sameNameMembers.map(
      (member: any) => member.user.firstName,
    );
    const expectedFirstNames = ['Adam', 'Mike', 'Zoe']; // Alphabetical order

    expect(firstNames).toEqual(expectedFirstNames);
  }, 15000);

  afterAll(async () => {
    // Clean up test group (this should also clean up memberships)
    if (testGroup?.slug) {
      try {
        await serverApp
          .delete(`/api/groups/${testGroup.slug}`)
          .set('Authorization', `Bearer ${groupOwner.token}`)
          .timeout(10000);
      } catch (error) {
        console.log('Group cleanup failed:', error.message);
      }
    }
  }, 15000);
});
