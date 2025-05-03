import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixCoreService } from './matrix-core.service';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { MatrixTokenManagerService } from './matrix-token-manager.service';

// Create the mocks directly in the test file instead of importing
// This avoids path issues in different environments
const mockMatrixClient = {
  startClient: jest.fn().mockResolvedValue(undefined),
  stopClient: jest.fn(),
  createRoom: jest.fn().mockResolvedValue({ room_id: '!mock-room:matrix.org' }),
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
  roomState: jest.fn().mockResolvedValue([]),
  sendTyping: jest.fn().mockResolvedValue({}),
};

// Mock matrix-js-sdk module
jest.mock('matrix-js-sdk', () => {
  return {
    // This is the key line - make sure createClient is a function
    createClient: jest.fn().mockImplementation(() => mockMatrixClient),
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
    __mockClient: mockMatrixClient,
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
        {
          provide: MatrixTokenManagerService,
          useValue: {
            getAdminToken: jest.fn().mockReturnValue('admin-token'),
            getTokenState: jest.fn().mockReturnValue('valid'),
            reportTokenInvalid: jest.fn(),
            forceTokenRegeneration: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixCoreService>(MatrixCoreService);

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

      // Setup mock config to include adminPassword
      jest.spyOn(service['configService'], 'get').mockImplementation((key) => {
        if (key === 'matrix') {
          return {
            baseUrl: 'https://matrix.example.org',
            serverName: 'example.org',
            adminUser: 'admin',
            adminPassword: 'admin-password', // Add this
            adminAccessToken: 'admin-token',
            defaultDeviceId: 'OPENMEET_SERVER',
            defaultInitialDeviceDisplayName: 'OpenMeet Server',
            connectionPoolSize: 5,
            connectionPoolTimeout: 30000,
          };
        }
        return null;
      });

      // Mock the authentication API call for token verification
      jest.spyOn(axios, 'post').mockResolvedValue({
        data: { access_token: 'admin-token' },
      });

      jest.spyOn(axios, 'get').mockResolvedValue({
        data: { user_id: '@admin:example.org' },
      });

      // Create a spy for createClient
      const createClientSpy = jest.fn().mockReturnValue(mockMatrixClient);

      // Mock the dynamic import to return our mock SDK
      jest
        .spyOn(service as any, 'loadMatrixSdk')
        .mockImplementation(async () => {
          // Set the matrixSdk property to our mock
          (service as any).matrixSdk = {
            createClient: createClientSpy,
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
          return Promise.resolve();
        });

      // Call initialization
      await service.onModuleInit();

      // Verify admin client was created - use any matcher instead of exact value matching
      expect(createClientSpy).toHaveBeenCalled();
      const callArgs = createClientSpy.mock.calls[0][0];
      expect(callArgs).toHaveProperty('accessToken', 'admin-token');
      expect(callArgs).toHaveProperty('useAuthorizationHeader', true);
    });

    it('should handle SDK loading errors gracefully', async () => {
      // Reset the mock implementation from previous test
      jest.spyOn(service, 'onModuleInit').mockRestore();

      // Create a spy on loadMatrixSdk that simulates a failure
      const loadMatrixSdkSpy = jest.spyOn(service as any, 'loadMatrixSdk');
      loadMatrixSdkSpy.mockRejectedValue(new Error('SDK load failure'));

      // Mock console error to prevent test output noise
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Mock Logger class to prevent error output
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      // Initialize module and expect it to catch the error
      await expect(service.onModuleInit()).resolves.not.toThrow();

      // We expect the service to log the error but not throw
      expect(loadMatrixSdkSpy).toHaveBeenCalled();

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on module destroy', async () => {
      // Setup admin client for cleanup
      (service as any).adminClient = mockMatrixClient;

      // Setup a mock client pool
      const mockClientPool = {
        drain: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).clientPool = mockClientPool;

      // Call cleanup
      await service.onModuleDestroy();

      // Verify stopClient was called on the admin client
      expect(mockMatrixClient.stopClient).toHaveBeenCalled();

      // Verify client pool was drained and cleared
      expect(mockClientPool.drain).toHaveBeenCalled();
      expect(mockClientPool.clear).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('should return admin client', () => {
      (service as any).adminClient = mockMatrixClient;
      expect(service.getAdminClient()).toBe(mockMatrixClient);
    });

    it('should return matrix SDK', () => {
      const mockSdk = {
        createClient: jest.fn(),
        Visibility: { Public: 'public', Private: 'private' },
        Preset: {
          PublicChat: 'public_chat',
          PrivateChat: 'private_chat',
          TrustedPrivateChat: 'trusted_private_chat',
        },
        Direction: { Forward: 'f', Backward: 'b' },
      };
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
