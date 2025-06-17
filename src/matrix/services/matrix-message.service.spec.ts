import { Test, TestingModule } from '@nestjs/testing';
import { MatrixMessageService } from './matrix-message.service';
import { MatrixCoreService } from './matrix-core.service';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';
import axios from 'axios';
import { SendMessageOptions } from '../types/matrix.types';
import { MatrixUserService } from './matrix-user.service';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixMessageService', () => {
  let service: MatrixMessageService;
  let matrixCoreService: MatrixCoreService;
  let matrixUserService: MatrixUserService;

  // Mock Matrix client
  const mockMatrixClient = {
    sendEvent: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
    sendTyping: jest.fn().mockResolvedValue({}),
    getAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  };

  // Mock client with context
  const mockClientWithContext = {
    client: mockMatrixClient,
    userId: '@admin:matrix.org',
  };

  // Mock SDK with a proper jest mock function
  const mockSdkCreateClient = jest.fn().mockReturnValue(mockMatrixClient);
  const mockSdk = {
    createClient: mockSdkCreateClient,
  };

  afterAll(() => {
    // Clean up any resources that might be kept open in tests
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock axios responses
    mockedAxios.get.mockResolvedValue({
      data: {
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'event-123',
            room_id: 'room-123',
            sender: '@user:example.org',
            content: { body: 'Hello world', msgtype: 'm.text' },
            origin_server_ts: 1626200000000,
          },
        ],
        end: 'end-token',
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixMessageService,
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
            getSdk: jest.fn().mockReturnValue(mockSdk),
            getAdminClient: jest.fn().mockReturnValue(mockMatrixClient),
            acquireClient: jest.fn().mockResolvedValue(mockClientWithContext),
            releaseClient: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MatrixUserService,
          useValue: {
            getClientForUser: jest
              .fn()
              .mockResolvedValue(mockClientWithContext),
            verifyAccessToken: jest.fn().mockResolvedValue(true),
            generateNewAccessToken: jest
              .fn()
              .mockResolvedValue('new-access-token'),
            clearUserClients: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixMessageService>(MatrixMessageService);
    matrixCoreService = module.get<MatrixCoreService>(MatrixCoreService);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send a message to a room using admin client', async () => {
      const options: SendMessageOptions = {
        roomId: 'room-123',
        body: 'Test message',
        userId: '@admin:example.org',
        accessToken: 'admin-token',
        content: 'Test message',
      };

      const result = await service.sendMessage(options);

      // Because the test included userId and accessToken, it should use those credentials
      // instead of the admin client (no client acquire/release)

      // Verify sendEvent was called with correct parameters
      expect(mockMatrixClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.text',
          body: 'Test message',
        }),
        '',
      );

      // Verify the result is the event ID
      expect(result).toBe('event-123');
    });

    it('should send a message with content object', async () => {
      const messageContent = {
        msgtype: 'm.text',
        body: 'Test message with content object',
      };

      const options: SendMessageOptions = {
        roomId: 'room-123',
        userId: '@admin:example.org',
        accessToken: 'admin-token',
        content: JSON.stringify(messageContent),
      };

      const result = await service.sendMessage(options);

      // The implementation treats JSON stringified content as a string body
      expect(mockMatrixClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        {
          msgtype: 'm.text',
          body: JSON.stringify(messageContent),
        },
        '',
      );
      expect(result).toBe('event-123');
    });

    it('should send a message with content string', async () => {
      const options: SendMessageOptions = {
        roomId: 'room-123',
        content: 'Simple message',
        messageType: 'm.text',
        userId: '@admin:example.org',
        accessToken: 'admin-token',
      };

      const result = await service.sendMessage(options);

      expect(mockMatrixClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.text',
          body: 'Simple message',
        }),
        '',
      );
      expect(result).toBe('event-123');
    });

    it('should send a message as a specific user', async () => {
      const options: SendMessageOptions = {
        roomId: 'room-123',
        body: 'User message',
        userId: '@user:example.org',
        accessToken: 'user-token',
        deviceId: 'user-device',
        content: 'User message',
      };

      // Create a new mock client for the user
      const mockUserClient = { ...mockMatrixClient };
      mockSdkCreateClient.mockReturnValueOnce(mockUserClient);

      const result = await service.sendMessage(options);

      // Verify SDK client was created with user credentials
      expect(mockSdkCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://matrix.example.org',
          userId: '@user:example.org',
          accessToken: 'user-token',
          deviceId: 'user-device',
          useAuthorizationHeader: true,
        }),
      );

      // Verify sendEvent was called on user client
      expect(mockUserClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.text',
          body: 'User message',
        }),
        '',
      );

      expect(result).toBe('event-123');
    });

    it('should handle errors when sending messages', async () => {
      // Create a new test client that will fail
      const mockFailingClient = {
        ...mockMatrixClient,
        sendEvent: jest
          .fn()
          .mockRejectedValueOnce(new Error('Failed to send message')),
      };
      mockSdkCreateClient.mockReturnValueOnce(mockFailingClient);

      const options: SendMessageOptions = {
        roomId: 'room-123',
        body: 'Test message',
        userId: '@admin:example.org',
        accessToken: 'admin-token',
        content: 'Test message',
      };

      await expect(service.sendMessage(options)).rejects.toThrow(
        'Failed to send message to Matrix room: Failed to send message',
      );
    });

    it('should handle token refresh for cancelled attendees with correct username extraction', async () => {
      // Mock invalid token scenario - verifyAccessToken returns false
      (matrixUserService.verifyAccessToken as jest.Mock).mockResolvedValueOnce(
        false,
      );

      // Mock successful token generation
      (
        matrixUserService.generateNewAccessToken as jest.Mock
      ).mockResolvedValueOnce('refreshed-token-123');

      // Mock successful client cache clearing
      (matrixUserService.clearUserClients as jest.Mock).mockResolvedValueOnce(
        undefined,
      );

      const options: SendMessageOptions = {
        roomId: 'room-123',
        content: 'test message from cancelled attendee',
        userId: '@testuser_tenant123:matrix.openmeet.net', // Username with tenant ID suffix
        accessToken: 'invalid-token',
        tenantId: 'tenant123',
      };

      // Create a new mock client for the refreshed credentials
      const mockRefreshedClient = {
        ...mockMatrixClient,
        startClient: jest.fn().mockResolvedValue(undefined),
        stopClient: jest.fn().mockResolvedValue(undefined),
      };
      mockSdkCreateClient.mockReturnValueOnce(mockRefreshedClient);

      const result = await service.sendMessage(options);

      // Verify token verification was called
      expect(matrixUserService.verifyAccessToken).toHaveBeenCalledWith(
        '@testuser_tenant123:matrix.openmeet.net',
        'invalid-token',
      );

      // Verify new token generation was called
      expect(matrixUserService.generateNewAccessToken).toHaveBeenCalledWith(
        '@testuser_tenant123:matrix.openmeet.net',
      );

      // Verify username extraction handled tenant ID suffix correctly - should extract 'testuser' from 'testuser_tenant123'
      expect(matrixUserService.clearUserClients).toHaveBeenCalledWith(
        'testuser', // Should be extracted correctly from '@testuser_tenant123:matrix.openmeet.net'
        'tenant123',
      );

      // Verify client was created with the refreshed token
      expect(mockSdkCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '@testuser_tenant123:matrix.openmeet.net',
          accessToken: 'refreshed-token-123', // Should use the new token
        }),
      );

      // Verify message was sent successfully
      expect(mockRefreshedClient.sendEvent).toHaveBeenCalled();
      expect(result).toBe('event-123');
    });

    it('should handle username extraction without tenant ID suffix', async () => {
      // Test case where username doesn't have tenant ID suffix
      (matrixUserService.verifyAccessToken as jest.Mock).mockResolvedValueOnce(
        false,
      );
      (
        matrixUserService.generateNewAccessToken as jest.Mock
      ).mockResolvedValueOnce('new-token');
      (matrixUserService.clearUserClients as jest.Mock).mockResolvedValueOnce(
        undefined,
      );

      const options: SendMessageOptions = {
        roomId: 'room-123',
        content: 'test message',
        userId: '@regularuser:matrix.openmeet.net', // Username without tenant suffix
        accessToken: 'invalid-token',
        tenantId: 'tenant123',
      };

      const mockClient = {
        ...mockMatrixClient,
        startClient: jest.fn(),
        stopClient: jest.fn(),
      };
      mockSdkCreateClient.mockReturnValueOnce(mockClient);

      await service.sendMessage(options);

      // Should extract 'regularuser' and not try to remove tenant suffix
      expect(matrixUserService.clearUserClients).toHaveBeenCalledWith(
        'regularuser',
        'tenant123',
      );
    });

    it('should handle token refresh failure gracefully', async () => {
      // Mock invalid token
      (matrixUserService.verifyAccessToken as jest.Mock).mockResolvedValueOnce(
        false,
      );

      // Mock token generation failure
      (
        matrixUserService.generateNewAccessToken as jest.Mock
      ).mockResolvedValueOnce(null);

      const options: SendMessageOptions = {
        roomId: 'room-123',
        content: 'test message',
        userId: '@testuser:matrix.openmeet.net',
        accessToken: 'invalid-token',
        tenantId: 'tenant123',
      };

      await expect(service.sendMessage(options)).rejects.toThrow(
        'Failed to refresh Matrix credentials',
      );

      // Verify token refresh was attempted
      expect(matrixUserService.generateNewAccessToken).toHaveBeenCalled();
    });
  });

  describe('sendTypingNotification', () => {
    it('should send typing notification for a user', async () => {
      const roomId = 'room-123';
      const userId = '@user:example.org';
      const accessToken = 'user-token';
      const isTyping = true;

      // Create a new mock client for the user
      const mockUserClient = { ...mockMatrixClient };
      mockSdkCreateClient.mockReturnValueOnce(mockUserClient);

      await service.sendTypingNotification(
        roomId,
        userId,
        accessToken,
        isTyping,
      );

      // Verify client was created for the user
      expect(mockSdkCreateClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://matrix.example.org',
          userId,
          accessToken,
          deviceId: 'OPENMEET_SERVER',
          useAuthorizationHeader: true,
        }),
      );

      // Verify sendTyping was called with correct parameters
      expect(mockUserClient.sendTyping).toHaveBeenCalledWith(
        roomId,
        isTyping,
        20000, // active typing timeout
      );
    });

    it('should send typing stopped notification', async () => {
      const roomId = 'room-123';
      const userId = '@user:example.org';
      const accessToken = 'user-token';
      const isTyping = false;

      // Create a new mock client for the user
      const mockUserClient = { ...mockMatrixClient };
      mockSdkCreateClient.mockReturnValueOnce(mockUserClient);

      await service.sendTypingNotification(
        roomId,
        userId,
        accessToken,
        isTyping,
      );

      // Verify sendTyping was called with timeout 0 (stopped typing)
      expect(mockUserClient.sendTyping).toHaveBeenCalledWith(
        roomId,
        isTyping,
        0, // stopped typing
      );
    });

    it('should handle errors when sending typing notifications', async () => {
      const roomId = 'room-123';
      const userId = '@user:example.org';
      const accessToken = 'user-token';
      const isTyping = true;

      // Create a new mock client for the user
      const mockUserClient = { ...mockMatrixClient };
      mockSdkCreateClient.mockReturnValueOnce(mockUserClient);

      // Mock sendTyping to fail
      mockUserClient.sendTyping.mockRejectedValueOnce(
        new Error('Failed to send typing notification'),
      );

      await expect(
        service.sendTypingNotification(roomId, userId, accessToken, isTyping),
      ).rejects.toThrow(
        'Failed to send typing notification: Failed to send typing notification',
      );
    });
  });

  describe('getRoomMessages', () => {
    it('should get messages from a room', async () => {
      const roomId = 'room-123';
      const limit = 30;

      const result = await service.getRoomMessages(roomId, limit);

      // Verify client acquire/release
      expect(matrixCoreService.acquireClient).toHaveBeenCalled();
      expect(matrixCoreService.releaseClient).toHaveBeenCalled();

      // Verify axios request
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/_matrix/client/v3/rooms/${roomId}/messages`),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer mock-access-token',
          },
        }),
      );

      // Verify the result structure
      expect(result).toEqual({
        messages: [
          {
            eventId: 'event-123',
            roomId: 'room-123',
            sender: '@user:example.org',
            content: { body: 'Hello world', msgtype: 'm.text' },
            timestamp: 1626200000000,
          },
        ],
        end: 'end-token',
      });
    });

    it('should include pagination token if provided', async () => {
      const roomId = 'room-123';
      const limit = 30;
      const from = 'pagination-token';

      await service.getRoomMessages(roomId, limit, from);

      // Verify axios request includes the from parameter
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringMatching(/.*[\?&]from=pagination-token.*/),
        expect.any(Object),
      );
    });

    it('should handle missing access token', async () => {
      const roomId = 'room-123';

      // Mock getAccessToken to return null
      mockMatrixClient.getAccessToken.mockReturnValueOnce(null);

      await expect(service.getRoomMessages(roomId)).rejects.toThrow(
        'No access token available to fetch messages',
      );

      // Should still release client even after error
      expect(matrixCoreService.releaseClient).toHaveBeenCalled();
    });

    it('should handle errors when getting messages', async () => {
      const roomId = 'room-123';

      // Mock axios to fail
      mockedAxios.get.mockRejectedValueOnce(
        new Error('Failed to fetch messages'),
      );

      await expect(service.getRoomMessages(roomId)).rejects.toThrow(
        'Failed to get messages from Matrix room: Failed to fetch messages',
      );

      // Should still release client even after error
      expect(matrixCoreService.releaseClient).toHaveBeenCalled();
    });
  });
});
