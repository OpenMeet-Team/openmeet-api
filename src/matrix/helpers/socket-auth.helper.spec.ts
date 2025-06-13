import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { SocketAuthHandler } from './socket-auth.helper';
import { UserService } from '../../user/user.service';
import { WsException } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { RoomMembershipManager } from './room-membership.helper';

describe('SocketAuthHandler', () => {
  let socketAuthHandler: SocketAuthHandler;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let mockSocket: Partial<Socket>;
  let mockNext: jest.Mock;

  beforeEach(async () => {
    mockSocket = {
      id: 'test-socket-id',
      data: {},
      handshake: {
        auth: {},
        headers: {},
      } as any,
    };
    mockNext = jest.fn();

    const mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SocketAuthHandler,
          useFactory: (
            userService,
            jwtService,
            configService,
            moduleRef,
            roomMembershipManager,
          ) => {
            return new SocketAuthHandler(
              mockLogger as any,
              jwtService,
              configService,
              moduleRef,
              roomMembershipManager,
            );
          },
          inject: [
            UserService,
            JwtService,
            ConfigService,
            ModuleRef,
            RoomMembershipManager,
          ],
        },
        {
          provide: UserService,
          useValue: {
            findByIdWithTenant: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: RoomMembershipManager,
          useValue: {
            syncRoomMemberships: jest.fn(),
          },
        },
      ],
    }).compile();

    socketAuthHandler = module.get<SocketAuthHandler>(SocketAuthHandler);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    const mockJwtPayload = { sub: 'user-123', tenantId: 'tenant-123' };
    const mockUserWithMatrixCreds = {
      id: 'user-123',
      name: 'Test User',
      tenantId: 'tenant-123',
      matrixUserId: '@test:matrix.example.com',
      matrixAccessToken: 'syt_test_access_token',
      matrixDeviceId: 'DEVICETEST123',
    };
    const mockUserWithoutMatrixCreds = {
      id: 'user-123',
      name: 'Test User',
      tenantId: 'tenant-123',
      matrixUserId: null,
      matrixAccessToken: null,
      matrixDeviceId: null,
    };

    it('should authenticate user with valid token and set hasMatrixCredentials to true', async () => {
      // Arrange
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(mockUserWithMatrixCreds);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(userService.findByIdWithTenant).toHaveBeenCalledWith(
        'user-123',
        'tenant-123',
      );
      expect(mockSocket.data).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-123',
        hasMatrixCredentials: true,
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should authenticate user with valid token but set hasMatrixCredentials to false when missing credentials', async () => {
      // Arrange
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(
        mockUserWithoutMatrixCreds,
      );

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockSocket.data).toEqual({
        userId: 'user-123',
        tenantId: 'tenant-123',
        hasMatrixCredentials: false,
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should set hasMatrixCredentials to false when user has partial Matrix credentials', async () => {
      // Arrange - user with only matrixUserId but missing token and device
      const partialMatrixUser = {
        ...mockUserWithoutMatrixCreds,
        matrixUserId: '@test:matrix.example.com',
      };
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(partialMatrixUser);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockSocket.data.hasMatrixCredentials).toBe(false);
    });

    it('should fail authentication when no token is provided', async () => {
      // Arrange
      mockSocket.handshake.auth.token = undefined;

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(WsException));
      const error = mockNext.mock.calls[0][0];
      expect(error.message).toContain('Authentication token required');
    });

    it('should fail authentication when token verification fails', async () => {
      // Arrange
      mockSocket.handshake.auth.token = 'invalid-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(WsException));
      const error = mockNext.mock.calls[0][0];
      expect(error.message).toContain('Invalid authentication token');
    });

    it('should fail authentication when user is not found', async () => {
      // Arrange
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(null);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalledWith(expect.any(WsException));
      const error = mockNext.mock.calls[0][0];
      expect(error.message).toContain('User not found');
    });

    it('should handle Bearer token format', async () => {
      // Arrange
      mockSocket.handshake.auth.token = 'Bearer valid-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(mockUserWithMatrixCreds);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(mockSocket.data.hasMatrixCredentials).toBe(true);
    });

    it('should check authorization header when auth.token is not present', async () => {
      // Arrange
      mockSocket.handshake.auth.token = undefined;
      mockSocket.handshake.headers['authorization'] = 'Bearer header-token';
      jwtService.verify.mockReturnValue(mockJwtPayload);
      userService.findByIdWithTenant.mockResolvedValue(mockUserWithMatrixCreds);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(jwtService.verify).toHaveBeenCalledWith('header-token');
      expect(mockSocket.data.hasMatrixCredentials).toBe(true);
    });

    it('should handle empty string Matrix credentials as missing', async () => {
      // Arrange
      const userWithEmptyStrings = {
        id: 'user-123',
        name: 'Test User',
        tenantId: 'tenant-123',
        matrixUserId: '',
        matrixAccessToken: '',
        matrixDeviceId: '',
      };
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        tenantId: 'tenant-123',
      });
      userService.findByIdWithTenant.mockResolvedValue(userWithEmptyStrings);

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockSocket.data.hasMatrixCredentials).toBe(false);
    });

    it('should preserve existing socket data while adding auth data', async () => {
      // Arrange
      mockSocket.data = { existingData: 'should-remain' };
      mockSocket.handshake.auth.token = 'valid-token';
      jwtService.verify.mockReturnValue({
        sub: 'user-123',
        tenantId: 'tenant-123',
      });
      userService.findByIdWithTenant.mockResolvedValue({
        id: 'user-123',
        name: 'Test User',
        tenantId: 'tenant-123',
        matrixUserId: null,
        matrixAccessToken: null,
        matrixDeviceId: null,
      });

      // Act
      await socketAuthHandler.authenticate(mockSocket as Socket, mockNext);

      // Assert
      expect(mockSocket.data).toEqual({
        existingData: 'should-remain',
        userId: 'user-123',
        tenantId: 'tenant-123',
        hasMatrixCredentials: false,
      });
    });
  });
});
