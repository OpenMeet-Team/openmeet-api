import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatrixCoreService } from './services/matrix-core.service';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { MatrixGateway } from './matrix.gateway';
import { JwtService } from '@nestjs/jwt';
import { ModuleRef } from '@nestjs/core';

// Mock the socket.io Socket
class MockSocket {
  id = 'test-socket-id';
  data = {};
  rooms = new Set();

  emit = jest.fn();
  to = jest.fn().mockReturnValue({
    emit: jest.fn(),
  });
  join = jest.fn();
  leave = jest.fn();
}

describe('MatrixGateway WebSocket Integration', () => {
  let gateway: MatrixGateway;
  let matrixCoreService: MatrixCoreService;
  let matrixUserService: MatrixUserService;
  let matrixRoomService: MatrixRoomService;
  let matrixMessageService: MatrixMessageService;
  let mockSocket: MockSocket;

  beforeEach(async () => {
    mockSocket = new MockSocket();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixGateway,
        {
          provide: MatrixCoreService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              baseUrl: 'https://matrix.example.org',
              serverName: 'example.org',
              adminUserId: '@admin:example.org',
              defaultDeviceId: 'OPENMEET_SERVER',
              defaultInitialDeviceDisplayName: 'OpenMeet Server',
            }),
            getAdminClient: jest.fn(),
            getSdk: jest.fn(),
          },
        },
        {
          provide: MatrixUserService,
          useValue: {
            getClientForUser: jest.fn(),
            releaseClientForUser: jest.fn(),
          },
        },
        {
          provide: MatrixRoomService,
          useValue: {
            joinRoom: jest.fn(),
          },
        },
        {
          provide: MatrixMessageService,
          useValue: {
            sendMessage: jest.fn(),
            sendTypingNotification: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                matrix: {
                  baseUrl: 'https://matrix.example.org',
                  adminUser: 'admin',
                  adminAccessToken: 'admin-token',
                  serverName: 'example.org',
                  defaultDeviceId: 'OPENMEET_SERVER',
                  defaultInitialDeviceDisplayName: 'OpenMeet Server',
                },
                jwt: {
                  accessTokenSecret: 'test-secret',
                  accessTokenExpiresIn: '1h',
                },
              };

              // Parse the key path (e.g., 'matrix.baseUrl')
              const parts = key.split('.');
              let result = config;
              for (const part of parts) {
                result = result[part];
              }

              return result;
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            resolve: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<MatrixGateway>(MatrixGateway);
    matrixCoreService = module.get<MatrixCoreService>(MatrixCoreService);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixRoomService = module.get<MatrixRoomService>(MatrixRoomService);
    matrixMessageService =
      module.get<MatrixMessageService>(MatrixMessageService);

    // Setup server property on gateway
    (gateway as any).server = {
      adapter: {
        rooms: new Map(),
      },
      sockets: {
        sockets: new Map([[mockSocket.id, mockSocket]]),
      },
    };

    // Initialize the logger
    (gateway as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('WebSocket functionality', () => {
    it('should broadcast room events to subscribed clients', () => {
      // Set up a room in the server adapter
      const roomId = '!test-room:example.org';
      const room = new Set([mockSocket.id]);
      (gateway as any).server.adapter.rooms.set(roomId, room);

      // Set up the socket user mapping
      (gateway as any).socketUsers = new Map([
        [mockSocket.id, { userId: 1, matrixUserId: '@user1:example.org' }],
      ]);

      // Set up the user rooms mapping
      (gateway as any).userRooms = new Map([
        ['@user1:example.org', new Set([roomId])],
      ]);

      // Create an event to broadcast
      const event = {
        type: 'm.room.message',
        room_id: roomId,
        content: { body: 'Hello world', msgtype: 'm.text' },
        sender: '@user2:example.org',
        event_id: '$event1',
        origin_server_ts: Date.now(),
      };

      // Mock the server's emit method
      const mockToEmit = jest.fn();
      (gateway as any).server.to = jest.fn().mockReturnValue({
        emit: mockToEmit,
      });

      // Call the broadcast method
      gateway.broadcastRoomEvent(roomId, event);

      // Check that server.to().emit was called with the event
      expect((gateway as any).server.to).toHaveBeenCalledWith(roomId);
      expect(mockToEmit).toHaveBeenCalledWith(
        'matrix-event',
        expect.objectContaining({
          type: 'm.room.message',
          room_id: roomId,
          content: { body: 'Hello world', msgtype: 'm.text' },
          sender: '@user2:example.org',
        }),
      );
    });

    it('should handle missing rooms gracefully', () => {
      // Test with a room that doesn't exist
      const roomId = '!nonexistent-room:example.org';

      // Create an event to broadcast
      const event = {
        type: 'm.room.message',
        room_id: roomId,
        content: { body: 'Hello world' },
        sender: '@user:example.org',
      };

      // Mock the server's emit method
      const mockToEmit = jest.fn();
      (gateway as any).server.to = jest.fn().mockReturnValue({
        emit: mockToEmit,
      });

      // This should not throw an error
      gateway.broadcastRoomEvent(roomId, event);

      // Still expect the broadcast attempt despite the room not existing
      expect((gateway as any).server.to).toHaveBeenCalledWith(roomId);

      // The log warning should be called
      expect((gateway as any).logger.warn).toHaveBeenCalled();
    });

    // Add more tests for other WebSocket functionality as needed
  });
});
