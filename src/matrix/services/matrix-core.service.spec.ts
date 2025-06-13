import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixCoreService } from './matrix-core.service';
import axios from 'axios';
import { Logger } from '@nestjs/common';
import { MatrixTokenManagerService } from './matrix-token-manager.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as matrixSdk from 'matrix-js-sdk';

// Mock matrix-js-sdk module
jest.mock('matrix-js-sdk', () => {
  // Create the mocks directly in the mock declaration
  const mockClient = {
    startClient: jest.fn().mockResolvedValue(undefined),
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
    roomState: jest.fn().mockResolvedValue([]),
    sendTyping: jest.fn().mockResolvedValue({}),
  };

  return {
    createClient: jest.fn().mockImplementation(() => mockClient),
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

// Access the mocked client for use in tests
const mockMatrixClient = (matrixSdk as any).__mockClient;

describe('MatrixCoreService', () => {
  let service: MatrixCoreService;
  let tokenManager: MatrixTokenManagerService;

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
            getAdminTokenState: jest.fn().mockReturnValue('valid'),
            getTokenState: jest.fn().mockReturnValue('valid'),
            reportTokenInvalid: jest.fn(),
            forceTokenRegeneration: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
            removeAllListeners: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixCoreService>(MatrixCoreService);
    tokenManager = module.get<MatrixTokenManagerService>(
      MatrixTokenManagerService,
    );

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

      // Verify removeAllListeners was called with the correct event
      expect(service['eventEmitter'].removeAllListeners).toHaveBeenCalledWith(
        'matrix.admin.token.updated',
      );

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

    it('should return event emitter', () => {
      const mockEventEmitter = {
        emit: jest.fn(),
        on: jest.fn(),
        removeListener: jest.fn(),
      };

      // Set the expected properties for the test
      (service as any).eventEmitter = mockEventEmitter;

      const eventEmitter = service.getEventEmitter();

      expect(eventEmitter).toBe(mockEventEmitter);
    });
  });

  describe('acquireClient - token regeneration fixes', () => {
    let mockClientPool;

    beforeEach(() => {
      // Mock client pool
      mockClientPool = {
        acquire: jest.fn(),
        release: jest.fn(),
        drain: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).clientPool = mockClientPool;

      // Mock admin token access
      (service as any).adminAccessToken = 'valid-token';

      // Ensure Matrix SDK is properly mocked
      (service as any).matrixSdk = matrixSdk;
    });

    it('should acquire client successfully when token is valid', async () => {
      // Mock token manager to return valid state
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('valid');
      (tokenManager.getAdminToken as jest.Mock).mockReturnValue('valid-token');

      // Mock client pool to return client with matching token
      const mockClientWithContext = {
        client: { ...mockMatrixClient, getAccessToken: () => 'valid-token' },
        userId: '@admin:example.org',
      };
      mockClientPool.acquire.mockResolvedValue(mockClientWithContext);

      const result = await service.acquireClient();

      expect(result).toBe(mockClientWithContext);
      expect(tokenManager.reportTokenInvalid).not.toHaveBeenCalled();
    });

    it('should regenerate token and retry when token is invalid', async () => {
      // Mock token manager sequence: invalid -> valid after regeneration
      (tokenManager.getAdminTokenState as jest.Mock)
        .mockReturnValueOnce('invalid')
        .mockReturnValue('valid');

      // Mock successful token regeneration
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValue(true);
      (tokenManager.getAdminToken as jest.Mock).mockReturnValue(
        'new-valid-token',
      );

      // Mock client pool to return client with new token
      const mockClientWithContext = {
        client: {
          ...mockMatrixClient,
          getAccessToken: () => 'new-valid-token',
        },
        userId: '@admin:example.org',
      };
      mockClientPool.acquire.mockResolvedValue(mockClientWithContext);

      const result = await service.acquireClient();

      // Check the result properties individually instead of exact object match
      expect(result.client.getAccessToken()).toBe('new-valid-token');
      expect(result.userId).toBe('@admin:example.org');
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
      expect(service['adminAccessToken']).toBe('new-valid-token');
    });

    it('should throw error when token regeneration fails', async () => {
      // Mock token manager to indicate invalid state and failed regeneration
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('invalid');
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValue(false);

      await expect(service.acquireClient()).rejects.toThrow(
        'Cannot acquire Matrix client: admin token regeneration failed',
      );
    });

    it('should reinitialize client pool when token has changed', async () => {
      // Set service token to new-token
      (service as any).adminAccessToken = 'new-token';

      // Mock token manager to return valid state
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('valid');
      (tokenManager.getAdminToken as jest.Mock).mockReturnValue('new-token');

      // Mock the SDK createClient to return a client with the right token
      (matrixSdk.createClient as jest.Mock).mockImplementation(() => ({
        ...mockMatrixClient,
        getAccessToken: () => 'new-token',
      }));

      // Mock client pool to return client with OLD token (indicating pool needs refresh)
      const mockClientWithOldToken = {
        client: { ...mockMatrixClient, getAccessToken: () => 'old-token' },
        userId: '@admin:example.org',
      };

      mockClientPool.acquire.mockResolvedValueOnce(mockClientWithOldToken); // First call returns old token

      // Spy on initializeClientPool
      const initializePoolSpy = jest.spyOn(
        service as any,
        'initializeClientPool',
      );

      const result = await service.acquireClient();

      // Check the result properties (the exact client will be different due to reinitialize)
      expect(result.client.getAccessToken()).toBe('new-token');
      expect(mockClientPool.release).toHaveBeenCalledWith(
        mockClientWithOldToken,
      );
      expect(mockClientPool.drain).toHaveBeenCalled();
      expect(mockClientPool.clear).toHaveBeenCalled();
      expect(initializePoolSpy).toHaveBeenCalled();
    });

    it('should handle M_UNKNOWN_TOKEN errors in client acquisition', async () => {
      // Mock token manager to return valid state initially
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('valid');

      // Mock client pool to throw M_UNKNOWN_TOKEN error
      mockClientPool.acquire.mockRejectedValue({
        message: 'M_UNKNOWN_TOKEN error',
        data: { errcode: 'M_UNKNOWN_TOKEN' },
      });

      await expect(service.acquireClient()).rejects.toThrow(
        'Cannot acquire Matrix client',
      );
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
    });
  });

  describe('ensureValidAdminToken', () => {
    it('should return true when token state is valid', async () => {
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('valid');
      (tokenManager.getAdminToken as jest.Mock).mockReturnValue(
        'current-token',
      );
      (service as any).adminAccessToken = 'current-token';

      const result = await service.ensureValidAdminToken();

      expect(result).toBe(true);
    });

    it('should return true when token state is regenerating', async () => {
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue(
        'regenerating',
      );

      const result = await service.ensureValidAdminToken();

      expect(result).toBe(true);
    });

    it('should report invalid token and return false when state is invalid', async () => {
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('invalid');
      (tokenManager.reportTokenInvalid as jest.Mock).mockResolvedValue(false);

      const result = await service.ensureValidAdminToken();

      expect(result).toBe(false);
      expect(tokenManager.reportTokenInvalid).toHaveBeenCalled();
    });

    it('should update admin token reference when token manager has newer token', async () => {
      (tokenManager.getAdminTokenState as jest.Mock).mockReturnValue('valid');
      (tokenManager.getAdminToken as jest.Mock).mockReturnValue('newer-token');
      (service as any).adminAccessToken = 'older-token';

      // Spy on createAdminClient - mock it to avoid side effects
      const createAdminClientSpy = jest
        .spyOn(service as any, 'createAdminClient')
        .mockImplementation(() => {});

      const result = await service.ensureValidAdminToken();

      expect(result).toBe(true);
      expect(service['adminAccessToken']).toBe('newer-token');
      expect(createAdminClientSpy).toHaveBeenCalled();
    });
  });
});
