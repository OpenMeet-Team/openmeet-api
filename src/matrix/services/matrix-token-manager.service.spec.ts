import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatrixTokenManagerService } from './matrix-token-manager.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixTokenManagerService', () => {
  let service: MatrixTokenManagerService;
  let eventEmitter: EventEmitter2;

  const mockConfig = {
    baseUrl: 'https://matrix.example.org',
    serverName: 'example.org',
    adminUser: 'admin',
    adminPassword: 'test-password',
    adminAccessToken: '',
    defaultDeviceId: 'OPENMEET_SERVER',
    defaultInitialDeviceDisplayName: 'OpenMeet Server',
    connectionPoolSize: 10,
    connectionPoolTimeout: 30000,
    connectionRetryAttempts: 3,
    connectionRetryDelay: 1000,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock setInterval to prevent real timers
    jest.spyOn(global, 'setInterval').mockImplementation(() => {
      return 123 as unknown as NodeJS.Timeout;
    });

    // Mock environment variables to prevent real config from interfering
    process.env.MATRIX_ADMIN_USERNAME = 'admin';
    process.env.MATRIX_ADMIN_PASSWORD = 'test-password';
    process.env.MATRIX_SERVER_NAME = 'example.org';
    process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.org';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixTokenManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockConfig),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixTokenManagerService>(MatrixTokenManagerService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Prevent the service from running onModuleInit during tests
    jest.spyOn(service, 'onModuleInit').mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up environment variables
    delete process.env.MATRIX_ADMIN_USERNAME;
    delete process.env.MATRIX_ADMIN_PASSWORD;
    delete process.env.MATRIX_SERVER_NAME;
    delete process.env.MATRIX_HOMESERVER_URL;
  });

  describe('reportTokenInvalid', () => {
    it('should wait for token regeneration to complete and return true on success', async () => {
      // Mock successful login response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-admin-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Call reportTokenInvalid and wait for completion
      const result = await service.reportTokenInvalid();

      // Should return true indicating successful regeneration
      expect(result).toBe(true);

      // Should emit token updated event
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'matrix.admin.token.updated',
        expect.objectContaining({
          token: 'new-admin-token',
          userId: expect.stringContaining('admin'),
        }),
      );

      // Token should be updated
      expect(service.getAdminToken()).toBe('new-admin-token');
      expect(service.getAdminTokenState()).toBe('valid');
    });

    it('should return false if token regeneration fails', async () => {
      // Mock failed login response
      mockedAxios.post.mockRejectedValueOnce(new Error('Login failed'));

      // Call reportTokenInvalid
      const result = await service.reportTokenInvalid();

      // Should return false indicating failed regeneration
      expect(result).toBe(false);

      // Token state should be invalid
      expect(service.getAdminTokenState()).toBe('invalid');
    });

    it('should prevent duplicate regeneration attempts', async () => {
      // Mock successful login response
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'new-admin-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Start first regeneration (don't await yet)
      const promise1 = service.reportTokenInvalid();

      // Start second regeneration immediately
      const promise2 = service.reportTokenInvalid();

      // Wait for both to complete
      const [result1, result2] = await Promise.all([promise1, promise2]);

      // First call should succeed, second should return false (already in progress)
      expect(result1).toBe(true);
      expect(result2).toBe(false);

      // Should only have made one login request
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should prevent thrashing by limiting regeneration frequency', async () => {
      // Mock successful login responses
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'new-admin-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // First regeneration should succeed
      const result1 = await service.reportTokenInvalid();
      expect(result1).toBe(true);

      // Immediately try again - should be blocked due to 30-second cooldown
      const result2 = await service.reportTokenInvalid();
      expect(result2).toBe(false);

      // Should only have made one login request
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('forceTokenRegeneration', () => {
    it('should regenerate token even if recently regenerated', async () => {
      // Mock successful login responses
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'forced-new-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // First regeneration
      await service.reportTokenInvalid();
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);

      // Force regeneration should work even if recently regenerated
      const result = await service.forceTokenRegeneration();
      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Token should be updated to forced value
      expect(service.getAdminToken()).toBe('forced-new-token');
    });
  });

  describe('admin token verification', () => {
    it('should verify valid token', async () => {
      // Set up service with a token
      (service as any).adminAccessToken = 'valid-token';
      (service as any).adminTokenState = 'valid';

      // Mock successful whoami response
      mockedAxios.get.mockResolvedValueOnce({
        data: { user_id: '@admin:example.org' },
      });

      // Call private method via reflection
      const result = await (service as any).verifyAdminToken();

      expect(result).toBe(true);
      expect(service.getAdminTokenState()).toBe('valid');
    });

    it('should regenerate token when verification fails', async () => {
      // Reset service state
      (service as any).adminAccessToken = 'invalid-token';
      (service as any).adminTokenState = 'invalid';
      (service as any).lastAdminTokenRefresh = 0;

      // Mock failed whoami response
      mockedAxios.get.mockRejectedValueOnce(
        new Error('Token verification failed'),
      );

      // Mock successful regeneration
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'regenerated-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Call private method via reflection
      const result = await (service as any).verifyAdminToken();

      expect(result).toBe(false); // Verification failed, but regeneration was triggered

      // Wait a bit for the async regeneration to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now check that regeneration was called
      expect(mockedAxios.post).toHaveBeenCalled(); // Regeneration was called
    });
  });

  describe('user token management', () => {
    it('should generate and cache user tokens', async () => {
      // Reset service state completely
      (service as any).adminAccessToken = 'admin-token';
      (service as any).adminTokenState = 'valid';
      (service as any).lastAdminTokenRefresh = Date.now();
      (service as any).userTokens.clear();

      // Mock successful admin API response for user token generation
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'user-token-123' },
      });

      const token = await service.getValidUserToken(
        '@user:example.org',
        'tenant1',
      );

      expect(token).toBe('user-token-123');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'matrix.user.token.updated',
        {
          userId: '@user:example.org',
          token: 'user-token-123',
          tenantId: 'tenant1',
        },
      );
    });

    it('should return cached valid user token', async () => {
      // Set up admin token
      (service as any).adminAccessToken = 'admin-token';
      (service as any).adminTokenState = 'valid';

      // Mock successful responses
      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'user-token-123' },
      });

      // First call should generate token
      const token1 = await service.getValidUserToken(
        '@user:example.org',
        'tenant1',
      );
      expect(token1).toBe('user-token-123');

      // Mock token verification as valid (within 1 hour)
      const now = Date.now();
      (service as any).userTokens.set('tenant1:@user:example.org', {
        token: 'user-token-123',
        state: 'valid',
        lastVerified: now - 1000, // 1 second ago
        deviceId: 'device123',
      });

      // Second call should return cached token without API call
      const token2 = await service.getValidUserToken(
        '@user:example.org',
        'tenant1',
      );
      expect(token2).toBe('user-token-123');

      // Should only have made one API call
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should invalidate user token', () => {
      // Set up a cached token
      (service as any).userTokens.set('@user:example.org', {
        token: 'user-token-123',
        state: 'valid',
        lastVerified: Date.now(),
        deviceId: 'device123',
      });

      service.invalidateUserToken('@user:example.org');

      const tokenData = (service as any).userTokens.get('@user:example.org');
      expect(tokenData.state).toBe('invalid');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'matrix.user.token.invalidated',
        {
          userId: '@user:example.org',
          tenantId: undefined,
        },
      );
    });
  });
});
