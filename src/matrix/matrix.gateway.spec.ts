import { Test, TestingModule } from '@nestjs/testing';
import { MatrixGateway } from './matrix.gateway';
import { MatrixService } from './matrix.service';
import { UserService } from '../user/user.service';
import { ChatRoomService } from '../chat/rooms/chat-room.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Socket, Server } from 'socket.io';
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
  let matrixService: MatrixService;
  let userService: UserService;
  let chatRoomService: ChatRoomService;
  let jwtService: JwtService;
  let mockClient: MockSocket;
  let mockServer: Partial<Server>;
  
  // Add missing matrixService method implementations
  const mockMatrixClient = {
    sendTyping: jest.fn().mockResolvedValue(true),
    sendTextMessage: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
  };

  const mockUser = {
    id: 1,
    ulid: 'USER123',
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
      tenantId: 'default'
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
          provide: MatrixService,
          useValue: {
            startClient: jest.fn().mockResolvedValue(true),
            stopClient: jest.fn().mockResolvedValue(true),
            releaseClientForUser: jest.fn().mockResolvedValue(true),
            sendTyping: jest.fn().mockResolvedValue(true), 
            getRoomMessages: jest.fn().mockResolvedValue({
              messages: [],
              end: 'end-token',
            }),
            getClientForUser: jest.fn().mockResolvedValue({
              sendTyping: jest.fn().mockResolvedValue(true),
              sendTextMessage: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
            }),
            joinRoom: jest.fn().mockResolvedValue(true),
            getUserRoomsWithClient: jest.fn().mockResolvedValue([
              { roomId: '!room1:server', name: 'Room 1' },
              { roomId: '!room2:server', name: 'Room 2' },
            ]),
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
            findChatRoomsByMatrixUserId: jest.fn().mockResolvedValue([
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
    matrixService = module.get<MatrixService>(MatrixService);
    userService = module.get<UserService>(UserService);
    chatRoomService = module.get<ChatRoomService>(ChatRoomService);
    jwtService = module.get<JwtService>(JwtService);

    // Setting private properties for testing
    (gateway as any).server = mockServer as Server;
    (gateway as any).logger = new Logger('MatrixGateway');
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should emit connection_confirmed event when client connects', async () => {
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Verify the connection_confirmed event was emitted
      expect(mockClient.emit).toHaveBeenCalledWith('matrix-event', expect.objectContaining({
        type: 'connection_confirmed',
      }));
    });

    it('should get Matrix client for user if they have credentials', async () => {
      await gateway.handleConnection(mockClient as unknown as Socket);

      // Check that getClientForUser was called, which is the updated flow
      expect(matrixService.getClientForUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.anything(),
        'default'
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

      // Check if releaseClientForUser was called instead of stopClient
      expect(matrixService.releaseClientForUser).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('joinRoom', () => {
    it('should join client to a room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);
      
      // Reset join mock to test the explicit join
      (mockClient.join as jest.Mock).mockClear();
      
      // Using the correct method name based on your gateway implementation
      await gateway.joinRoom(mockClient as unknown as Socket, { roomId: '!newroom:server' });

      expect(mockClient.join).toHaveBeenCalledWith('!newroom:server');
    });
  });

  describe('leaveRoom', () => {
    it('should remove client from a room', async () => {
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);
      mockClient.rooms.add('!testroom:server');
      
      // Use the correct method name based on your gateway implementation
      await gateway.leaveRoom(mockClient as unknown as Socket, { roomId: '!testroom:server' });

      expect(mockClient.leave).toHaveBeenCalledWith('!testroom:server');
    });
  });

  describe('typing', () => {
    it('should send typing notification via Matrix', async () => {
      // Reset mock to check call parameters specifically for this test
      (matrixService.getClientForUser as jest.Mock).mockClear();
      
      // Setup connection
      await gateway.handleConnection(mockClient as unknown as Socket);
      
      // Make getClientForUser return our mock client
      (matrixService.getClientForUser as jest.Mock).mockResolvedValueOnce(mockMatrixClient);
      
      // Reset our mock to verify call
      mockMatrixClient.sendTyping.mockClear();
      
      // Use the handleTyping method directly to match the implementation
      await gateway.handleTyping(mockClient as unknown as Socket, { 
        roomId: '!room1:server',
        isTyping: true,
        tenantId: 'default'
      });

      // Check that getClientForUser was called with the tenant ID
      expect(matrixService.getClientForUser).toHaveBeenCalledWith(
        mockUser.id,
        null,
        'default'
      );
      
      // Verify the sendTyping method was called on the client
      expect(mockMatrixClient.sendTyping).toHaveBeenCalledWith('!room1:server', true, 30000);
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
      expect(mockEmitHandler).toHaveBeenCalledWith('matrix-event', expect.objectContaining({
        type: 'm.room.message',
        room_id: '!room1:server',
        _broadcastId: expect.any(String), // The method adds a broadcast ID
      }));
      
      // For message events, it should also emit a matrix-message event
      expect(mockEmitHandler).toHaveBeenCalledWith('matrix-message', expect.objectContaining({
        roomId: '!room1:server',
        sender: '@another:server',
      }));
    });
  });
});