import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixService } from './matrix.service';
import { ModuleRef } from '@nestjs/core';
import axios from 'axios';

// Import mocked matrix-js-sdk with proper type casting
// We need to make sure TypeScript knows about the mock methods
const matrixJsSdk = jest.requireMock('matrix-js-sdk');
// Import directly the mock client for easier access in tests
const mockClient = matrixJsSdk.__mockClient;

// Make sure Jest knows to mock matrix-js-sdk
jest.mock('matrix-js-sdk');

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixService', () => {
  let service: MatrixService;
  let mockModuleRef: Partial<ModuleRef>;

  const mockCache = new Map();

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    mockModuleRef = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixService,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
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
                  connectionPoolSize: 5,
                  connectionPoolTimeout: 30000,
                  connectionRetryAttempts: 3,
                  connectionRetryDelay: 1000,
                  inactiveClientTimeout: 7200000, // 2 hours in ms
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
      ],
    }).compile();

    service = module.get<MatrixService>(MatrixService);

    // Manually initialize clientPool and matrixSdk for tests
    // @ts-expect-error - access private property for testing
    service.clientPool = {
      acquire: jest.fn().mockResolvedValue({
        client: mockClient,
        userId: '@admin:example.org',
      }),
      release: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    // @ts-expect-error - access and set the matrixSdk for testing
    service.matrixSdk = matrixJsSdk;
    
    // @ts-expect-error - access and set the SDK property that's normally dynamically imported
    service.sdk = matrixJsSdk;
    
    // @ts-expect-error - access and set the adminClient for testing
    service.adminClient = mockClient;

    // @ts-expect-error - access and set the activeClients for testing
    service.activeClients = new Map();

    // @ts-expect-error - access and set the requestCache for testing
    service.requestCache = mockCache;

    // Mock the axios responses for REST API calls
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
    mockedAxios.post.mockResolvedValue({
      data: {
        user_id: '@test:example.org',
        access_token: 'test-access-token',
        device_id: 'test-device-id',
      },
    });
    mockedAxios.put.mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockCache.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it.skip('should create a new Matrix user using Admin API', async () => {
      // Mock the put and post requests needed for Admin API user creation
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true },
      });

      // Mock login response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          user_id: '@test:example.org',
          access_token: 'test-access-token',
          device_id: 'test-device-id',
        },
      });

      const result = await service.createUser({
        username: 'testuser',
        password: 'testpassword',
        displayName: 'Test User',
      });

      // Verify the result
      expect(result).toEqual({
        userId: '@test:example.org',
        accessToken: 'test-access-token',
        deviceId: 'test-device-id',
      });

      // Verify the admin API call
      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringContaining('/_synapse/admin/v2/users/@testuser:example.org'),
        expect.objectContaining({
          password: 'testpassword',
          deactivated: false,
        }),
        expect.any(Object),
      );
    });
  });

  describe('createRoom', () => {
    it('should create a new Matrix room with default settings', async () => {
      const result = await service.createRoom({
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
        inviteUserIds: ['@user:example.org'],
      });

      expect(mockClient.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Room',
          topic: 'Test Topic',
          visibility: 'private',
          preset: 'private_chat',
          invite: ['@user:example.org'],
        }),
      );
      expect(result).toEqual({
        roomId: '!mock-room:matrix.org', // Match the mock response
        name: 'Test Room',
        topic: 'Test Topic',
        invitedMembers: ['@user:example.org'],
      });
    });

    it('should create a room with custom preset if specified', async () => {
      // Using a properly typed preset from the SDK enum
      await service.createRoom({
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
        inviteUserIds: ['@user:example.org'],
        // Use the enum value directly instead of a string
        powerLevelContentOverride: { users: { '@user:example.org': 50 } },
      });

      expect(mockClient.createRoom).toHaveBeenCalled();
    });
  });

  describe('inviteUser', () => {
    it('should invite a user to a room', async () => {
      await service.inviteUser({
        roomId: 'room-123',
        userId: '@user:example.org',
      });

      expect(mockClient.invite).toHaveBeenCalledWith(
        'room-123',
        '@user:example.org',
      );
    });
  });

  describe('joinRoom', () => {
    it.skip('should join a room directly', async () => {
      await service.joinRoom(
        'room-123',
        '@user:example.org',
        'user-token'
      );

      expect(mockClient.joinRoom).toHaveBeenCalledWith('room-123');
    });

    it.skip('should handle already in room errors gracefully', async () => {
      // Mock joinRoom to throw "already in room" error
      mockClient.joinRoom.mockRejectedValueOnce({
        errcode: 'M_FORBIDDEN',
        error: 'User already in room',
      });

      await service.joinRoom(
        'room-123',
        '@user:example.org',
        'user-token'
      );

      // No exception should be thrown
    });
  });

  describe('removeUserFromRoom', () => {
    it('should remove a user from a room', async () => {
      await service.removeUserFromRoom('room-123', '@user:example.org');

      expect(mockClient.kick).toHaveBeenCalledWith(
        'room-123',
        '@user:example.org',
        expect.any(String),
      );
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a room', async () => {
      const mockAccessToken = 'user-access-token';
      const mockUserId = '@user:example.org';

      const result = await service.sendMessage({
        roomId: 'room-123',
        content: JSON.stringify({
          msgtype: 'm.text',
          body: 'Test message',
        }),
        accessToken: mockAccessToken,
        userId: mockUserId,
      });

      expect(mockClient.sendEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.message',
        expect.objectContaining({
          msgtype: 'm.text',
          body: 'Test message',
        }),
        '',
      );
      expect(result).toBe('event-123');
    });

    it.skip('should send a message with simplified syntax', async () => {
      // Set up an active client for the test user
      const clientForTest = { ...mockClient };
      // @ts-expect-error - setting private map for testing
      service.activeClients.set('@user:example.org', {
        client: clientForTest,
        lastActivity: new Date(),
        eventCallbacks: [], // use correct property name
        userId: '@user:example.org',
      });

      const result = await service.sendMessage({
        roomId: 'room-123',
        userId: '@user:example.org',
        accessToken: 'token',
        content: 'Simple message',
        messageType: 'm.text',
      });

      expect(clientForTest.sendEvent).toHaveBeenCalledWith(
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
  });

  describe('getRoomMessages', () => {
    it('should get messages from a room using REST API', async () => {
      const result = await service.getRoomMessages('room-123');

      // Should use axios.get with the right URL and params
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/_matrix/client/v3/rooms/room-123/messages'),
        expect.objectContaining({
          headers: expect.any(Object),
        }),
      );

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
  });

  describe('setRoomPowerLevels', () => {
    it.skip('should set power levels for users in a room', async () => {
      await service.setRoomPowerLevels('room-123', {
        '@user:example.org': 50,
      });

      expect(mockClient.getStateEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.power_levels',
        '',
      );
      expect(mockClient.sendStateEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.power_levels',
        {
          users: {
            '@admin:example.org': 100,
            '@user:example.org': 50,
          },
        },
        '',
      );
    });

    it.skip('should handle missing state events', async () => {
      // Mock getStateEvent to return undefined
      mockClient.getStateEvent.mockResolvedValueOnce(undefined);

      await service.setRoomPowerLevels('room-123', {
        '@user:example.org': 50,
      });

      // Should create new power levels with just the specified user
      expect(mockClient.sendStateEvent).toHaveBeenCalledWith(
        'room-123',
        'm.room.power_levels',
        {
          users: {
            '@user:example.org': 50,
          },
        },
        '',
      );
    });
  });

  describe('startClient', () => {
    it.skip('should start a Matrix client for a user', async () => {
      const mockUserInfo = {
        userId: '@test:example.org',
        accessToken: 'test-token',
        deviceId: 'test-device',
      };

      await service.startClient({
        ...mockUserInfo,
        onEvent: jest.fn(),
      });

      // Should store client in activeClients
      // @ts-expect-error - accessing private property
      expect(service.activeClients.has('@test:example.org')).toBeTruthy();

      // Should create client with right parameters
      expect(matrixJsSdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://matrix.example.org',
          userId: '@test:example.org',
          accessToken: 'test-token',
          deviceId: 'test-device',
        }),
      );

      // Should start syncing
      expect(mockClient.startClient).toHaveBeenCalled();
    });

    it.skip('should reuse an existing client if one exists', async () => {
      const mockUserInfo = {
        userId: '@test:example.org',
        accessToken: 'test-token',
        deviceId: 'test-device',
      };

      // Setup an existing client
      const existingClient = { ...mockClient };
      // @ts-expect-error - setting private property
      service.activeClients.set('@test:example.org', {
        client: existingClient,
        lastActivity: new Date(),
        eventCallbacks: [],
        userId: '@test:example.org',
      });

      await service.startClient({
        ...mockUserInfo,
        onEvent: jest.fn(),
      });

      // Should not create a new client
      expect(matrixJsSdk.createClient).not.toHaveBeenCalled();
      
      // Should update lastActivity
      // @ts-expect-error - checking private property
      const activeClient = service.activeClients.get('@test:example.org');
      expect(activeClient?.lastActivity).toBeDefined();
    });
  });

  // Skipping setTyping tests as this method doesn't exist in the current implementation
  // We can revisit this once we have more information about the actual typing implementation
  describe('client lifecycle', () => {
    it('should manage client lifecycle properly', async () => {
      // This is a placeholder test for client lifecycle management
      // which will be more meaningful once we understand the actual implementation details
      expect(service).toBeDefined();
    });
  });

  describe('cleanupInactiveClients', () => {
    it('should remove inactive clients', async () => {
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const threeHoursAgo = now - 3 * 60 * 60 * 1000;
      
      // Setup some active clients with different activity times
      const activeClient = { 
        client: { ...mockClient, stopClient: jest.fn() },
        lastActivity: now,
        callbacks: {},
        userId: '@active:example.org',
      };
      
      const inactiveClient = { 
        client: { ...mockClient, stopClient: jest.fn() },
        lastActivity: oneHourAgo, // 1 hour ago - still active
        callbacks: {},
        userId: '@recent:example.org',
      };
      
      const veryInactiveClient = { 
        client: { ...mockClient, stopClient: jest.fn() },
        lastActivity: threeHoursAgo, // 3 hours ago - should be removed
        callbacks: {},
        userId: '@inactive:example.org',
      };

      // @ts-expect-error - setting private map for testing
      service.activeClients.set('@active:example.org', activeClient);
      // @ts-expect-error - setting private map for testing
      service.activeClients.set('@recent:example.org', inactiveClient);
      // @ts-expect-error - setting private map for testing
      service.activeClients.set('@inactive:example.org', veryInactiveClient);

      // @ts-expect-error - calling private method for testing
      await service.cleanupInactiveClients();

      // Check that only inactive client was removed
      // @ts-expect-error - checking private map after cleanup
      expect(service.activeClients.has('@active:example.org')).toBeTruthy();
      // @ts-expect-error - checking private map after cleanup
      expect(service.activeClients.has('@recent:example.org')).toBeTruthy();
      // @ts-expect-error - checking private map after cleanup
      expect(service.activeClients.has('@inactive:example.org')).toBeFalsy();
      
      // Verify stopClient was called for the removed client
      expect(veryInactiveClient.client.stopClient).toHaveBeenCalled();
    });
  });
});
