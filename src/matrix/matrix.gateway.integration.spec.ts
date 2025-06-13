import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { JwtService } from '@nestjs/jwt';
import { MatrixGateway } from './matrix.gateway';
import { UserService } from '../user/user.service';
import { MatrixService } from './matrix.service';
import { ChatRoomService } from '../chat-room/chat-room.service';
import { NotificationService } from '../notifications/notification.service';
import { DiscussionService } from '../discussion/discussion.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserChatRoomEntity } from '../entities/user-chat-room.entity';

describe('MatrixGateway Integration Tests', () => {
  let app: INestApplication;
  let clientSocket: ClientSocket;
  let userService: jest.Mocked<UserService>;
  let jwtService: JwtService;
  let matrixService: jest.Mocked<MatrixService>;

  const TEST_PORT = 3033;
  const TEST_USER_ID = 'test-user-123';
  const TEST_TENANT_ID = 'test-tenant-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixGateway,
        {
          provide: UserService,
          useValue: {
            findByIdWithTenant: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: 'test-secret',
          }),
        },
        {
          provide: MatrixService,
          useValue: {
            getOrCreateMatrixUser: jest.fn(),
            joinRoom: jest.fn(),
            leaveRoom: jest.fn(),
          },
        },
        {
          provide: ChatRoomService,
          useValue: {
            getUserChatRooms: jest.fn(),
            findByMatrixRoomId: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            notifyMatrixMessage: jest.fn(),
          },
        },
        {
          provide: DiscussionService,
          useValue: {
            getDiscussion: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserChatRoomEntity),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));

    userService = moduleFixture.get(UserService);
    jwtService = moduleFixture.get(JwtService);
    matrixService = moduleFixture.get(MatrixService);

    await app.listen(TEST_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('WebSocket Authentication Flow', () => {
    it('should successfully connect with valid token and Matrix credentials', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'valid-matrix-token',
        matrixDeviceId: 'DEVICE123',
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect', () => {
        expect(userService.findByIdWithTenant).toHaveBeenCalledWith(
          TEST_USER_ID,
          TEST_TENANT_ID,
        );
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(new Error(`Unexpected connection error: ${error.message}`));
      });
    });

    it('should connect but warn when user has no Matrix credentials', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: null,
        matrixAccessToken: null,
        matrixDeviceId: null,
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect', () => {
        // Should still connect in development mode
        expect(userService.findByIdWithTenant).toHaveBeenCalledWith(
          TEST_USER_ID,
          TEST_TENANT_ID,
        );
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token: 'invalid-token' },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid authentication token');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
    });

    it('should reject connection when user not found', (done) => {
      // Arrange
      userService.findByIdWithTenant.mockResolvedValue(null);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('User not found');
        done();
      });
    });

    it('should handle Bearer token format', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'valid-matrix-token',
        matrixDeviceId: 'DEVICE123',
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect', () => {
        done();
      });
    });

    it('should use authorization header when auth.token not provided', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'valid-matrix-token',
        matrixDeviceId: 'DEVICE123',
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        extraHeaders: {
          authorization: `Bearer ${token}`,
        },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect', () => {
        done();
      });
    });
  });

  describe('Matrix Operations with Authentication', () => {
    let token: string;

    beforeEach(() => {
      token = jwtService.sign({ sub: TEST_USER_ID, tenantId: TEST_TENANT_ID });
    });

    it('should handle join-room event when user has Matrix credentials', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: 'valid-matrix-token',
        matrixDeviceId: 'DEVICE123',
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      matrixService.joinRoom.mockResolvedValue(undefined);

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-room', { roomId: 'test-room-id' });
      });

      // Assert
      clientSocket.on('joined-room', (data) => {
        expect(data.roomId).toBe('test-room-id');
        expect(matrixService.joinRoom).toHaveBeenCalled();
        done();
      });
    });

    it('should fail join-room event when user lacks Matrix credentials', (done) => {
      // Arrange
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: null,
        matrixAccessToken: null,
        matrixDeviceId: null,
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-room', { roomId: 'test-room-id' });
      });

      // Assert
      clientSocket.on('error', (error) => {
        expect(error.message).toContain('Matrix credentials required');
        done();
      });
    });
  });

  describe('Database and Service Integration', () => {
    it('should handle database errors gracefully during authentication', (done) => {
      // Arrange
      userService.findByIdWithTenant.mockRejectedValue(
        new Error('Database connection error'),
      );
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      // Assert
      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        done();
      });
    });

    it('should properly check all Matrix credential fields', (done) => {
      // Arrange - user with partial credentials
      const mockUser = {
        id: TEST_USER_ID,
        name: 'Test User',
        tenantId: TEST_TENANT_ID,
        matrixUserId: '@test:matrix.example.com',
        matrixAccessToken: null, // Missing token
        matrixDeviceId: 'DEVICE123',
      };

      userService.findByIdWithTenant.mockResolvedValue(mockUser);
      const token = jwtService.sign({
        sub: TEST_USER_ID,
        tenantId: TEST_TENANT_ID,
      });

      // Act
      clientSocket = io(`http://localhost:${TEST_PORT}/matrix`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join-room', { roomId: 'test-room-id' });
      });

      // Assert
      clientSocket.on('error', (error) => {
        expect(error.message).toContain('Matrix credentials required');
        done();
      });
    });
  });
});
