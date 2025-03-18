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
// import { Server } from 'socket.io'; - using partial type instead
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

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
  let matrixRoomService: MatrixRoomService;
  let matrixMessageService: MatrixMessageService;
  let _matrixCoreService: MatrixCoreService;
  let _userService: UserService;
  let _chatRoomService: ChatRoomService;
  let _jwtService: JwtService;
  let mockClient: MockSocket;
  let mockServer: Partial<any>; // Updated to any type to avoid Server type error

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
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'auth.jwt.secret') return 'test-secret';
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
      ],
    }).compile();

    gateway = module.get<MatrixGateway>(MatrixGateway);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixRoomService = module.get<MatrixRoomService>(MatrixRoomService);
    matrixMessageService =
      module.get<MatrixMessageService>(MatrixMessageService);
    _matrixCoreService = module.get<MatrixCoreService>(MatrixCoreService);
    _userService = module.get<UserService>(UserService);
    _chatRoomService = module.get<ChatRoomService>(ChatRoomService);
    _jwtService = module.get<JwtService>(JwtService);

    // Setting private properties for testing
    (gateway as any).server = mockServer;
    (gateway as any).logger = new Logger('MatrixGateway');
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

      // Manually set the mapping in socketUsers
      (gateway as any).socketUsers.set(mockClient.id, {
        userId: mockUser.id,
        matrixUserId: mockUser.matrixUserId,
      });

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
      await gateway.joinRoom(mockClient as unknown as Socket, {
        roomId: '!newroom:server',
      });

      expect(mockClient.join).toHaveBeenCalledWith('!newroom:server');
    });
  });

  describe('leaveRoom', () => {
    it('should remove client from a room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);
      mockClient.rooms.add('!testroom:server');

      // Use the correct method name based on your gateway implementation
      await gateway.leaveRoom(mockClient as unknown as Socket, {
        roomId: '!testroom:server',
      });

      expect(mockClient.leave).toHaveBeenCalledWith('!testroom:server');
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
      await gateway.handleTyping(mockClient as unknown as Socket, {
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
      await gateway.handleMessage(mockClient as unknown as Socket, {
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
      expect(mockEmitHandler).toHaveBeenCalledWith(
        'matrix-event',
        expect.objectContaining({
          type: 'm.room.message',
          room_id: '!room1:server',
          _broadcastId: expect.any(String), // The method adds a broadcast ID
        }),
      );

      // For message events, it should also emit a matrix-message event
      expect(mockEmitHandler).toHaveBeenCalledWith(
        'matrix-message',
        expect.objectContaining({
          roomId: '!room1:server',
          sender: '@another:server',
        }),
      );
    });
  });
});
