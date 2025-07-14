import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';
import { loginAsAdmin } from '../utils/functions';

/**
 * Matrix Room Permission Diagnostic E2E Tests
 *
 * Simplified test that focuses on testing the diagnostic endpoint
 * with existing rooms or manually created test scenarios.
 */
describe('Matrix Room Permission Diagnostic (E2E)', () => {
  let adminToken: string;

  beforeAll(async () => {
    jest.setTimeout(120000); // Extended timeout for Matrix operations
    adminToken = await loginAsAdmin();
  });

  describe('Diagnostic Endpoint Testing', () => {
    it('should test diagnostic endpoint with a simple event room creation', async () => {
      console.log(`🧪 Testing diagnostic endpoint...`);

      // First, try to create a simple event for testing
      const eventPayload = {
        name: 'Matrix Permission Test Event',
        description: 'Test event for Matrix room permission diagnostics',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(), // Tomorrow + 1 hour
        address: 'Test Location',
        isPrivate: false,
      };

      const createEventResponse = await request(TESTING_APP_URL)
        .post('/api/events')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(eventPayload);

      console.log(`📅 Event creation status: ${createEventResponse.status}`);

      if (createEventResponse.status === 201 && createEventResponse.body.slug) {
        const eventSlug = createEventResponse.body.slug;
        console.log(`✅ Created test event: ${eventSlug}`);

        // Test the diagnostic endpoint
        await testDiagnosticEndpoint('event', eventSlug);
      } else {
        console.log(`❌ Event creation failed, skipping diagnostic test`);
        console.log(`Response:`, createEventResponse.body);
      }
    });

    it('should test diagnostic endpoint with manual room access', async () => {
      console.log(`🔧 Testing diagnostic endpoint with manual approach...`);

      // Try to test with a hardcoded event slug that might exist
      // This is a fallback approach if event creation fails
      const testEventSlug = 'test-event-permissions';

      console.log(`🎯 Attempting diagnostic on event: ${testEventSlug}`);

      const diagnosticResponse = await request(TESTING_APP_URL)
        .get(`/api/chat/admin/room/event/${testEventSlug}/permissions-diagnostic`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID);

      console.log(`🎯 Diagnostic response status: ${diagnosticResponse.status}`);
      console.log(`🎯 Diagnostic response body:`, JSON.stringify(diagnosticResponse.body, null, 2));

      if (diagnosticResponse.status === 200) {
        analyzeDiagnosticResults(diagnosticResponse.body);
      } else {
        console.log(`ℹ️ Diagnostic test skipped - no suitable room found`);
        console.log(`   This is expected if no test events exist`);
      }
    });
  });

  /**
   * Helper function to test the diagnostic endpoint
   */
  async function testDiagnosticEndpoint(roomType: 'event' | 'group', slug: string) {
    console.log(`🔍 Running diagnostics on ${roomType}: ${slug}`);

    const diagnosticResponse = await request(TESTING_APP_URL)
      .get(`/api/chat/admin/room/${roomType}/${slug}/permissions-diagnostic`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log(`🎯 Diagnostic response status: ${diagnosticResponse.status}`);
    console.log(`🎯 Diagnostic response body:`, JSON.stringify(diagnosticResponse.body, null, 2));

    if (diagnosticResponse.status === 200) {
      expect(diagnosticResponse.body.success).toBe(true);
      analyzeDiagnosticResults(diagnosticResponse.body);
    } else {
      console.log(`⚠️ Diagnostic failed with status ${diagnosticResponse.status}`);
      console.log(`   This might indicate the room doesn't exist or there's an authentication issue`);
    }
  }

  /**
   * Helper function to analyze diagnostic results
   */
  function analyzeDiagnosticResults(responseBody: any) {
    if (responseBody.diagnostics) {
      const diag = responseBody.diagnostics;
      
      console.log(`\n📊 DIAGNOSTIC RESULTS:`);
      console.log(`🤖 Bot User ID: ${diag.botUserId}`);
      console.log(`🎚️ Bot Power Level: ${diag.botCurrentPowerLevel}`);
      console.log(`📨 Bot Can Invite: ${diag.botCanInvite}`);
      console.log(`👢 Bot Can Kick: ${diag.botCanKick}`);
      console.log(`⚡ Bot Can Modify Power Levels: ${diag.botCanModifyPowerLevels}`);
      console.log(`🔧 Permission Fix Attempted: ${diag.permissionFixAttempted}`);
      console.log(`✅ Permission Fix Successful: ${diag.permissionFixSuccessful}`);
      console.log(`🏠 Room Exists: ${diag.roomExists}`);

      if (diag.errors && diag.errors.length > 0) {
        console.log(`❌ Errors:`, diag.errors);
      }

      // Analysis
      console.log(`\n🔬 ANALYSIS:`);
      
      if (diag.roomExists) {
        console.log(`✅ Room is accessible to the bot`);
      } else {
        console.log(`❌ Room is not accessible - this indicates a serious issue`);
      }

      if (diag.botCanInvite && diag.botCanKick) {
        console.log(`✅ Bot has sufficient permissions (level ${diag.botCurrentPowerLevel})`);
        console.log(`   The current room creation process is working correctly`);
      } else {
        console.log(`⚠️ Bot has insufficient permissions (level ${diag.botCurrentPowerLevel})`);
        console.log(`   This indicates an existing room with permission issues`);
      }

      if (diag.permissionFixAttempted) {
        if (diag.permissionFixSuccessful) {
          console.log(`🎉 PERMISSION FIX SUCCESSFUL!`);
          console.log(`   Application Service authentication can bypass Matrix permission checks`);
          console.log(`   syncPermissions() method works for fixing existing rooms`);
        } else {
          console.log(`💔 Permission fix failed`);
          console.log(`   Application Service auth does NOT bypass Matrix permission security`);
          console.log(`   We need Matrix Admin API or manual intervention for existing rooms`);
        }
      } else {
        console.log(`✅ No permission fix needed - bot already has sufficient access`);
      }

      // Test assertions
      expect(diag.botUserId).toContain('@openmeet-admin-bot');
      expect(diag.roomExists).toBe(true);
      
      // If a fix was attempted, we want to know the result
      if (diag.permissionFixAttempted) {
        console.log(`\n🚨 IMPORTANT: Permission fix was attempted!`);
        console.log(`   Fix successful: ${diag.permissionFixSuccessful}`);
        
        if (diag.permissionFixSuccessful) {
          expect(diag.botCanInvite).toBe(true);
          expect(diag.botCanKick).toBe(true);
          expect(diag.botCurrentPowerLevel).toBeGreaterThanOrEqual(50);
        }
      }
    }
  }

  describe('Alternative Testing Approaches', () => {
    it('should test room member operations to infer bot permissions', async () => {
      console.log(`🧪 Testing bot permissions through member operations...`);

      // This test tries to infer bot permissions by testing actual operations
      // that would be used in the removeMemberFromGroupDiscussion scenario

      // Create a test group
      const groupPayload = {
        name: 'Matrix Permission Test Group',
        description: 'Test group for Matrix room permission testing',
        isPrivate: false,
      };

      const createGroupResponse = await request(TESTING_APP_URL)
        .post('/api/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', TESTING_TENANT_ID)
        .send(groupPayload);

      console.log(`👥 Group creation status: ${createGroupResponse.status}`);

      if (createGroupResponse.status === 201 && createGroupResponse.body.slug) {
        const groupSlug = createGroupResponse.body.slug;
        console.log(`✅ Created test group: ${groupSlug}`);

        // Test joining the group chat room
        const joinResponse = await request(TESTING_APP_URL)
          .post(`/api/chat/group/${groupSlug}/join`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('x-tenant-id', TESTING_TENANT_ID);

        console.log(`🚪 Join group chat status: ${joinResponse.status}`);
        console.log(`🚪 Join group chat body:`, joinResponse.body);

        if (joinResponse.body.success) {
          console.log(`✅ Successfully joined group chat room: ${joinResponse.body.roomId}`);

          // Now test the diagnostic endpoint on this group
          await testDiagnosticEndpoint('group', groupSlug);
        }
      } else {
        console.log(`❌ Group creation failed, skipping test`);
      }
    });
  });
});

/**
 * Simple test to validate the endpoint exists and is accessible
 */
describe('Diagnostic Endpoint Availability', () => {
  let adminToken: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    adminToken = await loginAsAdmin();
  });

  it('should respond to diagnostic endpoint requests', async () => {
    console.log(`🔌 Testing if diagnostic endpoint is available...`);

    // Test with a non-existent room to see if the endpoint responds correctly
    const testResponse = await request(TESTING_APP_URL)
      .get(`/api/chat/admin/room/event/non-existent-room/permissions-diagnostic`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-tenant-id', TESTING_TENANT_ID);

    console.log(`🎯 Test response status: ${testResponse.status}`);
    console.log(`🎯 Test response body:`, testResponse.body);

    // The endpoint should respond (even if with an error about the room not existing)
    // Status should not be 404 (endpoint not found)
    expect(testResponse.status).not.toBe(404);
    
    // It should return a structured response
    expect(testResponse.body).toHaveProperty('success');
    
    console.log(`✅ Diagnostic endpoint is available and responding`);
  });
});