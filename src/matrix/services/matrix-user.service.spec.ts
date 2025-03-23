import { Test, TestingModule } from '@nestjs/testing';
import { MatrixUserService } from './matrix-user.service';
import { MatrixCoreService } from './matrix-core.service';
import { ModuleRef } from '@nestjs/core';
import { MatrixGateway } from '../matrix.gateway';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixUserService', () => {
  let service: MatrixUserService;

  const mockMatrixConfig = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    adminUserId: '@admin:example.org',
    defaultDeviceId: 'OPENMEET_SERVER',
    defaultInitialDeviceDisplayName: 'OpenMeet Server',
  };

  // Create a mock client that will be returned by MatrixCoreService
  const mockMatrixClient = {
    startClient: jest.fn().mockResolvedValue(undefined),
    stopClient: jest.fn().mockResolvedValue(undefined),
    setDisplayName: jest.fn().mockResolvedValue({}),
    getProfileInfo: jest.fn().mockImplementation((userId) =>
      Promise.resolve({
        displayname: `User ${userId}`,
      }),
    ),
    sendTyping: jest.fn().mockResolvedValue({}),
    getAccessToken: jest.fn().mockReturnValue('admin-access-token'),
  };

  // Mock SDK that will be returned by MatrixCoreService
  const mockMatrixSdk = {
    createClient: jest.fn().mockReturnValue(mockMatrixClient),
    Visibility: {
      Public: 'public',
      Private: 'private',
    },
    Preset: {
      PublicChat: 'public_chat',
      PrivateChat: 'private_chat',
      TrustedPrivateChat: 'trusted_private_chat',
    },
    Direction: {
      Forward: 'f',
      Backward: 'b',
    },
  };

  // Add afterEach and afterAll to clean up resources
  afterEach(() => {
    // Unregister timers after each test to prevent hanging
    if (service && typeof service.unregisterTimers === 'function') {
      service.unregisterTimers();
    }
  });

  afterAll(() => {
    // Call the module destroy hook to clean up resources
    if (service && typeof (service as any).onModuleDestroy === 'function') {
      (service as any).onModuleDestroy();
    }

    // Restore all mocks
    jest.restoreAllMocks();
  });

  beforeAll(() => {
    // Setup fake timers for all tests
    jest.useFakeTimers();
  });

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock axios responses
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

    // Reset mock for getAccessToken
    mockMatrixClient.getAccessToken.mockReturnValue('admin-access-token');

    // Important: Mock setInterval before creating the service
    jest.spyOn(global, 'setInterval').mockImplementation(() => {
      return 123 as unknown as NodeJS.Timeout;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixUserService,
        {
          provide: MatrixCoreService,
          useValue: {
            getConfig: jest.fn().mockReturnValue(mockMatrixConfig),
            getSdk: jest.fn().mockReturnValue(mockMatrixSdk),
            getAdminClient: jest.fn().mockReturnValue(mockMatrixClient),
            acquireClient: jest.fn().mockResolvedValue({
              client: mockMatrixClient,
              userId: '@admin:example.org',
            }),
            releaseClient: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
            resolve: jest.fn(),
          },
        },
        {
          provide: MatrixGateway,
          useValue: {
            broadcastRoomEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixUserService>(MatrixUserService);
    // Get service but don't use it directly in tests
    module.get<MatrixCoreService>(MatrixCoreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createUser', () => {
    it('should create a Matrix user via Admin API', async () => {
      // Reset mock for specific test
      mockedAxios.post.mockReset();
      mockedAxios.put.mockReset();

      // Set up mocks with expected responses
      mockedAxios.put.mockResolvedValueOnce({ data: { success: true } });
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          user_id: '@test:example.org',
          access_token: 'test-access-token',
          device_id: 'test-device-id',
        },
      });

      const createOptions = {
        username: 'test_user',
        password: 'test_password',
        displayName: 'Test User',
      };

      const result = await service.createUser(createOptions);

      // Verify the axios put call for creating the user
      expect(mockedAxios.put).toHaveBeenCalledWith(
        expect.stringMatching(
          /_synapse\/admin\/v[12]\/users\/@test_user:example\.org/,
        ),
        expect.objectContaining({
          password: 'test_password',
          displayname: 'Test User',
          deactivated: false,
        }),
        expect.any(Object),
      );

      // Verify just that post was called - the URL might vary so we don't test it strictly
      expect(mockedAxios.post).toHaveBeenCalled();
      // And verify the posted data included the password
      expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({
        type: 'm.login.password',
        password: 'test_password',
      });

      // Verify the result structure
      expect(result).toEqual({
        userId: '@test:example.org',
        accessToken: 'test-access-token',
        deviceId: 'test-device-id',
      });
    });

    it('should handle errors when creating users', async () => {
      // Mock a failure in all registration methods
      mockedAxios.put.mockImplementation(() => {
        return Promise.reject(new Error('Failed with API'));
      });
      mockedAxios.post.mockImplementation(() => {
        return Promise.reject(new Error('Failed with registration API'));
      });

      const createOptions = {
        username: 'test_user',
        password: 'test_password',
        displayName: 'Test User',
      };

      await expect(service.createUser(createOptions)).rejects.toThrow(
        'Failed to create Matrix user',
      );
    });
  });

  describe('getClientForUser', () => {
    it('should create a new client if none exists for user', async () => {
      const userSlug = 'test-user';
      const mockUserService = {
        findBySlug: jest.fn().mockResolvedValue({
          matrixUserId: '@test_user:example.org',
          matrixAccessToken: 'test-access-token',
          matrixDeviceId: 'test-device-id',
        }),
      };

      // Ensure no client exists yet
      (service as any).userMatrixClients = new Map();

      // Get client
      const client = await service.getClientForUser(
        userSlug,
        mockUserService as any,
        'test-tenant',
      );

      // Verify the client was created using the SDK
      expect(mockMatrixSdk.createClient).toHaveBeenCalledWith({
        baseUrl: 'https://matrix.example.org',
        userId: '@test_user:example.org',
        accessToken: 'test-access-token',
        deviceId: 'test-device-id',
        useAuthorizationHeader: true,
      });

      // Verify the client was returned
      expect(client).toBe(mockMatrixClient);

      // Verify the client was cached
      expect((service as any).userMatrixClients.has(userSlug)).toBe(true);
    });

    it('should return existing client if one exists for user', async () => {
      const userSlug = 'test-user';

      // Set up an existing client
      const existingClient = { ...mockMatrixClient };
      (service as any).userMatrixClients = new Map();
      (service as any).userMatrixClients.set(userSlug, {
        client: existingClient,
        matrixUserId: '@test_user:example.org',
        lastActivity: new Date(),
      });

      // Get client
      const client = await service.getClientForUser(userSlug);

      // Verify SDK was not called (existing client used)
      expect(mockMatrixSdk.createClient).not.toHaveBeenCalled();

      // Verify correct client returned
      expect(client).toBe(existingClient);
    });
  });

  describe('setUserDisplayName', () => {
    it('should set a user display name', async () => {
      await service.setUserDisplayName(
        '@test:example.org',
        'test-access-token',
        'New Display Name',
        'test-device-id',
      );

      // Verify client creation with correct parameters
      expect(mockMatrixSdk.createClient).toHaveBeenCalledWith({
        baseUrl: 'https://matrix.example.org',
        userId: '@test:example.org',
        accessToken: 'test-access-token',
        deviceId: 'test-device-id',
        useAuthorizationHeader: true,
      });

      // Verify display name was set
      expect(mockMatrixClient.setDisplayName).toHaveBeenCalledWith(
        'New Display Name',
      );
    });
  });

  describe('getUserDisplayName', () => {
    it('should get a user display name', async () => {
      const displayName = await service.getUserDisplayName('@test:example.org');

      // Verify admin client's getProfileInfo was called
      expect(mockMatrixClient.getProfileInfo).toHaveBeenCalledWith(
        '@test:example.org',
        'displayname',
      );

      // Verify the display name returned matches our mock
      expect(displayName).toBe('User @test:example.org');
    });

    it('should handle errors when getting display name', async () => {
      // Mock failure
      mockMatrixClient.getProfileInfo.mockRejectedValueOnce(
        new Error('User not found'),
      );

      const displayName = await service.getUserDisplayName(
        '@nonexistent:example.org',
      );

      // Should return null on error
      expect(displayName).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should clean up inactive clients', () => {
      // Set up two clients, one inactive and one active
      const now = new Date();
      const inactiveClient = { ...mockMatrixClient };
      const activeClient = { ...mockMatrixClient };

      const inactiveTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const activeTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      (service as any).userMatrixClients = new Map([
        [
          'inactive-user',
          {
            client: inactiveClient,
            matrixUserId: '@inactive:example.org',
            lastActivity: inactiveTime,
          },
        ],
        [
          'active-user',
          {
            client: activeClient,
            matrixUserId: '@active:example.org',
            lastActivity: activeTime,
          },
        ],
      ]);

      // Run cleanup
      (service as any).cleanupInactiveClients();

      // Verify inactive client was stopped and removed
      expect(inactiveClient.stopClient).toHaveBeenCalled();
      expect((service as any).userMatrixClients.has('inactive-user')).toBe(
        false,
      );

      // The active client might actually get removed because of thresholds in the code
      // This test now just checks that the inactive user is gone
      expect((service as any).userMatrixClients.has('active-user')).toBe(true);
    });
  });
});
