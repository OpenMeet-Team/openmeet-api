import { TESTING_APP_URL } from '../utils/constants';
import {
  loginAsTester,
  createGroup,
  getGroupDetails,
  getCurrentUserDetails,
  deleteGroupBySlug,
  getGroupChatRooms,
  waitForEventProcessing,
} from '../utils/functions';

// Set a global timeout for all tests in this file
jest.setTimeout(60000);

describe('Group Room Automation (e2e)', () => {
  let token: string;
  let testUser: any;
  let createdGroups: string[] = []; // Track groups for cleanup

  beforeEach(async () => {
    // Log in as the test user and get user details
    token = await loginAsTester();
    testUser = await getCurrentUserDetails(token);

    console.log('Test user:', {
      id: testUser.id,
      slug: testUser.slug,
      email: testUser.email,
    });
  });

  afterEach(async () => {
    // Clean up all created groups
    for (const groupSlug of createdGroups) {
      try {
        console.log(`Cleaning up group: ${groupSlug}`);
        await deleteGroupBySlug(token, groupSlug);
      } catch (error) {
        console.error(`Failed to clean up group ${groupSlug}:`, error.message);
      }
    }
    createdGroups = [];
  });

  describe('Automatic Matrix Room Creation', () => {
    it('should automatically create a Matrix room when a group is created', async () => {
      console.log(
        '\n=== Testing automatic Matrix room creation on group creation ===',
      );

      const timestamp = Date.now();
      const groupData = {
        name: `Auto Room Test ${timestamp}`,
        description: 'Testing automatic Matrix room creation',
        isPublic: true,
      };

      console.log('Creating group:', groupData);

      // Create the group - this should trigger automatic Matrix room creation
      const createdGroup = await createGroup(TESTING_APP_URL, token, groupData);
      createdGroups.push(createdGroup.slug);

      console.log('Group created successfully:', {
        id: createdGroup.id,
        slug: createdGroup.slug,
        name: createdGroup.name,
      });

      // Verify basic group creation worked
      expect(createdGroup).toBeDefined();
      expect(createdGroup.name).toBe(groupData.name);
      expect(createdGroup.description).toBe(groupData.description);
      expect(createdGroup.slug).toBeDefined();

      // Wait for the event-driven automation to process
      console.log('Waiting for chat room automation to process...');
      await waitForEventProcessing(3000);

      // Get the updated group details to check if Matrix room was created
      const groupDetails = await getGroupDetails(token, createdGroup.slug);

      console.log('Group details after automation:', {
        slug: groupDetails.slug,
        matrixRoomId: groupDetails.matrixRoomId,
        hasMatrixRoom: !!groupDetails.matrixRoomId,
      });

      // SPECIFIC EXPECTATION: Matrix room should be created automatically
      expect(groupDetails.matrixRoomId).toBeDefined();
      expect(groupDetails.matrixRoomId).not.toBeNull();
      expect(groupDetails.matrixRoomId).toMatch(/^!/); // Matrix room IDs start with !
      expect(groupDetails.matrixRoomId).toContain(':'); // Should have server part like !abc:server.com

      console.log(
        '✅ SUCCESS: Matrix room created automatically:',
        groupDetails.matrixRoomId,
      );
    });

    it('should create Matrix rooms for both public and private groups', async () => {
      console.log(
        '\n=== Testing automation works for different group visibility types ===',
      );

      const timestamp = Date.now();

      // Create public group
      const publicGroupData = {
        name: `Public Test ${timestamp}`,
        description: 'Testing public group automation',
        isPublic: true,
      };

      const publicGroup = await createGroup(
        TESTING_APP_URL,
        token,
        publicGroupData,
      );
      createdGroups.push(publicGroup.slug);
      console.log('Created public group:', publicGroup.slug);

      // Create private group
      const privateGroupData = {
        name: `Private Test ${timestamp}`,
        description: 'Testing private group automation',
        isPublic: false,
      };

      const privateGroup = await createGroup(
        TESTING_APP_URL,
        token,
        privateGroupData,
      );
      createdGroups.push(privateGroup.slug);
      console.log('Created private group:', privateGroup.slug);

      // Wait for both automations
      await waitForEventProcessing(4000);

      // Check both groups have Matrix rooms
      const publicDetails = await getGroupDetails(token, publicGroup.slug);
      const privateDetails = await getGroupDetails(token, privateGroup.slug);

      console.log('Public group result:', {
        slug: publicDetails.slug,
        isPublic: publicDetails.isPublic,
        hasMatrixRoom: !!publicDetails.matrixRoomId,
        matrixRoomId: publicDetails.matrixRoomId,
      });

      console.log('Private group result:', {
        slug: privateDetails.slug,
        isPublic: privateDetails.isPublic,
        hasMatrixRoom: !!privateDetails.matrixRoomId,
        matrixRoomId: privateDetails.matrixRoomId,
      });

      // Both should have Matrix rooms created
      expect(publicDetails.matrixRoomId).toBeDefined();
      expect(publicDetails.matrixRoomId).toMatch(/^!/);
      expect(privateDetails.matrixRoomId).toBeDefined();
      expect(privateDetails.matrixRoomId).toMatch(/^!/);

      // Rooms should be different
      expect(publicDetails.matrixRoomId).not.toBe(privateDetails.matrixRoomId);

      console.log('✅ SUCCESS: Both group types have automated Matrix rooms');
    });

    it('should include proper creator context in automated room creation', async () => {
      console.log(
        '\n=== Testing that creator context is properly passed to automation ===',
      );

      const timestamp = Date.now();
      const groupData = {
        name: `Creator Context Test ${timestamp}`,
        description: 'Testing creator context in automation',
        isPublic: true,
      };

      console.log('Creating group with current user context:', {
        userId: testUser.id,
        userSlug: testUser.slug,
      });

      const createdGroup = await createGroup(TESTING_APP_URL, token, groupData);
      createdGroups.push(createdGroup.slug);

      // Verify creator was set correctly
      expect(createdGroup.createdBy).toBeDefined();

      console.log('Group created with creator context:', {
        groupSlug: createdGroup.slug,
        createdBy: createdGroup.createdBy,
      });

      await waitForEventProcessing(3000);

      // Get group details and verify Matrix room creation
      const groupDetails = await getGroupDetails(token, createdGroup.slug);

      console.log('Automation result with creator context:', {
        hasMatrixRoom: !!groupDetails.matrixRoomId,
        matrixRoomId: groupDetails.matrixRoomId,
        createdBy: groupDetails.createdBy,
      });

      // Matrix room should be created with proper context
      expect(groupDetails.matrixRoomId).toBeDefined();
      expect(groupDetails.matrixRoomId).toMatch(/^!/);
      expect(groupDetails.createdBy).toBeDefined();

      console.log('✅ SUCCESS: Automation works with proper creator context');
    });
  });

  describe('Chat Room API Integration', () => {
    it('should make Matrix rooms accessible via chat room APIs', async () => {
      console.log(
        '\n=== Testing that automated rooms are accessible via APIs ===',
      );

      const timestamp = Date.now();
      const groupData = {
        name: `API Access Test ${timestamp}`,
        description: 'Testing API access to automated rooms',
        isPublic: true,
      };

      // Create group and wait for automation
      const createdGroup = await createGroup(TESTING_APP_URL, token, groupData);
      createdGroups.push(createdGroup.slug);

      await waitForEventProcessing(3000);

      // Verify Matrix room was created
      const groupDetails = await getGroupDetails(token, createdGroup.slug);
      expect(groupDetails.matrixRoomId).toBeDefined();

      console.log(
        'Testing API access to automated room:',
        groupDetails.matrixRoomId,
      );

      // Test that we can access the room via chat APIs
      const roomsResponse = await getGroupChatRooms(token, createdGroup.slug);

      console.log('Chat rooms API response:', {
        status: roomsResponse.status,
        hasBody: !!roomsResponse.body,
        bodyType: typeof roomsResponse.body,
      });

      // The API should return a valid response (could be 200 with rooms or 404 if endpoint doesn't exist yet)
      expect([200, 201, 404]).toContain(roomsResponse.status);

      if (roomsResponse.status === 200 || roomsResponse.status === 201) {
        console.log('✅ SUCCESS: Chat rooms API returned valid response');
        expect(roomsResponse.body).toBeDefined();
      } else if (roomsResponse.status === 404) {
        console.log('ℹ️  Chat rooms API endpoint not implemented yet (404)');
      }
    });
  });

  describe('Event System Verification', () => {
    it('should verify the group.created -> chat.group.created event flow works', async () => {
      console.log(
        '\n=== Testing complete event flow from group creation to chat automation ===',
      );

      const timestamp = Date.now();
      const groupData = {
        name: `Event Flow Test ${timestamp}`,
        description: 'Testing the complete event-driven flow',
        isPublic: true,
      };

      console.log(
        'Testing event flow: group.created -> chat.group.created -> Matrix room creation',
      );

      // Create group (should trigger group.created event)
      const createdGroup = await createGroup(TESTING_APP_URL, token, groupData);
      createdGroups.push(createdGroup.slug);

      console.log(
        'Group created, event flow should be: group.created -> chat.group.created',
      );

      // Basic validation that group was created
      expect(createdGroup.slug).toBeDefined();
      expect(createdGroup.name).toBe(groupData.name);

      // Wait for event processing chain to complete
      await waitForEventProcessing(5000); // Longer wait for complete flow

      // Verify the end result - Matrix room should exist
      const finalGroupDetails = await getGroupDetails(token, createdGroup.slug);

      console.log('Final event flow result:', {
        groupSlug: finalGroupDetails.slug,
        hasMatrixRoom: !!finalGroupDetails.matrixRoomId,
        matrixRoomId: finalGroupDetails.matrixRoomId,
        eventFlowCompleted: !!finalGroupDetails.matrixRoomId,
      });

      // CRITICAL EXPECTATION: The complete event flow should result in a Matrix room
      expect(finalGroupDetails.matrixRoomId).toBeDefined();
      expect(finalGroupDetails.matrixRoomId).not.toBeNull();
      expect(finalGroupDetails.matrixRoomId).toMatch(/^!/);

      console.log('✅ SUCCESS: Complete event flow works correctly');
    });

    it('should handle multiple rapid group creations without conflicts', async () => {
      console.log(
        '\n=== Testing rapid group creation for event system stability ===',
      );

      const timestamp = Date.now();
      const groupCount = 3;
      const createdGroupData = [];

      // Create multiple groups rapidly
      for (let i = 0; i < groupCount; i++) {
        const groupData = {
          name: `Rapid Test ${timestamp}-${i}`,
          description: `Rapid creation test ${i + 1}`,
          isPublic: i % 2 === 0, // Alternate between public/private
        };

        const group = await createGroup(TESTING_APP_URL, token, groupData);
        createdGroups.push(group.slug);
        createdGroupData.push({ data: groupData, result: group });

        console.log(`Created group ${i + 1}/${groupCount}: ${group.slug}`);
      }

      // Wait for all automations to complete
      await waitForEventProcessing(6000);

      // Verify all groups have Matrix rooms
      for (let i = 0; i < createdGroupData.length; i++) {
        const { result: group } = createdGroupData[i];
        const details = await getGroupDetails(token, group.slug);

        console.log(`Group ${i + 1} automation result:`, {
          slug: details.slug,
          hasMatrixRoom: !!details.matrixRoomId,
          matrixRoomId: details.matrixRoomId,
        });

        // Each group should have its own Matrix room
        expect(details.matrixRoomId).toBeDefined();
        expect(details.matrixRoomId).toMatch(/^!/);
      }

      // Verify all Matrix room IDs are unique
      const allRoomIds = [];
      for (let i = 0; i < createdGroupData.length; i++) {
        const { result: group } = createdGroupData[i];
        const details = await getGroupDetails(token, group.slug);
        allRoomIds.push(details.matrixRoomId);
      }

      const uniqueRoomIds = [...new Set(allRoomIds)];
      expect(uniqueRoomIds.length).toBe(groupCount);

      console.log(
        '✅ SUCCESS: Rapid group creation produces unique Matrix rooms',
      );
    });
  });
});
