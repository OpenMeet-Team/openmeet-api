import request from 'supertest';
import { TESTING_APP_URL, TESTING_TENANT_ID } from '../utils/constants';

describe('Matrix Application Service Webhooks (e2e)', () => {
  const server = request
    .agent(TESTING_APP_URL)
    .set('x-tenant-id', TESTING_TENANT_ID);

  // Use the actual tokens from our configuration
  const HOMESERVER_TOKEN =
    'df51b086825667040f89888d920641c44d449b8741cfee1e02ce6f0845a6a0fb';

  describe('User Registration Queries', () => {
    it('should accept users in openmeet-bot namespace', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test:matrix.example.com',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should accept users in openmeet namespace', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-user123:matrix.example.com',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should reject users outside namespace', async () => {
      const response = await server
        .get('/api/matrix/appservice/users/@regular-user:matrix.example.com')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({ error: 'User not in namespace' });
    });

    it('should reject requests with invalid homeserver token', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test:matrix.example.com',
        )
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should reject requests without authorization header', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test:matrix.example.com',
        )
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });
  });

  describe('Room Alias Queries', () => {
    it('should reject all room queries (not auto-creating rooms)', async () => {
      const roomAlias = encodeURIComponent('#openmeet-room:matrix.example.com');
      const response = await server
        .get(`/api/matrix/appservice/rooms/${roomAlias}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({ error: 'Room not found' });
    });

    it('should reject room queries with invalid token', async () => {
      const roomAlias = encodeURIComponent('#openmeet-room:matrix.example.com');
      const response = await server
        .get(`/api/matrix/appservice/rooms/${roomAlias}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });
  });

  describe('Transaction Processing', () => {
    const sampleEvents = [
      {
        type: 'm.room.message',
        event_id: '$event1:matrix.example.com',
        sender: '@user:matrix.example.com',
        origin_server_ts: Date.now(),
        content: {
          msgtype: 'm.text',
          body: 'Hello from Matrix!',
        },
        room_id: '!room123:matrix.example.com',
      },
      {
        type: 'm.room.member',
        event_id: '$event2:matrix.example.com',
        sender: '@user:matrix.example.com',
        state_key: '@user:matrix.example.com',
        origin_server_ts: Date.now(),
        content: {
          membership: 'join',
          displayname: 'Test User',
        },
        room_id: '!room123:matrix.example.com',
      },
    ];

    it('should process valid transaction with events', async () => {
      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_123')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(sampleEvents)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should process empty transaction', async () => {
      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_empty')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send([])
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should reject transaction with invalid token', async () => {
      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_invalid')
        .set('Authorization', 'Bearer invalid-token')
        .send(sampleEvents)
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should handle transaction idempotency', async () => {
      const txnId = 'txn_idempotent_test';

      // Send same transaction twice
      const response1 = await server
        .put(`/api/matrix/appservice/_matrix/app/v1/transactions/${txnId}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(sampleEvents)
        .expect(200);

      const response2 = await server
        .put(`/api/matrix/appservice/_matrix/app/v1/transactions/${txnId}`)
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(sampleEvents)
        .expect(200);

      expect(response1.body).toEqual({});
      expect(response2.body).toEqual({});
      // Both should succeed (Matrix expects idempotent behavior)
    });
  });

  describe('Third-Party Protocol Endpoints', () => {
    it('should return empty protocols list', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/_matrix/app/v1/thirdparty/protocol/example',
        )
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should return empty locations list', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/_matrix/app/v1/thirdparty/location/example',
        )
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return empty users list', async () => {
      const response = await server
        .get('/api/matrix/appservice/_matrix/app/v1/thirdparty/user/example')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('Security and Edge Cases', () => {
    it('should handle malformed authorization headers', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test:matrix.example.com',
        )
        .set('Authorization', 'Malformed header')
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should handle missing Bearer prefix', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test:matrix.example.com',
        )
        .set('Authorization', HOMESERVER_TOKEN)
        .expect(200);

      expect(response.body).toEqual({ error: 'Invalid token' });
    });

    it('should handle special characters in user IDs', async () => {
      const response = await server
        .get(
          '/api/matrix/appservice/users/@openmeet-bot-test%2Bspecial:matrix.example.com',
        )
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({});
    });

    it('should validate Matrix ID format in namespace check', async () => {
      const response = await server
        .get('/api/matrix/appservice/users/invalid-matrix-id')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .expect(200);

      expect(response.body).toEqual({ error: 'User not in namespace' });
    });
  });

  describe('Performance and Load', () => {
    it('should handle concurrent user queries efficiently', async () => {
      const startTime = Date.now();

      const promises = Array.from({ length: 10 }, (_, i) =>
        server
          .get(
            `/api/matrix/appservice/users/@openmeet-bot-test${i}:matrix.example.com`,
          )
          .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
          .expect(200),
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle large transactions efficiently', async () => {
      const largeEventSet = Array.from({ length: 50 }, (_, i) => ({
        type: 'm.room.message',
        event_id: `$event${i}:matrix.example.com`,
        sender: '@user:matrix.example.com',
        origin_server_ts: Date.now(),
        content: {
          msgtype: 'm.text',
          body: `Message ${i}`,
        },
        room_id: '!room123:matrix.example.com',
      }));

      const startTime = Date.now();

      const response = await server
        .put('/api/matrix/appservice/_matrix/app/v1/transactions/txn_large')
        .set('Authorization', `Bearer ${HOMESERVER_TOKEN}`)
        .send(largeEventSet)
        .expect(200);

      const duration = Date.now() - startTime;
      expect(response.body).toEqual({});
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    });
  });
});
