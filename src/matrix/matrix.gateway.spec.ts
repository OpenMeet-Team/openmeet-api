import { Test, TestingModule } from '@nestjs/testing';
import { MatrixGateway } from './matrix.gateway';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { MatrixCoreService } from './services/matrix-core.service';
import { UserService } from '../user/user.service';
import { ChatRoomService } from '../chat/rooms/chat-room.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventEmitter } from 'events';
import {
  BroadcastManager,
  MatrixGatewayHelper,
  RoomMembershipManager,
  SocketAuthHandler,
  TypingManager,
} from './helpers';

class MockSocket extends EventEmitter {
  id = 'mock-socket-id';
  rooms = new Set<string>();
  data: any = {}; // Add data property for testing
  handshake = {
    auth: {
      token: 'mock-token',
      tenantId: 'default',
    },
    query: {},
    headers: {},
  };
  join = jest.fn((room: string) => {
    this.rooms.add(room);
    return Promise.resolve();
  });
  leave = jest.fn((room: string) => {
    this.rooms.delete(room);
    return Promise.resolve();
  });
  emit = jest.fn();
  to = jest.fn(() => ({ emit: jest.fn() }));
  disconnect = jest.fn();
}

describe('MatrixGateway', () => {
  let gateway: MatrixGateway;
  let matrixUserService: MatrixUserService;
  let matrixMessageService: MatrixMessageService;
  let mockClient: MockSocket;
  let mockServer: Partial<any>; // Updated to any type to avoid Server type error
  let roomMembershipManager: RoomMembershipManager;
  let broadcastManager: BroadcastManager;
  let typingManager: TypingManager;

  // Add missing matrix client method implementations
  const mockMatrixClient = {
    sendTyping: jest.fn().mockResolvedValue(true),
    sendEvent: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
  };

  const mockUser = {
    id: 1,
    ulid: 'USER123',
    slug: 'test-user-123',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    matrixUserId: '@test_user123:matrix.openmeet.net',
    matrixAccessToken: 'matrix_token_abc123',
    matrixDeviceId: 'DEVICE_XYZ',
  };

  const mockJwtPayload = {
    id: 1,
    role: { id: 1, name: 'user' },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const mockEmitHandler = jest.fn();

  beforeEach(async () => {
    mockClient = new MockSocket();
    // Set mock data that would be set in middleware/handleConnection
    mockClient.data = {
      userId: mockUser.id,
      matrixUserId: mockUser.matrixUserId,
      matrixClientInitialized: true,
      hasMatrixCredentials: true,
      tenantId: 'default',
    };
    mockServer = {
      to: jest.fn().mockReturnValue({
        emit: mockEmitHandler,
      }),
      sockets: {
        sockets: new Map([[mockClient.id, mockClient]]),
      },
      adapter: {
        rooms: new Map([
          ['!room1:server', new Set([mockClient.id])],
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixGateway,
        {
          provide: MatrixUserService,
          useValue: {
            getClientForUser: jest.fn().mockResolvedValue({
              sendTyping: jest.fn().mockResolvedValue(true),
              sendEvent: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
            }),
            releaseClientForUser: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: MatrixRoomService,
          useValue: {
            joinRoom: jest.fn().mockResolvedValue(true),
            getUserRoomsWithClient: jest.fn().mockResolvedValue([
              { roomId: '!room1:server', name: 'Room 1' },
              { roomId: '!room2:server', name: 'Room 2' },
            ]),
          },
        },
        {
          provide: MatrixMessageService,
          useValue: {
            sendMessage: jest.fn().mockResolvedValue('event-123'),
            getRoomMessages: jest.fn().mockResolvedValue({
              messages: [],
              end: 'end-token',
            }),
          },
        },
        {
          provide: MatrixCoreService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              baseUrl: 'https://matrix.openmeet.net',
              serverName: 'openmeet.net',
              adminUserId: '@admin:openmeet.net',
            }),
            getSdk: jest.fn().mockReturnValue({
              createClient: jest.fn().mockReturnValue(mockMatrixClient),
            }),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockUser),
          },
        },
        {
          provide: ChatRoomService,
          useValue: {
            findChatRoomsByMatrixUserId: jest
              .fn()
              .mockResolvedValue([
                { matrixRoomId: '!room1:server' },
                { matrixRoomId: '!room2:server' },
              ]),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn().mockReturnValue(mockJwtPayload),
            verifyAsync: jest.fn().mockResolvedValue(mockJwtPayload),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'auth.secret') return 'test-secret';
              if (key === 'auth.jwt.expiresIn') return '1h';
              return null;
            }),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            resolve: jest.fn().mockResolvedValue({
              findById: jest.fn().mockResolvedValue(mockUser),
            })
          }
        }
      ],
    }).compile();

    gateway = module.get<MatrixGateway>(MatrixGateway);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixMessageService = module.get<MatrixMessageService>(MatrixMessageService);

    // Create helper instances
    roomMembershipManager = new RoomMembershipManager('Test');
    broadcastManager = new BroadcastManager('Test');
    typingManager = new TypingManager('Test');

    // Mock helper methods
    jest.spyOn(broadcastManager, 'shouldSkipDuplicateBroadcast').mockReturnValue(false);
    jest.spyOn(broadcastManager, 'generateBroadcastId').mockReturnValue('mock-broadcast-id');
    jest.spyOn(typingManager, 'shouldSendTypingNotification').mockReturnValue(true);
    
    // Setting private properties for testing
    (gateway as any).server = mockServer;
    (gateway as any).logger = new Logger('MatrixGateway');
    (gateway as any).roomMembershipManager = roomMembershipManager;
    (gateway as any).broadcastManager = broadcastManager;
    (gateway as any).typingManager = typingManager;
    
    // Add spy for helper method
    const mockUserService = {
      findById: jest.fn().mockResolvedValue(mockUser),
    } as unknown as UserService;
    jest.spyOn(MatrixGatewayHelper, 'createUserServiceForRequest').mockResolvedValue(mockUserService);
    
    jest.spyOn(MatrixGatewayHelper, 'resolveUserById').mockResolvedValue(mockUser);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should emit connection_confirmed event when client connects', async () => {
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Verify the connection_confirmed event was emitted
      expect(mockClient.emit).toHaveBeenCalledWith(
        'matrix-event',
        expect.objectContaining({
          type: 'connection_confirmed',
        }),
      );
    });

    it('should get Matrix client for user if they have credentials', async () => {
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Check that getClientForUser was called, which is the updated flow
      expect(matrixUserService.getClientForUser).toHaveBeenCalledWith(
        mockUser.slug,
        expect.anything(),
        'default',
      );
    });

    it('should set matrixClientInitialized to true when successful', async () => {
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Check the client data was updated
      expect(mockClient.data.matrixClientInitialized).toBeTruthy();
    });
  });

  describe('handleDisconnect', () => {
    it('should release Matrix client when user disconnects', async () => {
      // Setup connection first
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Register the socket in roomMembershipManager
      roomMembershipManager.registerSocket(
        mockClient.id,
        mockUser.id,
        mockUser.matrixUserId
      );

      // Then disconnect
      await gateway.handleDisconnect(mockClient as unknown as Socket);

      // Check if releaseClientForUser was called with the user slug
      expect(matrixUserService.releaseClientForUser).toHaveBeenCalledWith(
        mockUser.slug,
      );
    });
  });

  describe('joinRoom', () => {
    it('should join client to a room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Reset join mock to test the explicit join
      (mockClient.join as jest.Mock).mockClear();

      // Using the correct method name based on your gateway implementation
      const result = await gateway.joinRoom(mockClient as unknown as Socket, {
        roomId: '!newroom:server',
      });

      expect(mockClient.join).toHaveBeenCalledWith('!newroom:server');
      expect(result).toEqual({ success: true });
    });
  });

  describe('leaveRoom', () => {
    it('should remove client from a room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);
      mockClient.rooms.add('!testroom:server');

      // Use the correct method name based on your gateway implementation
      const result = await gateway.leaveRoom(mockClient as unknown as Socket, {
        roomId: '!testroom:server',
      });

      expect(mockClient.leave).toHaveBeenCalledWith('!testroom:server');
      expect(result).toEqual({ success: true });
    });
  });

  describe('typing', () => {
    it('should send typing notification via Matrix', async () => {
      // Reset mock to check call parameters specifically for this test
      (matrixUserService.getClientForUser as jest.Mock).mockClear();

      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Make getClientForUser return our mock client
      (matrixUserService.getClientForUser as jest.Mock).mockResolvedValueOnce(
        mockMatrixClient,
      );

      // Reset our mock to verify call
      mockMatrixClient.sendTyping.mockClear();

      // Use the handleTyping method directly to match the implementation
      const result = await gateway.handleTyping(mockClient as unknown as Socket, {
        roomId: '!room1:server',
        isTyping: true,
        tenantId: 'default',
      });

      // Check that getClientForUser was called with the user slug and tenant ID
      expect(matrixUserService.getClientForUser).toHaveBeenCalledWith(
        mockUser.slug,
        expect.anything(),
        'default',
      );

      // Verify the sendTyping method was called on the client
      expect(mockMatrixClient.sendTyping).toHaveBeenCalledWith(
        '!room1:server',
        true,
        30000,
      );
      
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleMessage', () => {
    it('should send message using MatrixMessageService', async () => {
      // Reset mocks to check call parameters
      (matrixUserService.getClientForUser as jest.Mock).mockClear();
      (matrixMessageService.sendMessage as jest.Mock).mockClear();

      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Call the message handler
      const result = await gateway.handleMessage(mockClient as unknown as Socket, {
        roomId: '!room1:server',
        message: 'Hello world!',
        tenantId: 'default',
      });

      // Check that message was sent with correct parameters
      expect(matrixMessageService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: '!room1:server',
          userId: mockUser.matrixUserId,
          accessToken: mockUser.matrixAccessToken,
          deviceId: mockUser.matrixDeviceId,
          content: 'Hello world!',
        }),
      );
      
      expect(result).toEqual({ success: true, id: 'event-123' });
    });
  });

  describe('broadcastRoomEvent', () => {
    it('should broadcast Matrix events to the appropriate room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Create a mock Matrix event
      const mockMatrixEvent = {
        type: 'm.room.message',
        room_id: '!room1:server',
        sender: '@another:server',
        content: {
          msgtype: 'm.text',
          body: 'Hello, world!',
        },
        origin_server_ts: Date.now(),
      };

      // Directly call the broadcast method
      gateway.broadcastRoomEvent('!room1:server', mockMatrixEvent);

      // Should have broadcasted to the room
      expect(mockServer.to).toHaveBeenCalledWith('!room1:server');
      
      // Check that emit was called (without checking specific contents since the 
      // broadcastId and timestamps will be different)
      expect(mockEmitHandler).toHaveBeenCalledWith(
        'matrix-event',
        expect.anything()
      );
    });
  });
});