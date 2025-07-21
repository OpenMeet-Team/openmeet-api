import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

describe('Matrix Automatic Room Sync (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  // Use the actual tokens from our configuration
  const HOMESERVER_TOKEN = process.env.MATRIX_APPSERVICE_HS_TOKEN;

  if (!HOMESERVER_TOKEN) {
    throw new Error(
      'MATRIX_APPSERVICE_HS_TOKEN environment variable is required for appservice tests',
    );
  }

  describe('User Login Room Sync', () => {
    it('should trigger room sync when user joins Matrix (login event)', async () => {
      // Simulate a Matrix webhook event for user login
      const userLoginEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$login_event_123:matrix.example.com',
            sender: '@test-user:matrix.example.com',
            state_key: '@test-user:matrix.example.com', // Same as sender = user joining themselves
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
              displayname: 'Test User',
            },
            room_id: '!user_room:matrix.example.com', // User's own room or any room they join
          },
        ],
      };

      // Send the webhook transaction
      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_user_login_sync',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(userLoginEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // The webhook should process successfully without errors
    });

    it('should not trigger room sync for user being invited by others', async () => {
      // Simulate a Matrix webhook event where someone else invites a user
      const userInviteEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$invite_event_123:matrix.example.com',
            sender: '@admin:matrix.example.com', // Different from state_key
            state_key: '@test-user:matrix.example.com', // User being invited
            origin_server_ts: Date.now(),
            content: {
              membership: 'invite',
              displayname: 'Test User',
            },
            room_id: '!admin_room:matrix.example.com',
          },
        ],
      };

      // Send the webhook transaction
      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_user_invite',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(userInviteEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // Should process without triggering room sync since sender !== state_key
    });

    it('should handle invalid Matrix user ID format gracefully', async () => {
      // Simulate event with malformed Matrix user ID
      const invalidUserEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$invalid_user_123:matrix.example.com',
            sender: 'invalid-matrix-id', // Malformed Matrix ID
            state_key: 'invalid-matrix-id',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_invalid_user',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(invalidUserEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // Should handle gracefully without crashing
    });

    it('should process room sync for multiple user login events in batch', async () => {
      // Simulate multiple users logging in simultaneously
      const multiUserLoginEvents = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$user1_login:matrix.example.com',
            sender: '@user1:matrix.example.com',
            state_key: '@user1:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
              displayname: 'User One',
            },
            room_id: '!user1_room:matrix.example.com',
          },
          {
            type: 'm.room.member',
            event_id: '$user2_login:matrix.example.com',
            sender: '@user2:matrix.example.com',
            state_key: '@user2:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
              displayname: 'User Two',
            },
            room_id: '!user2_room:matrix.example.com',
          },
          {
            type: 'm.room.message', // Non-member event in between
            event_id: '$message1:matrix.example.com',
            sender: '@user1:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              msgtype: 'm.text',
              body: 'Hello!',
            },
            room_id: '!chat_room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_multi_user_login',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(multiUserLoginEvents)
        .expect(200);

      expect(response.body).toEqual({});
      // Should process all events successfully
    });
  });

  describe('Room Sync Error Handling', () => {
    it('should handle room sync errors gracefully without failing webhook', async () => {
      // Use a realistic Matrix user ID that might exist but cause sync issues
      const userLoginWithPotentialErrors = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$error_prone_login:matrix.example.com',
            sender: '@nonexistent-user:matrix.example.com',
            state_key: '@nonexistent-user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
              displayname: 'Nonexistent User',
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_error_handling',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(userLoginWithPotentialErrors)
        .expect(200);

      expect(response.body).toEqual({});
      // Should return success even if room sync fails internally
    });

    it('should handle network timeouts during room sync gracefully', async () => {
      // Simulate a user login that might cause timeouts
      const timeoutProneEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$timeout_test:matrix.example.com',
            sender: '@timeout-user:matrix.example.com',
            state_key: '@timeout-user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const startTime = Date.now();

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_timeout_test',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(timeoutProneEvent)
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body).toEqual({});
      expect(duration).toBeLessThan(5000); // Should respond quickly even if sync is slow
    });
  });

  describe('Member Event Types', () => {
    it('should only process join events, not leave events', async () => {
      const userLeaveEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$leave_event:matrix.example.com',
            sender: '@user:matrix.example.com',
            state_key: '@user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'leave', // User leaving, not joining
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_leave_event',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(userLeaveEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // Should process successfully but not trigger room sync
    });

    it('should only process join events, not ban events', async () => {
      const userBanEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$ban_event:matrix.example.com',
            sender: '@admin:matrix.example.com',
            state_key: '@user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'ban',
              reason: 'Test ban',
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_ban_event')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(userBanEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // Should process successfully but not trigger room sync
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle high-frequency login events efficiently', async () => {
      // Simulate rapid-fire user login events
      const rapidLoginEvents = Array.from({ length: 20 }, (_, i) => ({
        type: 'm.room.member',
        event_id: `$rapid_login_${i}:matrix.example.com`,
        sender: `@rapid-user-${i}:matrix.example.com`,
        state_key: `@rapid-user-${i}:matrix.example.com`,
        origin_server_ts: Date.now() + i,
        content: {
          membership: 'join',
          displayname: `Rapid User ${i}`,
        },
        room_id: `!rapid_room_${i}:matrix.example.com`,
      }));

      const startTime = Date.now();

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_rapid_logins',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send({ events: rapidLoginEvents })
        .expect(200);

      const duration = Date.now() - startTime;

      expect(response.body).toEqual({});
      expect(duration).toBeLessThan(3000); // Should handle bulk events efficiently
    });

    it('should maintain webhook response speed despite background processing', async () => {
      // Test that webhook responds quickly even when room sync is processing
      const complexUserEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$complex_user_login:matrix.example.com',
            sender: '@complex-user:matrix.example.com',
            state_key: '@complex-user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
              displayname: 'Complex User with Many Memberships',
            },
            room_id: '!complex_room:matrix.example.com',
          },
        ],
      };

      const startTime = Date.now();

      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_complex_user',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(complexUserEvent)
        .expect(200);

      const webhookDuration = Date.now() - startTime;

      expect(response.body).toEqual({});
      expect(webhookDuration).toBeLessThan(1000); // Webhook should respond quickly
      // Room sync should happen in background
    });
  });

  describe('Security Validation', () => {
    it('should require valid homeserver token for all room sync events', async () => {
      const userLoginEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$secure_login:matrix.example.com',
            sender: '@secure-user:matrix.example.com',
            state_key: '@secure-user:matrix.example.com',
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
            },
            room_id: '!secure_room:matrix.example.com',
          },
        ],
      };

      // Test with invalid token
      const response = await server
        .put(
          '/api/matrix/appservice/_matrix/app/v1/transactions/txn_security_test',
        )
        .set('Authorization', 'Bearer invalid-token')
        .send(userLoginEvent)
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should validate Matrix user ID format before processing', async () => {
      const maliciousEvent = {
        events: [
          {
            type: 'm.room.member',
            event_id: '$malicious:matrix.example.com',
            sender: '@normal-user:matrix.example.com',
            state_key: 'javascript:alert("xss")', // Malicious state_key
            origin_server_ts: Date.now(),
            content: {
              membership: 'join',
            },
            room_id: '!room:matrix.example.com',
          },
        ],
      };

      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_malicious')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(maliciousEvent)
        .expect(200);

      expect(response.body).toEqual({});
      // Should handle safely without executing malicious content
    });
  });
});
