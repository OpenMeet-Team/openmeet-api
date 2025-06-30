import { Test, TestingModule } from '@nestjs/testing';
import { MatrixUserService } from './matrix-user.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixMessageService } from './matrix-message.service';
import { GlobalMatrixValidationService } from './global-matrix-validation.service';
import { ModuleRef } from '@nestjs/core';
import axios from 'axios';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Matrix Token Refresh Integration', () => {
  let userService: MatrixUserService;
  let messageService: MatrixMessageService;
  // These services are used indirectly

  // Mock Matrix client
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
    sendEvent: jest.fn().mockResolvedValue({ event_id: 'event-123' }),
    getAccessToken: jest.fn().mockReturnValue('admin-access-token'),
    on: jest.fn(),
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

  // Mock client with context
  const mockClientWithContext = {
    client: mockMatrixClient,
    userId: '@admin:matrix.org',
    matrixUserId: '@admin:matrix.org',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock axios responses
    mockedAxios.get.mockImplementation((url) => {
      // Mock token verification endpoint
      if (url.includes('whoami')) {
        // Simulate valid token first time, then invalid on next call
        if (mockMatrixClient.getAccessToken() === 'admin-access-token') {
          return Promise.resolve({
            status: 200,
            data: { user_id: '@admin:matrix.org' },
          });
        } else if (mockMatrixClient.getAccessToken() === 'invalid-token') {
          return Promise.reject({
            response: {
              status: 401,
              data: { errcode: 'M_UNKNOWN_TOKEN' },
            },
          });
        } else if (mockMatrixClient.getAccessToken() === 'new-access-token') {
          return Promise.resolve({
            status: 200,
            data: { user_id: '@admin:matrix.org' },
          });
        }
      }

      return Promise.resolve({ data: {} });
    });

    mockedAxios.post.mockImplementation((url) => {
      // Admin API endpoint for generating new tokens
      if (url.includes('login')) {
        return Promise.resolve({
          data: {
            user_id: '@admin:matrix.org',
            access_token: 'new-access-token',
            device_id: 'test-device-id',
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    // Important: Mock setInterval before creating the service
    jest.spyOn(global, 'setInterval').mockImplementation(() => {
      return 123 as unknown as NodeJS.Timeout;
    });

    // Create a WebSocket implementation mock
    // const mockServer = {
    //   to: jest.fn().mockReturnThis(),

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixUserService,
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
            getSdk: jest.fn().mockReturnValue(mockMatrixSdk),
            getAdminClient: jest.fn().mockReturnValue(mockMatrixClient),
            acquireClient: jest.fn().mockResolvedValue(mockClientWithContext),
            releaseClient: jest.fn().mockResolvedValue(undefined),
            getEventEmitter: jest.fn().mockReturnValue(new EventEmitter2()),
          },
        },
        {
          provide: ModuleRef,
          useValue: {
            get: jest.fn(),
            resolve: jest.fn().mockImplementation(() => {
              return {
                findBySlug: jest.fn().mockResolvedValue({
                  id: 1,
                  slug: 'admin',
                  matrixUserId: '@admin:matrix.org',
                  matrixAccessToken: 'admin-access-token',
                  matrixDeviceId: 'test-device-id',
                }),
                findById: jest.fn().mockResolvedValue({
                  id: 1,
                  slug: 'admin',
                  matrixUserId: '@admin:matrix.org',
                  matrixAccessToken: 'admin-access-token',
                  matrixDeviceId: 'test-device-id',
                }),
                update: jest.fn().mockResolvedValue({
                  id: 1,
                  slug: 'admin',
                  matrixUserId: '@admin:matrix.org',
                  matrixAccessToken: 'new-access-token',
                  matrixDeviceId: 'test-device-id',
                }),
              };
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn().mockReturnValue({
              sub: '1',
              username: 'admin',
              tenantId: 'test-tenant',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'jwtSecret') return 'test-secret';
              return null;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2(),
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            isMatrixHandleUnique: jest.fn().mockResolvedValue(true),
            registerMatrixHandle: jest.fn().mockResolvedValue(undefined),
            suggestAvailableHandles: jest.fn().mockResolvedValue([]),
            unregisterMatrixHandle: jest.fn().mockResolvedValue(undefined),
            getMatrixHandleRegistration: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    userService = module.get<MatrixUserService>(MatrixUserService);
    messageService = module.get<MatrixMessageService>(MatrixMessageService);
    // Services are used by reference in the tests

    // We don't need to add methods to gateway - we'll use our own mock functions instead
  });

  afterEach(() => {
    // Unregister timers after each test to prevent hanging
    if (userService && typeof userService.unregisterTimers === 'function') {
      userService.unregisterTimers();
    }
  });

  afterAll(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('Token Refresh Integration', () => {
    it('should clear clients when Matrix tokens are invalid', async () => {
      // Spy on clearCachedClients method
      const clearClientsSpy = jest.spyOn(
        userService as any,
        'clearCachedClients',
      );

      // First setup a client in the cache
      await userService.getClientForUser('admin');

      // Verify client was cached
      expect((userService as any).userMatrixClients.has('admin')).toBe(true);

      // Now simulate token validation failure
      mockMatrixClient.getAccessToken.mockReturnValue('invalid-token');

      // Attempt to verify the token
      const isValid = await userService.verifyAccessToken(
        '@admin:matrix.org',
        'invalid-token',
      );

      // Token should be invalid
      expect(isValid).toBe(false);

      // The client should be cleared from cache
      expect(clearClientsSpy).toHaveBeenCalled();

      // Re-initialize Axios mock for the next test
      mockMatrixClient.getAccessToken.mockReturnValue('admin-access-token');
    });

    it('should clear clients and get new token when sending message with invalid token', async () => {
      // Spy on methods
      const clearUserClientsSpy = jest.spyOn(userService, 'clearUserClients');
      const generateNewTokenSpy = jest.spyOn(
        userService,
        'generateNewAccessToken',
      );
      const createClientSpy = jest.spyOn(mockMatrixSdk, 'createClient');

      // Create a client in the cache
      await userService.getClientForUser('admin');

      // First attempt should succeed with valid token
      const eventId1 = await messageService.sendMessage({
        roomId: 'room-123',
        userId: '@admin:matrix.org',
        accessToken: 'admin-access-token',
        content: 'Test message',
      });

      expect(eventId1).toBe('event-123');

      // Now simulate token expiration
      mockMatrixClient.getAccessToken.mockReturnValue('invalid-token');

      // Mock axios to simulate token error first, then success with new token
      mockedAxios.get.mockImplementationOnce(() => {
        return Promise.reject({
          response: {
            status: 401,
            data: { errcode: 'M_UNKNOWN_TOKEN' },
          },
        });
      });

      // Mock successful token generation before sending
      jest
        .spyOn(userService, 'generateNewAccessToken')
        .mockResolvedValueOnce('new-token');

      // The next message should trigger token refresh and clear cached clients
      const eventId2 = await messageService.sendMessage({
        roomId: 'room-123',
        userId: '@admin:matrix.org',
        accessToken: 'invalid-token',
        content: 'Test message with refresh',
        tenantId: 'test-tenant',
      });

      // Should still get a successful message ID
      expect(eventId2).toBe('event-123');

      // Verify our methods were called
      expect(generateNewTokenSpy).toHaveBeenCalledWith('@admin:matrix.org');
      expect(clearUserClientsSpy).toHaveBeenCalledWith('admin', 'test-tenant');

      // Verify a new client was created with new token
      const createClientCalls = createClientSpy.mock.calls;
      const lastCall = createClientCalls[createClientCalls.length - 1];
      expect(lastCall[0]).toHaveProperty('accessToken');

      // Reset for next test
      mockMatrixClient.getAccessToken.mockReturnValue('admin-access-token');
    });

    it('should simulate the real-world token refresh scenario', async () => {
      // This test will simulate the real-world scenario:
      // 1. Create and cache a Matrix client
      // 2. Make the token invalid (expired)
      // 3. Try to use the client, which will fail
      // 4. Regenerate the token, but WITHOUT our fix the old client would still be used
      // 5. With our fix, the client is cleared from cache and recreated

      // Mock successful token generation
      jest
        .spyOn(userService, 'generateNewAccessToken')
        .mockImplementation(() => Promise.resolve('new-access-token'));

      // Prepare spies
      const clearUserClientsSpy = jest.spyOn(userService, 'clearUserClients');
      const createClientSpy = jest.spyOn(mockMatrixSdk, 'createClient');

      // Track spy calls before we start
      const initialCreateClientCalls = createClientSpy.mock.calls.length;

      // Step 1: Create and cache a Matrix client
      await userService.getClientForUser('admin');
      expect(createClientSpy).toHaveBeenCalledTimes(
        initialCreateClientCalls + 1,
      );

      // Step 2: Simulate token expiration
      mockMatrixClient.getAccessToken.mockReturnValue('invalid-token');

      // Mock the sendEvent function to simulate token error
      const originalSendEvent = mockMatrixClient.sendEvent;
      mockMatrixClient.sendEvent = jest.fn().mockImplementation(() => {
        // Return a Matrix-like token error
        return Promise.reject({
          errcode: 'M_UNKNOWN_TOKEN',
          error: 'Invalid access token',
        });
      });

      // Also mock axios to simulate token verification failure
      mockedAxios.get.mockImplementationOnce(() => {
        return Promise.reject({
          response: {
            status: 401,
            data: { errcode: 'M_UNKNOWN_TOKEN' },
          },
        });
      });

      // Preparation for message service to simulate token refresh
      let messageErrorThrown = false;
      try {
        // Step 3: Try to use the client, which will fail
        await messageService.sendMessage({
          roomId: 'room-123',
          userId: '@admin:matrix.org',
          accessToken: 'invalid-token',
          content: 'This message will fail',
          tenantId: 'test-tenant',
        });
      } catch (error) {
        messageErrorThrown = true;

        // We expect an error here because the first attempt should fail with invalid token
        expect(error.message).toContain('Failed to send message');
      }

      // Verify the error was thrown
      expect(messageErrorThrown).toBe(true);

      // Now let's verify our client was cleared
      expect(clearUserClientsSpy).toHaveBeenCalledWith('admin', 'test-tenant');

      // Reset mocks to simulate successful token refresh
      mockMatrixClient.sendEvent = originalSendEvent;
      mockMatrixClient.getAccessToken.mockReturnValue('new-access-token');

      // Step 4 & 5: Try sending a message again, with the new token
      // The client should have been recreated with new token
      const eventId3 = await messageService.sendMessage({
        roomId: 'room-123',
        userId: '@admin:matrix.org',
        accessToken: 'new-access-token',
        content: 'This message should succeed with new token',
        tenantId: 'test-tenant',
      });

      // Verify we got a message ID
      expect(eventId3).toBe('event-123');

      // Verify a new client was created (original + 2 more = 3 calls)
      expect(createClientSpy).toHaveBeenCalledTimes(
        initialCreateClientCalls + 3,
      );

      // WITHOUT our fix:
      // 1. Cached client would still be used with invalid token
      // 2. Multiple failures would occur until abandoned

      // WITH our fix:
      // 1. Client cache is cleared when token becomes invalid
      // 2. New client is created with new token
      // 3. Consistent behavior across all Matrix services
    });
  });
});
