import { Test, TestingModule } from '@nestjs/testing';
import { MatrixTokenManagerService } from './matrix-token-manager.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MatrixTokenManagerService - Integration Tests for Token Regeneration', () => {
  let service: MatrixTokenManagerService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock setInterval to prevent real timers
    jest.spyOn(global, 'setInterval').mockReturnValue(123 as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MatrixTokenManagerService,
          useFactory: () => {
            // Create service manually to avoid constructor issues
            const configService = {
              get: jest.fn().mockReturnValue({
                baseUrl: 'https://matrix.example.org',
                serverName: 'example.org',
                adminUser: 'admin',
                adminPassword: 'test-password',
                adminAccessToken: '',
                defaultDeviceId: 'OPENMEET_SERVER',
                defaultInitialDeviceDisplayName: 'OpenMeet Server',
              }),
            };

            const eventEmitter = { emit: jest.fn() };

            return new MatrixTokenManagerService(
              configService as any,
              eventEmitter as any,
            );
          },
        },
      ],
    }).compile();

    service = module.get<MatrixTokenManagerService>(MatrixTokenManagerService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('reportTokenInvalid - Core Fix', () => {
    it('should wait for token regeneration and return success status', async () => {
      // Setup: Mock successful login response
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-token-123',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Test: Call reportTokenInvalid and wait for completion
      const result = await service.reportTokenInvalid();

      // Verify: Should return true for successful regeneration
      expect(result).toBe(true);

      // Verify: Token should be updated
      expect(service.getAdminToken()).toBe('new-token-123');
      expect(service.getAdminTokenState()).toBe('valid');
    });

    it('should return false when token regeneration fails', async () => {
      // Setup: Mock failed login response
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      // Test: Call reportTokenInvalid
      const result = await service.reportTokenInvalid();

      // Verify: Should return false for failed regeneration
      expect(result).toBe(false);
      expect(service.getAdminTokenState()).toBe('invalid');
    });

    it('should handle concurrent regeneration requests', async () => {
      // Setup: Mock successful login response
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'concurrent-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Test: Start two regeneration requests concurrently
      const promise1 = service.reportTokenInvalid();
      const promise2 = service.reportTokenInvalid();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Verify: One should succeed, other should be skipped
      expect(result1 || result2).toBe(true); // At least one succeeds
      expect(result1 && result2).toBe(false); // Not both succeed

      // Should only make one API call despite concurrent requests
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Matrix Client Operations Integration', () => {
    it('should demonstrate the fix for withAdminClient retry logic', async () => {
      // This test demonstrates how the MatrixClientOperationsService
      // now waits for token regeneration instead of fire-and-forget

      // Setup: Mock token regeneration
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'retry-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Simulate the pattern: operation fails, token is regenerated, operation retries

      // Step 1: Report invalid token (this is what happens when operation fails with 401)
      const regenerationResult = await service.reportTokenInvalid();
      expect(regenerationResult).toBe(true);

      // Step 2: Get fresh token for retry (this is what the retry logic does)
      const freshToken = service.getAdminToken();
      expect(freshToken).toBe('retry-token');

      // This test verifies that:
      // 1. reportTokenInvalid() waits for completion (returns boolean)
      // 2. Fresh token is immediately available for retry
      // 3. No race conditions between regeneration and retry
    });
  });

  describe('Token State Management', () => {
    it('should properly track token states during regeneration', async () => {
      // Initial state should be invalid (no token set)
      expect(service.getAdminTokenState()).toBe('invalid');

      // Mock successful regeneration
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'state-test-token',
          user_id: '@admin:example.org',
          device_id: 'OPENMEET_SERVER',
        },
      });

      // Start regeneration
      const resultPromise = service.reportTokenInvalid();

      // During regeneration, state might be 'regenerating' or 'invalid'
      // (depends on timing, but should not be 'valid' yet)
      expect(['regenerating', 'invalid']).toContain(
        service.getAdminTokenState(),
      );

      // Wait for completion
      const result = await resultPromise;
      expect(result).toBe(true);

      // After completion, state should be valid
      expect(service.getAdminTokenState()).toBe('valid');
      expect(service.getAdminToken()).toBe('state-test-token');
    });
  });
});
