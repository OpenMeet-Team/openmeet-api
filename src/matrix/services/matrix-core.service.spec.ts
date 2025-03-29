import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixCoreService } from './matrix-core.service';

// Import the mock directly - don't use jest.mock which is causing issues
import * as mockMatrixSdk from '../../../test/mocks/matrix/matrix-js-sdk';

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

      // Mock the dynamic import to return our mock SDK
      jest.spyOn(service as any, 'loadMatrixSdk').mockImplementation(async () => {
        (service as any).matrixSdk = mockMatrixSdk.default;
        return Promise.resolve();
      });

      // Call initialization
      await service.onModuleInit();

      // Verify admin client was created - using our test mock's createClient
      expect(mockMatrixSdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'https://matrix.example.org',
          userId: '@admin:example.org',
          accessToken: 'admin-token',
          useAuthorizationHeader: true,
        }),
      );
    });

    it('should handle SDK loading errors gracefully', async () => {
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
      (service as any).adminClient = mockMatrixSdk.__mockClient;

      // Setup a mock client pool
      const mockClientPool = {
        drain: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      (service as any).clientPool = mockClientPool;

      // Call cleanup
      await service.onModuleDestroy();

      // Verify stopClient was called on the admin client
      expect(mockMatrixSdk.__mockClient.stopClient).toHaveBeenCalled();

      // Verify client pool was drained and cleared
      expect(mockClientPool.drain).toHaveBeenCalled();
      expect(mockClientPool.clear).toHaveBeenCalled();
    });
  });

  describe('getters', () => {
    it('should return admin client', () => {
      (service as any).adminClient = mockMatrixSdk.__mockClient;
      expect(service.getAdminClient()).toBe(mockMatrixSdk.__mockClient);
    });

    it('should return matrix SDK', () => {
      (service as any).matrixSdk = mockMatrixSdk.default;
      expect(service.getSdk()).toBe(mockMatrixSdk.default);
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