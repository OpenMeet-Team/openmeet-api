import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixBotService } from './matrix-bot.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { IMatrixClient } from '../types/matrix.interfaces';

/**
 * Matrix Bot Authentication Patterns Analysis & Unit Tests
 *
 * This test suite identifies and validates multiple authentication patterns
 * found in the OpenMeet Matrix bot implementation, documenting conflicts
 * and inconsistencies that may cause the historical messages access issue.
 *
 * Authentication Patterns Found:
 * 1. Application Service Authentication (Primary - Required)
 * 2. OIDC Authentication (Fallback - Deprecated)
 * 3. Admin User Fallback (Legacy)
 * 4. Direct Access Token (Admin API)
 * 5. Bot User Credentials (Per-tenant)
 *
 * Key Issues Identified:
 * - Multiple authentication methods with unclear precedence
 * - Inconsistent credential management across services
 * - Silent failures in authentication fallback chain
 * - Lack of validation for Application Service token requirements
 */
describe('MatrixBotService - Authentication Patterns Analysis', () => {
  let service: MatrixBotService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockMatrixCoreService: jest.Mocked<MatrixCoreService>;
  let mockMatrixBotUserService: jest.Mocked<MatrixBotUserService>;
  let mockMatrixClient: jest.Mocked<IMatrixClient>;

  const TEST_TENANT_ID = 'test-tenant-123';
  const TEST_BOT_USER = {
    id: 1,
    slug: 'openmeet-bot-test-tenant-123',
    email: 'bot-test-tenant-123@openmeet.net',
    tenantId: 'test-tenant-123',
  };

  beforeEach(async () => {
    // Mock Matrix client with all required methods
    mockMatrixClient = {
      setDisplayName: jest.fn().mockResolvedValue({}),
      createRoom: jest
        .fn()
        .mockResolvedValue({ room_id: '!test:matrix.openmeet.net' }),
      invite: jest.fn().mockResolvedValue({}),
      kick: jest.fn().mockResolvedValue({}),
      joinRoom: jest.fn().mockResolvedValue({}),
      sendEvent: jest.fn().mockResolvedValue({ event_id: '$test123' }),
      getJoinedRooms: jest.fn().mockResolvedValue({ joined_rooms: [] }),
      roomState: jest.fn().mockResolvedValue([]),
      getStateEvent: jest.fn().mockResolvedValue({}),
      sendStateEvent: jest.fn().mockResolvedValue({}),
    } as any;

    mockMatrixCoreService = {
      getSdk: jest.fn().mockReturnValue({
        createClient: jest.fn().mockReturnValue(mockMatrixClient),
        Visibility: { Public: 'public', Private: 'private' },
        Preset: { PublicChat: 'public_chat', PrivateChat: 'private_chat' },
      }),
    } as any;

    mockMatrixBotUserService = {
      getOrCreateBotUser: jest.fn().mockResolvedValue(TEST_BOT_USER),
      findBotUser: jest.fn().mockResolvedValue(TEST_BOT_USER),
      needsPasswordRotation: jest.fn().mockResolvedValue(false),
      rotateBotPassword: jest.fn().mockResolvedValue(undefined),
      getBotUserWithFallback: jest.fn().mockResolvedValue(TEST_BOT_USER),
    } as any;

    // Default config with all authentication methods configured
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, options?: any) => {
        const configs = {
          // Admin credentials (used by bot)
          ADMIN_EMAIL: 'admin@openmeet.net',
          ADMIN_PASSWORD: 'admin-password',

          // Matrix configuration
          'matrix.bot.username': 'openmeet-admin-bot',
          'matrix.bot.displayName': 'OpenMeet Admin Bot',
          'matrix.serverName': 'matrix.openmeet.net',
          'matrix.baseUrl': 'http://localhost:8448',

          // Application Service config (primary authentication)
          'matrix.appservice.id': 'openmeet-bot',
          matrix: {
            appservice: {
              token: 'test-appservice-token',
              hsToken: 'test-hs-token',
              id: 'openmeet-bot',
              url: 'http://localhost:3000/api/matrix/appservice',
            },
          },
        };

        if (options?.infer) {
          return configs[key] || options.defaultValue || undefined;
        }
        return configs[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixBotService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MatrixCoreService, useValue: mockMatrixCoreService },
        { provide: MatrixBotUserService, useValue: mockMatrixBotUserService },
        { provide: 'USER_SERVICE_FOR_MATRIX', useValue: {} },
      ],
    }).compile();

    service = module.get<MatrixBotService>(MatrixBotService);
  });

  describe('Authentication Pattern 1: Application Service Authentication (Primary)', () => {
    it('should use AppService authentication when token is configured', async () => {
      // TDD: This test should pass - AppService auth is the primary method
      await service.authenticateBot(TEST_TENANT_ID);

      expect(service.isBotAuthenticated()).toBe(true);
      expect(mockMatrixBotUserService.getOrCreateBotUser).toHaveBeenCalledWith(
        TEST_TENANT_ID,
      );
      expect(mockMatrixCoreService.getSdk).toHaveBeenCalled();

      // Verify Matrix client was created with AppService token
      const sdk = mockMatrixCoreService.getSdk();
      expect(sdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://localhost:8448',
          accessToken: 'test-appservice-token',
          userId: '@openmeet-bot-test-tenant-123:matrix.openmeet.net',
          localTimeoutMs: 30000,
          useAuthorizationHeader: true,
        }),
      );
    });

    it('should create tenant-specific bot user ID for AppService authentication', async () => {
      await service.authenticateBot(TEST_TENANT_ID);

      const sdk = mockMatrixCoreService.getSdk();
      expect(sdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '@openmeet-bot-test-tenant-123:matrix.openmeet.net',
        }),
      );
    });

    it('should fail when AppService token is missing', () => {
      // TDD: This test should fail initially, then pass after we fix the config validation
      const configWithoutAppService = {
        get: jest.fn().mockImplementation((key: string, options?: any) => {
          const configs = {
            ADMIN_EMAIL: 'admin@openmeet.net',
            ADMIN_PASSWORD: 'admin-password',
            'matrix.bot.username': 'openmeet-admin-bot',
            'matrix.bot.displayName': 'OpenMeet Admin Bot',
            'matrix.serverName': 'matrix.openmeet.net',
            'matrix.baseUrl': 'http://localhost:8448',
            matrix: {
              appservice: {
                token: '', // Empty token
                hsToken: 'test-hs-token',
                id: 'test-appservice-id',
                url: 'http://localhost:3000/api/matrix/appservice',
              },
            },
          };

          if (options?.infer) {
            return configs[key] || options.defaultValue || undefined;
          }
          return configs[key];
        }),
      };

      // Test that the service constructor throws when AppService token is missing
      expect(() => {
        new MatrixBotService(
          mockMatrixCoreService,
          configWithoutAppService as any,
          mockMatrixBotUserService,
        );
      }).toThrow(
        'Matrix Application Service authentication is required. Please configure MATRIX_APPSERVICE_TOKEN environment variable.',
      );
    });
  });

  describe('Authentication Pattern 2: OIDC Authentication (Deprecated Fallback)', () => {
    it('should reject OIDC authentication when AppService is not configured', () => {
      // TDD: This documents the current behavior - OIDC is no longer supported
      const configWithoutAppService = {
        get: jest.fn().mockImplementation((key: string, options?: any) => {
          const configs = {
            ADMIN_EMAIL: 'admin@openmeet.net',
            ADMIN_PASSWORD: 'admin-password',
            'matrix.bot.username': 'openmeet-admin-bot',
            'matrix.bot.displayName': 'OpenMeet Admin Bot',
            'matrix.serverName': 'matrix.openmeet.net',
            'matrix.baseUrl': 'http://localhost:8448',
            matrix: {
              appservice: {
                token: null, // No AppService token
              },
            },
          };

          if (options?.infer) {
            return configs[key] || options.defaultValue || undefined;
          }
          return configs[key];
        }),
      };

      // Test that the service constructor throws when AppService token is missing
      expect(() => {
        new MatrixBotService(
          mockMatrixCoreService,
          configWithoutAppService as any,
          mockMatrixBotUserService,
        );
      }).toThrow(
        'Matrix Application Service authentication is required. Please configure MATRIX_APPSERVICE_TOKEN environment variable.',
      );
    });
  });

  describe('Authentication Pattern 4: Bot User Credentials (Per-tenant)', () => {
    it('should create tenant-specific bot users for authentication', async () => {
      await service.authenticateBot(TEST_TENANT_ID);

      expect(mockMatrixBotUserService.getOrCreateBotUser).toHaveBeenCalledWith(
        TEST_TENANT_ID,
      );
      expect(service.isBotAuthenticated()).toBe(true);
    });

    it('should handle bot user creation failures', async () => {
      // TDD: This test should fail initially if error handling is missing
      mockMatrixBotUserService.getOrCreateBotUser.mockRejectedValue(
        new Error('Bot user creation failed'),
      );

      await expect(service.authenticateBot(TEST_TENANT_ID)).rejects.toThrow(
        'Bot user creation failed',
      );
      expect(service.isBotAuthenticated()).toBe(false);
    });

    it('should use bot user slug in Matrix user ID format', async () => {
      await service.authenticateBot(TEST_TENANT_ID);

      const sdk = mockMatrixCoreService.getSdk();
      expect(sdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: '@openmeet-bot-test-tenant-123:matrix.openmeet.net',
        }),
      );
    });
  });

  describe('Authentication Pattern 5: Configuration Validation', () => {
    it('should validate Matrix homeserver URL configuration', () => {
      // TDD: This test should fail if homeserver URL validation is missing
      mockConfigService.get.mockImplementation((key: string, options?: any) => {
        const configs = {
          ADMIN_EMAIL: 'admin@openmeet.net',
          ADMIN_PASSWORD: 'admin-password',
          'matrix.bot.username': 'openmeet-admin-bot',
          'matrix.bot.displayName': 'OpenMeet Admin Bot',
          'matrix.serverName': 'matrix.openmeet.net',
          'matrix.baseUrl': null, // Missing homeserver URL
          matrix: {
            appservice: {
              token: 'test-appservice-token',
            },
          },
        };

        if (options?.infer) {
          return configs[key] || options.defaultValue || undefined;
        }
        return configs[key];
      });

      expect(() => {
        new MatrixBotService(
          mockMatrixCoreService,
          mockConfigService,
          mockMatrixBotUserService,
        );
      }).toThrow('Matrix homeserver URL not configured');
    });

    it('should detect Application Service authentication availability', async () => {
      await service.authenticateBot(TEST_TENANT_ID);

      // The service should use AppService authentication
      expect(mockMatrixCoreService.getSdk).toHaveBeenCalled();
      expect(mockMatrixBotUserService.getOrCreateBotUser).toHaveBeenCalledWith(
        TEST_TENANT_ID,
      );
    });
  });

  describe('Authentication Conflicts and Inconsistencies', () => {
    it('should identify conflicting authentication methods', async () => {
      // TDD: This test documents the current conflict between multiple auth methods

      // The service constructor loads both admin credentials and AppService config
      // But only uses one authentication method at runtime

      // This creates potential conflicts in configuration
      await service.authenticateBot(TEST_TENANT_ID);

      // Should use AppService authentication, not admin credentials
      expect(mockMatrixCoreService.getSdk).toHaveBeenCalled();

      // Should not fall back to OIDC authentication
      // (documented by the requirement for AppService token)
      expect(service.isBotAuthenticated()).toBe(true);
    });

    it('should handle authentication method precedence correctly', async () => {
      // TDD: This test documents the expected authentication precedence

      // 1. Application Service (primary)
      // 2. OIDC (deprecated - should fail)
      // 3. Admin fallback (legacy - should not be used for bot auth)

      await service.authenticateBot(TEST_TENANT_ID);

      // Should use AppService authentication
      const sdk = mockMatrixCoreService.getSdk();
      expect(sdk.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'test-appservice-token',
          useAuthorizationHeader: true,
        }),
      );
    });

    it('should fail gracefully when multiple authentication methods are misconfigured', async () => {
      // TDD: This test should fail initially if error handling is incomplete

      // Simulate configuration where multiple auth methods are partially configured
      mockConfigService.get.mockImplementation((key: string, options?: any) => {
        const configs = {
          ADMIN_EMAIL: 'admin@openmeet.net',
          ADMIN_PASSWORD: 'admin-password',
          'matrix.bot.username': 'openmeet-admin-bot',
          'matrix.bot.displayName': 'OpenMeet Admin Bot',
          'matrix.serverName': 'matrix.openmeet.net',
          'matrix.baseUrl': 'http://localhost:8448',
          matrix: {
            appservice: {
              token: 'test-appservice-token',
              hsToken: '', // Missing HS token
              id: '', // Missing ID
              url: '', // Missing URL
            },
          },
        };

        if (options?.infer) {
          return configs[key] || options.defaultValue || undefined;
        }
        return configs[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MatrixBotService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MatrixCoreService, useValue: mockMatrixCoreService },
          { provide: MatrixBotUserService, useValue: mockMatrixBotUserService },
          { provide: 'USER_SERVICE_FOR_MATRIX', useValue: {} },
        ],
      }).compile();

      const serviceWithPartialConfig =
        module.get<MatrixBotService>(MatrixBotService);

      // Should still work with just the AppService token for bot operations
      await serviceWithPartialConfig.authenticateBot(TEST_TENANT_ID);
      expect(serviceWithPartialConfig.isBotAuthenticated()).toBe(true);
    });
  });

  describe('Bot User ID Generation', () => {
    it('should generate bot user IDs with tenant ID when not authenticated', () => {
      const botUserId = service.getBotUserId(TEST_TENANT_ID);
      expect(botUserId).toBe(
        '@openmeet-bot-test-tenant-123:matrix.openmeet.net',
      );
    });

    it('should return authenticated bot user ID when available', async () => {
      await service.authenticateBot(TEST_TENANT_ID);
      const botUserId = service.getBotUserId();
      expect(botUserId).toBe(
        '@openmeet-bot-test-tenant-123:matrix.openmeet.net',
      );
    });

    it('should throw error when no authentication and no tenant ID provided', () => {
      expect(() => {
        service.getBotUserId();
      }).toThrow('No bot authenticated and no tenantId provided');
    });
  });

  describe('Authentication State Management', () => {
    it('should track authentication state correctly', async () => {
      expect(service.isBotAuthenticated()).toBe(false);

      await service.authenticateBot(TEST_TENANT_ID);
      expect(service.isBotAuthenticated()).toBe(true);
    });

    it('should reset authentication state on failure', async () => {
      mockMatrixBotUserService.getOrCreateBotUser.mockRejectedValue(
        new Error('Authentication failed'),
      );

      await expect(service.authenticateBot(TEST_TENANT_ID)).rejects.toThrow();
      expect(service.isBotAuthenticated()).toBe(false);
    });

    it('should handle re-authentication correctly', async () => {
      // First authentication
      await service.authenticateBot(TEST_TENANT_ID);
      expect(service.isBotAuthenticated()).toBe(true);

      // Second authentication should not fail
      await service.authenticateBot(TEST_TENANT_ID);
      expect(service.isBotAuthenticated()).toBe(true);
    });
  });
});
