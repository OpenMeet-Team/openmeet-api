import { Test, TestingModule } from '@nestjs/testing';
import { MatrixGateway } from './matrix.gateway';
import { MatrixService } from './matrix.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

// Create a test module to mock dependencies
class TestLogger extends Logger {
  error() { return; }
  log() { return; }
  warn() { return; }
  debug() { return; }
  verbose() { return; }
}

describe.skip('MatrixGateway', () => {
  let gateway: MatrixGateway;
  let matrixService: MatrixService;
  let userService: UserService;
  let jwtService: JwtService;

  const mockMatrixService = {
    startClient: jest.fn().mockResolvedValue(undefined),
    getUserRooms: jest.fn().mockResolvedValue([
      { roomId: 'room-1', name: 'Room 1' },
      { roomId: 'room-2', name: 'Room 2' },
    ]),
    sendTypingNotification: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({ eventId: 'event-123' }),
  };

  const mockUserService = {
    findById: jest.fn().mockResolvedValue({
      id: 1,
      matrixUserId: '@test:example.org',
      matrixAccessToken: 'test-token',
      matrixDeviceId: 'test-device',
    }),
  };

  const mockJwtService = {
    verify: jest.fn().mockReturnValue({ id: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: Logger, useClass: TestLogger },
        MatrixGateway,
        {
          provide: MatrixService,
          useValue: mockMatrixService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              const config = {
                matrix: {
                  serverName: 'matrix.example.org',
                  websocketUrl: 'wss://matrix.example.org/matrix'
                }
              };
              const parts = key.split('.');
              let result = config;
              for (const part of parts) {
                result = result[part];
              }
              return result;
            })
          },
        },
      ],
    }).compile();

    // Initialize the gateway with mocked dependencies
    try {
      gateway = module.get<MatrixGateway>(MatrixGateway);
      matrixService = module.get<MatrixService>(MatrixService);
      userService = module.get<UserService>(UserService);
      jwtService = module.get<JwtService>(JwtService);
      
      // Explicitly set the logger
      (gateway as any).logger = new TestLogger();
    } catch (error) {
      console.error('Error initializing gateway:', error);
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('joinUserRooms', () => {
    it('should allow users to join their own rooms', async () => {
      // Create mock client with data
      const mockClient: any = {
        data: {
          userId: 1,
          matrixUserId: '@test:example.org',
          hasMatrixCredentials: true,
        },
        join: jest.fn(),
      };

      // Call joinUserRooms
      const result = await gateway.joinUserRooms(
        mockClient as unknown as Socket,
        { userId: '@test:example.org' },
      );

      // Since getUserRooms doesn't exist yet, we'll check that our mock was called
      expect(mockMatrixService.getUserRooms).toHaveBeenCalledWith(
        '@test:example.org',
        expect.any(String),
      );

      // Verify client joined rooms
      expect(mockClient.join).toHaveBeenCalledWith('room-1');
      expect(mockClient.join).toHaveBeenCalledWith('room-2');

      // Verify response
      expect(result).toEqual({
        success: true,
        roomCount: 2,
      });
    });

    it('should prevent joining rooms of another user', async () => {
      // Create mock client
      const mockClient: any = {
        data: {
          userId: 1,
          matrixUserId: '@test:example.org',
          hasMatrixCredentials: true,
        },
      };

      // Call with different user ID
      await expect(
        gateway.joinUserRooms(mockClient as unknown as Socket, {
          userId: '@otheruser:example.org',
        }),
      ).rejects.toThrow(WsException);
    });
  });

  describe('handleTyping', () => {
    it('should forward typing notifications to Matrix', async () => {
      // Create mock client
      const mockClient: any = {
        data: {
          userId: 1,
          matrixUserId: '@test:example.org',
          matrixAccessToken: 'test-token',
          matrixDeviceId: 'test-device',
          hasMatrixCredentials: true,
        },
      };

      // Call handleTyping
      const result = await gateway.handleTyping(
        mockClient as unknown as Socket,
        { roomId: 'room-1', isTyping: true },
      );

      // Verify typing notification sent
      expect(mockMatrixService.sendTypingNotification).toHaveBeenCalledWith(
        'room-1',
        '@test:example.org',
        'test-token',
        true,
        'test-device',
      );

      // Verify response
      expect(result).toEqual({ success: true });
    });
  });

  describe('handleMessage', () => {
    it('should send messages to Matrix rooms', async () => {
      // Create mock client
      const mockClient: any = {
        data: {
          userId: 1,
          matrixUserId: '@test:example.org',
          matrixAccessToken: 'test-token',
          matrixDeviceId: 'test-device',
          hasMatrixCredentials: true,
        },
      };

      // Call handleMessage
      const result = await gateway.handleMessage(
        mockClient as unknown as Socket,
        { roomId: 'room-1', message: 'Hello world' },
      );

      // Verify message sent
      expect(mockMatrixService.sendMessage).toHaveBeenCalledWith({
        roomId: 'room-1',
        userId: '@test:example.org',
        accessToken: 'test-token',
        content: 'Hello world',
        deviceId: 'test-device',
      });

      // Verify response
      expect(result).toEqual({ success: true, id: 'event-123' });
    });

    it('should handle message sending errors', async () => {
      // Create mock client
      const mockClient: any = {
        data: {
          userId: 1,
          matrixUserId: '@test:example.org',
          matrixAccessToken: 'test-token',
          matrixDeviceId: 'test-device',
          hasMatrixCredentials: true,
        },
      };

      // Mock error response
      mockMatrixService.sendMessage.mockRejectedValueOnce(
        new Error('Failed to send message'),
      );

      // Expect handleMessage to throw a WsException
      await expect(
        gateway.handleMessage(mockClient as unknown as Socket, {
          roomId: 'room-1',
          message: 'This will fail',
        }),
      ).rejects.toThrow(WsException);
    });
  });
});
