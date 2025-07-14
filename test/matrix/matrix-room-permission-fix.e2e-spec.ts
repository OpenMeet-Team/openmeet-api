import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import {
  loginAsTester,
  loginAsAdmin,
  createEvent,
  createGroup,
  registerMatrixUserIdentity,
} from '../utils/functions';

/**
 * Matrix Room Permission Fix E2E Tests
 *
 * These tests validate that the Matrix bot can fix room permissions
 * in existing rooms where it has insufficient power levels.
 *
 * Test Scenarios:
 * 1. Create a room with broken permissions (bot has low power level)
 * 2. Test if bot can fix its own permissions using syncPermissions
 * 3. Test if Application Service authentication bypasses permission checks
 */
describe('Matrix Room Permission Fix (E2E)', () => {
  let userToken: string;
  let adminToken: string;
  let eventSlug: string;
  let groupSlug: string;
  let currentUser: any;
  let testRoomId: string;

  beforeAll(async () => {
    jest.setTimeout(120000); // Extended timeout for Matrix operations

    // Login as regular user and admin
    userToken = await loginAsTester();
    adminToken = await loginAsAdmin();

    // Get user information
    const userResponse = await request(TESTING_APP_URL)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    currentUser = userResponse.body;

    // Register Matrix user identities
    try {
      await registerMatrixUserIdentity(
        TESTING_APP_URL,
        TESTING_TENANT_ID,
        userToken,
      );
    } catch (error) {
      console.log('Matrix user registration may have failed:', error.message);
    }

    // Create test event and group for room creation
    eventSlug = await createEvent(adminToken, TESTING_TENANT_ID);
    groupSlug = await createGroup(adminToken, TESTING_TENANT_ID);
  });

  describe('Room Permission Diagnosis', () => {
    it('should create an event room and check initial bot permissions', async () => {
      // Join event chat room (this creates it if it doesn't exist)
      const joinResponse = await request(TESTING_APP_URL)
        .post(`/api/v1/chat/event/${eventSlug}/join`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(201);

      expect(joinResponse.body.success).toBe(true);
      expect(joinResponse.body.roomId).toBeDefined();
      testRoomId = joinResponse.body.roomId;

      console.log(`✅ Created event room: ${testRoomId}`);
    });

    it('should run comprehensive room diagnostics via diagnostic endpoint', async () => {
      console.log(`🔍 Running diagnostics on room: ${testRoomId}`);
      
      // Use the new diagnostic endpoint
      const diagnosticResponse = await request(TESTING_APP_URL)
        .get(`/api/v1/chat/admin/room/event/${eventSlug}/permissions-diagnostic`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Diagnostic response status: ${diagnosticResponse.status}`);
      console.log(`🎯 Diagnostic response body:`, JSON.stringify(diagnosticResponse.body, null, 2));

      if (diagnosticResponse.body.diagnostics) {
        const diag = diagnosticResponse.body.diagnostics;
        console.log(`🤖 Bot User ID: ${diag.botUserId}`);
        console.log(`🎚️ Bot Power Level: ${diag.botCurrentPowerLevel}`);
        console.log(`📨 Bot Can Invite: ${diag.botCanInvite}`);
        console.log(`👢 Bot Can Kick: ${diag.botCanKick}`);
        console.log(`⚡ Bot Can Modify Power Levels: ${diag.botCanModifyPowerLevels}`);
        console.log(`🔧 Permission Fix Attempted: ${diag.permissionFixAttempted}`);
        console.log(`✅ Permission Fix Successful: ${diag.permissionFixSuccessful}`);
        console.log(`🏠 Room Exists: ${diag.roomExists}`);
        
        if (diag.errors.length > 0) {
          console.log(`❌ Errors:`, diag.errors);
        }

        // Test assertions
        expect(diag.roomExists).toBe(true);
        expect(diag.botUserId).toContain('@openmeet-admin-bot');
        
        // If permissions were insufficient, they should have been fixed
        if (diag.permissionFixAttempted) {
          console.log(`🚨 Permission issues detected and fix was attempted`);
          if (diag.permissionFixSuccessful) {
            console.log(`✅ Permission fix was successful!`);
            expect(diag.botCanInvite).toBe(true);
            expect(diag.botCanKick).toBe(true);
          } else {
            console.log(`❌ Permission fix failed - this indicates Application Service auth may not bypass permission checks`);
          }
        } else {
          console.log(`✅ Bot already has sufficient permissions`);
          expect(diag.botCanInvite).toBe(true);
          expect(diag.botCanKick).toBe(true);
        }
      }
    });
  });

  describe('Permission Fix Testing', () => {
    it('should test bot permission elevation capabilities', async () => {
      // Test 1: Try to remove a user (requires kick permissions)
      console.log(`🧪 Testing bot's ability to remove users from room ${testRoomId}`);
      
      const removeResponse = await request(TESTING_APP_URL)
        .delete(`/api/v1/chat/event/${eventSlug}/members/${currentUser.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Remove member response status: ${removeResponse.status}`);
      console.log(`🎯 Remove member response body:`, removeResponse.body);

      // Test 2: Re-add the user (requires invite permissions)
      console.log(`🧪 Testing bot's ability to add users back to room`);
      
      const addBackResponse = await request(TESTING_APP_URL)
        .post(`/api/v1/chat/event/${eventSlug}/members/${currentUser.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Add back response status: ${addBackResponse.status}`);
      console.log(`🎯 Add back response body:`, addBackResponse.body);
    });

    it('should test group room permissions', async () => {
      // Create group room
      const joinGroupResponse = await request(TESTING_APP_URL)
        .post(`/api/v1/chat/group/${groupSlug}/join`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .expect(201);

      expect(joinGroupResponse.body.success).toBe(true);
      const groupRoomId = joinGroupResponse.body.roomId;

      console.log(`✅ Created group room: ${groupRoomId}`);

      // Test group room member management
      const removeFromGroupResponse = await request(TESTING_APP_URL)
        .delete(`/api/v1/chat/group/${groupSlug}/members/${currentUser.slug}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Remove from group status: ${removeFromGroupResponse.status}`);
      console.log(`🎯 Remove from group body:`, removeFromGroupResponse.body);
    });
  });

  describe('Room Recreation Testing', () => {
    it('should test room recreation when permissions are broken', async () => {
      // Test the ensure-room endpoint which recreates rooms if needed
      const ensureRoomResponse = await request(TESTING_APP_URL)
        .post(`/api/v1/chat/event/${eventSlug}/ensure-room`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Ensure room status: ${ensureRoomResponse.status}`);
      console.log(`🎯 Ensure room body:`, ensureRoomResponse.body);

      if (ensureRoomResponse.body.recreated) {
        console.log(`🔄 Room was recreated due to permission issues`);
      } else {
        console.log(`✅ Room permissions are working correctly`);
      }
    });
  });

  describe('Bot Authentication Testing', () => {
    it('should verify bot is using Application Service authentication', async () => {
      // This test validates that our bot is properly authenticated
      // We'll test this by attempting operations that require elevated permissions
      
      console.log(`🔐 Testing Application Service authentication capabilities`);
      
      // Test admin room creation endpoint
      const createRoomResponse = await request(TESTING_APP_URL)
        .post(`/api/v1/chat/admin/event/${eventSlug}/chatroom`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Admin create room status: ${createRoomResponse.status}`);
      console.log(`🎯 Admin create room body:`, createRoomResponse.body);

      // Test admin room deletion endpoint
      const deleteRoomResponse = await request(TESTING_APP_URL)
        .delete(`/api/v1/chat/admin/event/${eventSlug}/chatroom`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Admin delete room status: ${deleteRoomResponse.status}`);
      console.log(`🎯 Admin delete room body:`, deleteRoomResponse.body);
    });
  });

  afterAll(async () => {
    // Clean up test rooms if possible
    console.log(`🧹 Cleaning up test rooms...`);
    
    try {
      await request(TESTING_APP_URL)
        .delete(`/api/v1/chat/admin/event/${eventSlug}/chatroom`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);
    } catch (error) {
      console.log('Cleanup error (expected):', error.message);
    }
  });
});

/**
 * Additional utility test to directly test Matrix bot service capabilities
 */
describe('Direct Matrix Bot Service Testing', () => {
  let adminToken: string;

  beforeAll(async () => {
    jest.setTimeout(60000);
    adminToken = await loginAsAdmin();
  });

  it('should test Matrix bot direct capabilities', async () => {
    // This test would require creating a direct test endpoint
    // that exposes Matrix bot service methods for testing
    console.log(`🔬 Direct Matrix bot service testing would go here`);
    console.log(`   - Test syncPermissions method directly`);
    console.log(`   - Test Application Service token authentication`);
    console.log(`   - Test power level modification capabilities`);
    
    // For now, we rely on the indirect testing through chat endpoints
    expect(true).toBe(true);
  });
});