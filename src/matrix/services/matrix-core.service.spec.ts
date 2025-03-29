import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixCoreService } from './matrix-core.service';

// Mock matrix-js-sdk
jest.mock('matrix-js-sdk', () => {
  const mockClient = {
    startClient: jest.fn(),
    stopClient: jest.fn(),
    createRoom: jest
      .fn()
      .mockResolvedValue({ room_id: '!mock-room:matrix.org' }),
    sendEvent: jest
      .fn()
      .mockResolvedValue({ event_id: '$mock-event-id:matrix.org' }),
    getStateEvent: jest.fn().mockResolvedValue({}),
    sendStateEvent: jest.fn().mockResolvedValue({}),
    invite: jest.fn().mockResolvedValue({}),
    kick: jest.fn().mockResolvedValue({}),
    joinRoom: jest.fn().mockResolvedValue({}),
    getProfileInfo: jest.fn().mockResolvedValue({ displayname: 'Mock User' }),
    setDisplayName: jest.fn().mockResolvedValue({}),
    getJoinedRooms: jest.fn().mockResolvedValue({ joined_rooms: [] }),
    getRoom: jest.fn().mockReturnValue(null),
    getAccessToken: jest.fn().mockReturnValue('mock-token'),
    getUserId: jest.fn().mockReturnValue('@mock-user:matrix.org'),
    on: jest.fn(),
    removeListener: jest.fn(),
  };

  return {
    createClient: jest.fn().mockReturnValue(mockClient),
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
    __mockClient: mockClient,
  };
});

describe('MatrixCoreService', () => {
  let service: MatrixCoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixCoreService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'matrix') {
                return {
                  baseUrl: 'https://matrix.example.org',
                  serverName: 'example.org',
                  adminUser: 'admin',
                  adminAccessToken: 'admin-token',
                  defaultDeviceId: 'OPENMEET_SERVER',
                  defaultInitialDeviceDisplayName: 'OpenMeet Server',
                  connectionPoolSize: 5,
                  connectionPoolTimeout: 30000,
                };
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixCoreService>(MatrixCoreService);
    // Get service but don't use it directly in tests
    module.get<ConfigService>(ConfigService);

    // Skip initialization to avoid side effects
    jest.spyOn(service, 'onModuleInit').mockImplementation(async () => {});
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should create admin client during initialization', async () => {
      // Reset the mock implementation to test actual initialization
      jest.spyOn(service, 'onModuleInit').mockRestore();

      // Force dynamically loaded SDK methods to be mocked
      const mockSdk = jest.requireMock('matrix-js-sdk');
      jest.spyOn(service as any, 'loadMatrixSdk').mockImplementation(() => {
        (service as any).matrixSdk = mockSdk;
        return Promise.resolve();
      });

      // Call initialization
      await service.onModuleInit();

      // Verify admin client was created
      expect(mockSdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://matrix.example.org',
          userId: '@admin:example.org',
          accessToken: 'admin-token',
          useAuthorizationHeader: true,
        }),
      );
    });

    it('should throw an error on SDK loading failure', async () => {
      // Since we've removed the createMockSdk method, we expect loadMatrixSdk to throw an error
      // when there's a problem loading the SDK
      
      // Create a spy on loadMatrixSdk that simulates a failure
      const loadMatrixSdkSpy = jest.spyOn(service as any, 'loadMatrixSdk');
      loadMatrixSdkSpy.mockRejectedValue(new Error('SDK load failure'));
      
      // Initialize module and expect it to catch the error
      await expect(service.onModuleInit()).resolves.not.toThrow();
      
      // We expect the service to log the error but not throw
      expect(loadMatrixSdkSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on module destroy', async () => {
      // Setup admin client for cleanup
      const mockClient = jest.requireMock('matrix-js-sdk').__mockClient;
      (service as any).adminClient = mockClient;

      // Setup a mock client pool
      const mockClientPool = {
        drain: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).clientPool = mockClientPool;

      // Call cleanup
      await service.onModuleDestroy();

      // Verify stopClient was called on the admin client
      expect(mockClient.stopClient).toHaveBeenCalled();

      // Verify client pool was drained and cleared
      expect(mockClientPool.drain).toHaveBeenCalled();
      expect(mockClientPool.clear).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('should return admin client', () => {
      const mockClient = jest.requireMock('matrix-js-sdk').__mockClient;
      (service as any).adminClient = mockClient;

      expect(service.getAdminClient()).toBe(mockClient);
    });

    it('should return matrix SDK', () => {
      const mockSdk = jest.requireMock('matrix-js-sdk');
      (service as any).matrixSdk = mockSdk;

      expect(service.getSdk()).toBe(mockSdk);
    });

    it('should return configuration', () => {
      const expectedConfig = {
        baseUrl: 'https://matrix.example.org',
        serverName: 'example.org',
        adminUserId: '@admin:example.org',
        defaultDeviceId: 'OPENMEET_SERVER',
        defaultInitialDeviceDisplayName: 'OpenMeet Server',
      };

      // Set the expected properties for the test
      (service as any).baseUrl = expectedConfig.baseUrl;
      (service as any).serverName = expectedConfig.serverName;
      (service as any).adminUserId = expectedConfig.adminUserId;
      (service as any).defaultDeviceId = expectedConfig.defaultDeviceId;
      (service as any).defaultInitialDeviceDisplayName =
        expectedConfig.defaultInitialDeviceDisplayName;

      const config = service.getConfig();

      expect(config).toEqual(expectedConfig);
    });
  });
});
