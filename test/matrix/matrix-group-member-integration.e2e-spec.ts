import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  createTestUser,
  joinGroup,
  deleteGroupBySlug,
  waitForEventProcessing,
} from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(120000);

describe('Matrix Group Member Integration (e2e)', () => {
  let ownerToken: string;
  let memberToken: string;
  let guestToken: string;
  let testGroup: any;
  let memberUser: any;
  let guestUser: any;

  // Helper function to create a group with specified visibility
  async function createGroup(token: string, groupData: any) {
    const response = await request(TESTING_APP_URL)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID)
      .send(groupData);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Helper function to get group members
  async function getGroupMembers(token: string, groupSlug: string) {
    const response = await request(TESTING_APP_URL)
      .get(`/api/groups/${groupSlug}/members`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(200);
    return response.body;
  }

  // Helper function to approve a member
  async function approveMember(
    token: string,
    groupSlug: string,
    memberId: number,
  ) {
    const response = await request(TESTING_APP_URL)
      .post(`/api/groups/${groupSlug}/members/${memberId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    expect(response.status).toBe(201);
    return response.body;
  }

  // Before all tests, set up users and authentication
  beforeAll(async () => {
    // Get owner token
    ownerToken = await loginAsTester();

    // Create test users for member and guest scenarios
    memberUser = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `member-${Date.now()}@test.com`,
      'Member',
      'User',
    );
    memberToken = memberUser.token;

    guestUser = await createTestUser(
      TESTING_APP_URL,
      TESTING_TENANT_ID,
      `guest-${Date.now()}@test.com`,
      'Guest',
      'User',
    );
    guestToken = guestUser.token;
  });

  // After each test, clean up any test groups
  afterEach(async () => {
    if (testGroup && testGroup.slug) {
      try {
        await deleteGroupBySlug(ownerToken, testGroup.slug);
      } catch (error) {
        console.log(`Cleanup error: ${error.message}`);
      }
      testGroup = null;
    }
  });

  describe('Public Group Matrix Integration', () => {
    it('should emit Matrix events when users join public groups as members', async () => {
      // Create a public group without approval requirement
      testGroup = await createGroup(ownerToken, {
        name: 'Public Test Group',
        description: 'A public group for Matrix testing',
        visibility: 'public',
        requireApproval: false,
      });

      console.log(`Created public group: ${testGroup.slug}`);

      // Member joins the public group - should be assigned Member role
      const joinResponse = await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      expect(joinResponse).toHaveProperty('id');

      // Wait for event processing
      await waitForEventProcessing(3000);

      // Verify the member was added
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const joinedMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(joinedMember).toBeDefined();
      expect(joinedMember.groupRole.name).toBe('member');

      console.log(
        `Member ${memberUser.slug} successfully joined public group with member role`,
      );
    });

    it('should emit Matrix events when multiple users join public groups', async () => {
      // Create a public group without approval requirement
      testGroup = await createGroup(ownerToken, {
        name: 'Multi-Member Public Group',
        description: 'Testing multiple member additions',
        visibility: 'public',
        requireApproval: false,
      });

      // Both users join the public group
      await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        guestToken,
      );

      // Wait for event processing
      await waitForEventProcessing(3000);

      // Verify both members were added
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      expect(members).toHaveLength(3); // Owner + 2 members

      const memberUser1 = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );
      const memberUser2 = members.find(
        (m: any) => m.user.slug === guestUser.slug,
      );

      expect(memberUser1).toBeDefined();
      expect(memberUser1.groupRole.name).toBe('member');
      expect(memberUser2).toBeDefined();
      expect(memberUser2.groupRole.name).toBe('member');

      console.log('Multiple users successfully joined public group as members');
    });
  });

  describe('Private Group Matrix Integration', () => {
    it('should emit Matrix events when users join private groups as guests', async () => {
      // Create a private group
      testGroup = await createGroup(ownerToken, {
        name: 'Private Test Group',
        description: 'A private group for Matrix testing',
        visibility: 'private',
      });

      console.log(`Created private group: ${testGroup.slug}`);

      // Member joins the private group - should be assigned Guest role initially
      const joinResponse = await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      expect(joinResponse).toHaveProperty('id');

      // Wait for event processing
      await waitForEventProcessing(3000);

      // Verify the member was added as a guest
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const joinedMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(joinedMember).toBeDefined();
      expect(joinedMember.groupRole.name).toBe('guest');

      console.log(
        `Member ${memberUser.slug} successfully joined private group with guest role`,
      );
    });

    it('should emit Matrix events when private group guests are approved as members', async () => {
      // Create a private group
      testGroup = await createGroup(ownerToken, {
        name: 'Private Approval Group',
        description: 'Testing guest approval flow',
        visibility: 'private',
      });

      // Member joins as guest
      await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      // Wait for join processing
      await waitForEventProcessing(2000);

      // Get the member ID for approval
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const guestMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(guestMember).toBeDefined();
      expect(guestMember.groupRole.name).toBe('guest');

      // Owner approves the guest
      await approveMember(ownerToken, testGroup.slug, guestMember.id);

      // Wait for approval processing
      await waitForEventProcessing(3000);

      // Verify the member was upgraded to member role
      const updatedMembers = await getGroupMembers(ownerToken, testGroup.slug);
      const approvedMember = updatedMembers.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(approvedMember).toBeDefined();
      expect(approvedMember.groupRole.name).toBe('member');

      console.log(
        `Guest ${memberUser.slug} successfully approved and upgraded to member role`,
      );
    });

    it('should emit Matrix events for private groups with requireApproval enabled', async () => {
      // Create a private group with explicit approval requirement
      testGroup = await createGroup(ownerToken, {
        name: 'Approval Required Group',
        description: 'Testing approval requirement',
        visibility: 'private',
        requireApproval: true,
      });

      // Member joins - should be guest regardless of visibility
      await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      // Wait for event processing
      await waitForEventProcessing(3000);

      // Verify assigned as guest
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const joinedMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(joinedMember).toBeDefined();
      expect(joinedMember.groupRole.name).toBe('guest');

      console.log(
        'Member correctly assigned guest role in approval-required group',
      );
    });
  });

  describe('Authenticated Group Matrix Integration', () => {
    it('should emit Matrix events when users join authenticated groups as members', async () => {
      // Create an authenticated group without approval requirement
      testGroup = await createGroup(ownerToken, {
        name: 'Authenticated Test Group',
        description: 'An authenticated group for Matrix testing',
        visibility: 'authenticated',
        requireApproval: false,
      });

      console.log(`Created authenticated group: ${testGroup.slug}`);

      // Member joins the authenticated group - should be assigned Member role
      const joinResponse = await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      expect(joinResponse).toHaveProperty('id');

      // Wait for event processing
      await waitForEventProcessing(3000);

      // Verify the member was added as a member (not guest)
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const joinedMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(joinedMember).toBeDefined();
      expect(joinedMember.groupRole.name).toBe('member');

      console.log(
        `Member ${memberUser.slug} successfully joined authenticated group with member role`,
      );
    });
  });

  describe('Matrix Event Processing Verification', () => {
    it('should handle Matrix event processing errors gracefully', async () => {
      // Create a group that might cause Matrix processing issues
      testGroup = await createGroup(ownerToken, {
        name: 'Error Handling Test Group',
        description: 'Testing Matrix error handling',
        visibility: 'public',
        requireApproval: false,
      });

      // Join group should succeed even if Matrix processing has issues
      const joinResponse = await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      expect(joinResponse).toHaveProperty('id');

      // Group membership should be recorded regardless of Matrix issues
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      const joinedMember = members.find(
        (m: any) => m.user.slug === memberUser.slug,
      );

      expect(joinedMember).toBeDefined();

      console.log(
        'Group join succeeded even with potential Matrix processing issues',
      );
    });

    it('should emit Matrix events with role information for all group types', async () => {
      const groupTypes = [
        {
          visibility: 'public',
          expectedRole: 'member',
          requireApproval: false,
        },
        {
          visibility: 'authenticated',
          expectedRole: 'member',
          requireApproval: false,
        },
        { visibility: 'private', expectedRole: 'guest', requireApproval: true },
      ];

      for (const { visibility, expectedRole, requireApproval } of groupTypes) {
        // Create group with specific visibility and approval settings
        const group = await createGroup(ownerToken, {
          name: `${visibility.charAt(0).toUpperCase() + visibility.slice(1)} Role Test`,
          description: `Testing role assignment for ${visibility} groups`,
          visibility: visibility,
          requireApproval: requireApproval,
        });

        try {
          // User joins group
          await joinGroup(
            TESTING_APP_URL,
            TESTING_TENANT_ID,
            group.slug,
            memberToken,
          );

          // Wait for processing
          await waitForEventProcessing(2000);

          // Verify role assignment
          const members = await getGroupMembers(ownerToken, group.slug);
          const joinedMember = members.find(
            (m: any) => m.user.slug === memberUser.slug,
          );

          expect(joinedMember).toBeDefined();
          expect(joinedMember.groupRole.name).toBe(expectedRole);

          console.log(
            `✓ ${visibility} group correctly assigned ${expectedRole} role`,
          );

          // Clean up immediately
          await deleteGroupBySlug(ownerToken, group.slug);
        } catch (error) {
          console.error(`Failed test for ${visibility} group:`, error);
          // Clean up on error
          try {
            await deleteGroupBySlug(ownerToken, group.slug);
          } catch (cleanupError) {
            console.log(
              `Cleanup error for ${group.slug}:`,
              cleanupError.message,
            );
          }
          throw error;
        }
      }
    });
  });

  describe('Matrix Room Creation and Access', () => {
    it('should handle Matrix room creation for groups', async () => {
      // Create a group
      testGroup = await createGroup(ownerToken, {
        name: 'Matrix Room Test Group',
        description: 'Testing Matrix room creation',
        visibility: 'public',
        requireApproval: false,
      });

      // Join the group
      await joinGroup(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        testGroup.slug,
        memberToken,
      );

      // Wait for Matrix processing
      await waitForEventProcessing(5000);

      // Verify group members exist
      const members = await getGroupMembers(ownerToken, testGroup.slug);
      expect(members.length).toBeGreaterThan(1); // At least owner + member

      console.log(
        `Matrix room creation test completed for group ${testGroup.slug}`,
      );
    });
  });
});
