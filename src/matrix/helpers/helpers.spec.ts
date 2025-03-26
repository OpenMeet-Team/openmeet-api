import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  BroadcastManager,
  MatrixGatewayHelper,
  RoomMembershipManager,
  TypingManager,
} from './index';

describe('Matrix Gateway Helpers', () => {
  describe('BroadcastManager', () => {
    let broadcastManager: BroadcastManager;

    beforeEach(() => {
      broadcastManager = new BroadcastManager('TestContext');
    });

    it('should detect duplicate broadcasts', () => {
      const roomId = 'test-room-1';
      const event = { event_id: 'event1', type: 'test-event' };

      // First broadcast should not be skipped
      expect(broadcastManager.shouldSkipDuplicateBroadcast(roomId, event)).toBe(
        false,
      );

      // Second identical broadcast should be skipped
      expect(broadcastManager.shouldSkipDuplicateBroadcast(roomId, event)).toBe(
        true,
      );

      // Different event should not be skipped
      const differentEvent = { event_id: 'event2', type: 'test-event' };
      expect(
        broadcastManager.shouldSkipDuplicateBroadcast(roomId, differentEvent),
      ).toBe(false);

      // Different room should not be skipped
      const differentRoom = 'test-room-2';
      expect(
        broadcastManager.shouldSkipDuplicateBroadcast(differentRoom, event),
      ).toBe(false);
    });

    it('should generate unique broadcast IDs', () => {
      const id1 = broadcastManager.generateBroadcastId();
      const id2 = broadcastManager.generateBroadcastId();

      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(10);
    });

    it('should clean up old broadcasts', () => {
      // Mock Date.now to return a fixed value
      const realDateNow = Date.now;
      const fixedTime = 1609459200000; // 2021-01-01
      global.Date.now = jest.fn(() => fixedTime);

      // Add some events
      const roomId = 'test-room-1';
      const event1 = { event_id: 'event1', type: 'test-event' };
      const event2 = { event_id: 'event2', type: 'test-event' };

      broadcastManager.shouldSkipDuplicateBroadcast(roomId, event1);
      broadcastManager.shouldSkipDuplicateBroadcast(roomId, event2);

      // Advance time by 11 minutes
      global.Date.now = jest.fn(() => fixedTime + 11 * 60 * 1000);

      // Clean up old broadcasts
      broadcastManager.cleanupOldBroadcasts();

      // After cleanup, the events should not be considered duplicates
      expect(
        broadcastManager.shouldSkipDuplicateBroadcast(roomId, event1),
      ).toBe(false);
      expect(
        broadcastManager.shouldSkipDuplicateBroadcast(roomId, event2),
      ).toBe(false);

      // Restore Date.now
      global.Date.now = realDateNow;
    });
  });

  describe('RoomMembershipManager', () => {
    let roomMembershipManager: RoomMembershipManager;
    let mockServer: Partial<Server>;

    beforeEach(() => {
      roomMembershipManager = new RoomMembershipManager('TestContext');

      // Mock server with sockets collection
      mockServer = {
        sockets: {
          sockets: new Map(),
        },
      } as unknown as Partial<Server>;
    });

    it('should track socket registrations', () => {
      const socketId = 'socket1';
      const userId = 123;
      const matrixUserId = '@user:example.com';

      roomMembershipManager.registerSocket(socketId, userId, matrixUserId);

      const result = roomMembershipManager.unregisterSocket(socketId);

      expect(result).toEqual({ userId, matrixUserId });
    });

    it('should track room memberships', () => {
      const matrixUserId = '@user:example.com';
      const roomId1 = 'room1';
      const roomId2 = 'room2';

      // Add user to rooms
      roomMembershipManager.addUserToRoom(matrixUserId, roomId1);
      roomMembershipManager.addUserToRoom(matrixUserId, roomId2);

      // Get user's rooms
      const userRooms = roomMembershipManager.getUserRooms(matrixUserId);
      expect(userRooms.has(roomId1)).toBe(true);
      expect(userRooms.has(roomId2)).toBe(true);

      // Get users in a room
      const usersInRoom1 = roomMembershipManager.getUsersInRoom(roomId1);
      expect(usersInRoom1).toContain(matrixUserId);

      // Remove from room
      roomMembershipManager.removeUserFromRoom(matrixUserId, roomId1);
      expect(
        roomMembershipManager.getUserRooms(matrixUserId).has(roomId1),
      ).toBe(false);
      expect(
        roomMembershipManager.getUserRooms(matrixUserId).has(roomId2),
      ).toBe(true);

      // Remove from all rooms
      roomMembershipManager.removeUserFromAllRooms(matrixUserId);
      expect(roomMembershipManager.getUserRooms(matrixUserId).size).toBe(0);
    });
  });

  describe('TypingManager', () => {
    let typingManager: TypingManager;

    beforeEach(() => {
      typingManager = new TypingManager('TestContext');
    });

    it('should debounce typing notifications', () => {
      const userId = 'user1';
      const roomId = 'room1';

      // First notification should be sent
      expect(
        typingManager.shouldSendTypingNotification(userId, roomId, true),
      ).toBe(true);

      // Same state within window should be debounced
      expect(
        typingManager.shouldSendTypingNotification(userId, roomId, true),
      ).toBe(false);

      // Different state should be sent
      expect(
        typingManager.shouldSendTypingNotification(userId, roomId, false),
      ).toBe(true);

      // Different user should be sent
      expect(
        typingManager.shouldSendTypingNotification('user2', roomId, true),
      ).toBe(true);

      // Different room should be sent
      expect(
        typingManager.shouldSendTypingNotification(userId, 'room2', true),
      ).toBe(true);
    });

    it('should clean up old typing notifications', () => {
      // Mock Date.now to return a fixed value
      const realDateNow = Date.now;
      const fixedTime = 1609459200000; // 2021-01-01
      global.Date.now = jest.fn(() => fixedTime);

      // Add some typing notifications
      const userId = 'user1';
      const roomId = 'room1';

      typingManager.shouldSendTypingNotification(userId, roomId, true);

      // Advance time by 6 minutes
      global.Date.now = jest.fn(() => fixedTime + 6 * 60 * 1000);

      // Clean up old typing notifications
      typingManager.cleanupTypingCache();

      // After cleanup, the notification should be sent again
      expect(
        typingManager.shouldSendTypingNotification(userId, roomId, true),
      ).toBe(true);

      // Restore Date.now
      global.Date.now = realDateNow;
    });
  });

  describe('MatrixGatewayHelper', () => {
    it('should handle errors properly with withErrorHandling', async () => {
      const logger = new Logger('TestContext');
      logger.error = jest.fn();

      // Test with successful operation
      const successResult = await MatrixGatewayHelper.withErrorHandling(
        async () => ({ data: 'test' }),
        'Test operation',
        logger,
      );

      expect(successResult).toEqual({ success: true, data: 'test' });

      // Test with failing operation
      const failureResult = await MatrixGatewayHelper.withErrorHandling(
        async () => {
          throw new Error('Test error');
        },
        'Test operation',
        logger,
      );

      expect(failureResult.success).toBe(false);
      expect(failureResult.error).toContain('Test operation');
      expect(failureResult.error).toContain('Test error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should get tenant ID from various sources', () => {
      // From client data
      const clientWithTenantData = { data: { tenantId: 'tenant1' } };
      expect(MatrixGatewayHelper.getTenantId(clientWithTenantData as any)).toBe(
        'tenant1',
      );

      // From request data
      const clientWithoutData = { data: {} };
      const requestData = { tenantId: 'tenant2' };
      expect(
        MatrixGatewayHelper.getTenantId(clientWithoutData as any, requestData),
      ).toBe('tenant2');

      // Priority: client data > request data
      expect(
        MatrixGatewayHelper.getTenantId(
          clientWithTenantData as any,
          requestData,
        ),
      ).toBe('tenant1');
    });
  });
});
