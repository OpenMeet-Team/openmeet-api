import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixCoreService } from './matrix-core.service';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock matrix-js-sdk module
jest.mock('matrix-js-sdk', () => {
  return {
    createClient: jest.fn(),
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
                };
              }
              return null;
            }),
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should load Matrix SDK during initialization', async () => {
      // Create a spy for loadMatrixSdk
      const loadMatrixSdkSpy = jest
        .spyOn(service as any, 'loadMatrixSdk')
        .mockImplementation(async () => {
          // Set the matrixSdk property to our mock
          (service as any).matrixSdk = {
            createClient: jest.fn(),
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

      // Verify SDK was loaded
      expect(loadMatrixSdkSpy).toHaveBeenCalled();
    });

    it('should handle SDK loading errors gracefully', async () => {
      // Create a spy on loadMatrixSdk that simulates a failure
      const loadMatrixSdkSpy = jest.spyOn(service as any, 'loadMatrixSdk');
      loadMatrixSdkSpy.mockRejectedValue(new Error('SDK load failure'));

      // Mock Logger class to prevent error output
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      // Initialize module and expect it to catch the error
      await expect(service.onModuleInit()).resolves.not.toThrow();

      // We expect the service to log the error but not throw
      expect(loadMatrixSdkSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clean up resources on module destroy', async () => {
      // Call cleanup
      await service.onModuleDestroy();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });

  describe('getters', () => {
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
      const config = service.getConfig();

      expect(config).toEqual({
        baseUrl: 'https://matrix.example.org',
        serverName: 'example.org',
      });
    });

    it('should return event emitter', () => {
      const eventEmitter = service.getEventEmitter();
      expect(eventEmitter).toBeDefined();
    });
  });
});
