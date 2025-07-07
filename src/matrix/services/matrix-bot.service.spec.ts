import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixBotService } from './matrix-bot.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixUserService } from './matrix-user.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { IMatrixClient } from '../types/matrix.interfaces';

describe('MatrixBotService', () => {
  let service: MatrixBotService;
  let mockMatrixCoreService: jest.Mocked<MatrixCoreService>;
  let mockMatrixClient: jest.Mocked<IMatrixClient>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const testTenantId = 'test-tenant-123';

  const mockBotConfig = {
    username: 'openmeet-bot',
    password: 'test-bot-password',
    displayName: 'OpenMeet Bot',
    serverName: 'matrix.openmeet.net',
    homeServerUrl: 'http://localhost:8448',
  };

  beforeEach(async () => {
    // Mock Matrix client
    mockMatrixClient = {
      startClient: jest.fn().mockResolvedValue(undefined),
      stopClient: jest.fn(),
      createRoom: jest
        .fn()
        .mockResolvedValue({ room_id: '!test:matrix.openmeet.net' }),
      invite: jest.fn().mockResolvedValue({}),
      kick: jest.fn().mockResolvedValue({}),
      joinRoom: jest.fn().mockResolvedValue({}),
      sendEvent: jest.fn().mockResolvedValue({ event_id: '$test123' }),
      sendStateEvent: jest.fn().mockResolvedValue({}),
      getJoinedRooms: jest.fn().mockResolvedValue({ joined_rooms: [] }),
      getRoom: jest.fn().mockReturnValue(null),
      getUserId: jest.fn().mockReturnValue('@openmeet-bot:matrix.openmeet.net'),
      getAccessToken: jest.fn().mockReturnValue('test-bot-token'),
      on: jest.fn(),
      removeListener: jest.fn(),
      roomState: jest.fn().mockResolvedValue([]),
      getStateEvent: jest.fn().mockResolvedValue({}),
      getProfileInfo: jest
        .fn()
        .mockResolvedValue({ displayname: 'OpenMeet Bot' }),
      setDisplayName: jest.fn().mockResolvedValue({}),
      sendTyping: jest.fn().mockResolvedValue({}),
    };

    // Mock MatrixCoreService
    mockMatrixCoreService = {
      getSdk: jest.fn().mockReturnValue({
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
      }),
    } as any;

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config = {
          ADMIN_EMAIL: 'admin@openmeet.net',
          ADMIN_PASSWORD: 'test-admin-password',
          'matrix.bot.username': mockBotConfig.username,
          'matrix.bot.displayName': mockBotConfig.displayName,
          'matrix.serverName': mockBotConfig.serverName,
          'matrix.baseUrl': mockBotConfig.homeServerUrl,
          matrix: {
            appservice: {
              token: 'test-appservice-token',
            },
          },
        };
        return config[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixBotService,
        {
          provide: MatrixCoreService,
          useValue: mockMatrixCoreService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MatrixUserService,
          useValue: {
            getClientForUser: jest.fn().mockResolvedValue(mockMatrixClient),
          },
        },
        {
          provide: MatrixBotUserService,
          useValue: {
            getOrCreateBotUser: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'openmeet-bot-test-tenant-123',
              email: 'bot-test-tenant-123@system.openmeet.net',
            }),
            needsPasswordRotation: jest.fn().mockResolvedValue(false),
            rotateBotPassword: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: 'USER_SERVICE_FOR_MATRIX',
          useValue: {
            findByEmail: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'admin-user',
              email: 'admin@openmeet.net',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MatrixBotService>(MatrixBotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Bot Authentication', () => {
    it('should authenticate bot with username and password', async () => {
      // Act
      await service.authenticateBot(testTenantId);

      // Assert
      // Now uses MatrixUserService.getClientForUser instead of direct SDK calls
      expect(service.isBotAuthenticated()).toBe(true);
    });

    it('should handle authentication failure gracefully', async () => {
      // Arrange - Create module with no AppService token to force OIDC auth failure
      const failingConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          const config = {
            ADMIN_EMAIL: 'admin@openmeet.net',
            ADMIN_PASSWORD: 'test-admin-password',
            'matrix.bot.username': mockBotConfig.username,
            'matrix.bot.displayName': mockBotConfig.displayName,
            'matrix.serverName': mockBotConfig.serverName,
            'matrix.baseUrl': mockBotConfig.homeServerUrl,
            matrix: {
              appservice: {
                token: '', // No token - should fall back to OIDC which will fail
              },
            },
          };
          return config[key];
        }),
      } as any;

      const failingModule: TestingModule = await Test.createTestingModule({
        providers: [
          MatrixBotService,
          {
            provide: MatrixCoreService,
            useValue: mockMatrixCoreService,
          },
          {
            provide: ConfigService,
            useValue: failingConfigService,
          },
          {
            provide: MatrixUserService,
            useValue: {
              getClientForUser: jest
                .fn()
                .mockRejectedValue(new Error('Invalid credentials')),
            },
          },
          {
            provide: MatrixBotUserService,
            useValue: {
              getOrCreateBotUser: jest.fn().mockResolvedValue({
                id: 1,
                slug: 'openmeet-bot-test-tenant-123',
                email: 'bot-test-tenant-123@system.openmeet.net',
              }),
              needsPasswordRotation: jest.fn().mockResolvedValue(false),
              rotateBotPassword: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: 'USER_SERVICE_FOR_MATRIX',
            useValue: {
              findByEmail: jest.fn().mockResolvedValue({
                id: 1,
                slug: 'admin-user',
                email: 'admin@openmeet.net',
              }),
            },
          },
        ],
      }).compile();

      const failingService =
        failingModule.get<MatrixBotService>(MatrixBotService);

      // Act & Assert
      await expect(
        failingService.authenticateBot(testTenantId),
      ).rejects.toThrow(
        'Matrix AppService authentication is required for bot operations',
      );
      expect(failingService.isBotAuthenticated()).toBe(false);
    });

    it('should return correct bot user ID', () => {
      // Act
      const botUserId = service.getBotUserId();

      // Assert
      expect(botUserId).toBe('@openmeet-bot:matrix.openmeet.net');
    });

    it('should indicate when bot is not authenticated', () => {
      // Act
      const isAuthenticated = service.isBotAuthenticated();

      // Assert
      expect(isAuthenticated).toBe(false);
    });
  });

  describe('Room Creation', () => {
    beforeEach(async () => {
      await service.authenticateBot(testTenantId);
    });

    it('should create a public room with basic options', async () => {
      // Arrange
      const roomOptions = {
        name: 'Test Event Room',
        topic: 'Discussion for Test Event',
        isPublic: true,
      };

      // Act
      const result = await service.createRoom(roomOptions, testTenantId);

      // Assert
      expect(mockMatrixClient.createRoom).toHaveBeenCalledWith({
        name: roomOptions.name,
        topic: roomOptions.topic,
        visibility: 'public',
        preset: 'public_chat',
        initial_state: [],
        invite: [],
        power_level_content_override: undefined,
      });
      expect(result).toEqual({
        roomId: '!test:matrix.openmeet.net',
        name: roomOptions.name,
        topic: roomOptions.topic,
        invitedMembers: [],
      });
    });

    it('should create a private room with invited users', async () => {
      // Arrange
      const roomOptions = {
        name: 'Test Private Room',
        isPublic: false,
        inviteUserIds: [
          '@user1:matrix.openmeet.net',
          '@user2:matrix.openmeet.net',
        ],
      };

      // Act
      const result = await service.createRoom(roomOptions, testTenantId);

      // Assert
      expect(mockMatrixClient.createRoom).toHaveBeenCalledWith({
        name: roomOptions.name,
        topic: undefined,
        visibility: 'private',
        preset: 'private_chat',
        initial_state: [],
        invite: roomOptions.inviteUserIds,
        power_level_content_override: undefined,
      });
      expect(result.invitedMembers).toEqual(roomOptions.inviteUserIds);
    });

    it('should create room with custom power levels', async () => {
      // Arrange
      const roomOptions = {
        name: 'Test Admin Room',
        isPublic: false,
        powerLevelContentOverride: {
          users: {
            '@admin:matrix.openmeet.net': 100,
          },
        },
      };

      // Act
      await service.createRoom(roomOptions, testTenantId);

      // Assert
      expect(mockMatrixClient.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          power_level_content_override: roomOptions.powerLevelContentOverride,
        }),
      );
    });

    it('should automatically authenticate when creating room if not authenticated', async () => {
      // Arrange
      const mockMatrixBotUserServiceForTest = {
        getOrCreateBotUser: jest.fn().mockResolvedValue({
          id: 1,
          slug: 'openmeet-bot-test-tenant-123',
          email: 'bot-test-tenant-123@system.openmeet.net',
        }),
        needsPasswordRotation: jest.fn().mockResolvedValue(false),
        rotateBotPassword: jest.fn().mockResolvedValue(undefined),
      };

      const mockUserServiceForTest = {
        findByEmail: jest.fn().mockResolvedValue({
          id: 1,
          slug: 'admin-user',
          email: 'admin@openmeet.net',
        }),
      };

      const unauthenticatedService = new MatrixBotService(
        mockMatrixCoreService,
        mockConfigService,
        mockMatrixBotUserServiceForTest as any,
        mockUserServiceForTest as any,
      );

      // Act
      const result = await unauthenticatedService.createRoom(
        {
          name: 'Test Room',
          isPublic: true,
        },
        testTenantId,
      );

      // Assert
      expect(result).toEqual({
        roomId: '!test:matrix.openmeet.net',
        name: 'Test Room',
        topic: undefined,
        invitedMembers: [],
      });
      expect(unauthenticatedService.isBotAuthenticated()).toBe(true);
    });
  });

  describe('User Management', () => {
    beforeEach(async () => {
      await service.authenticateBot(testTenantId);
    });

    it('should invite user to room', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const userId = '@user1:matrix.openmeet.net';

      // Act
      await service.inviteUser(roomId, userId, testTenantId);

      // Assert
      expect(mockMatrixClient.invite).toHaveBeenCalledWith(roomId, userId);
    });

    it('should remove user from room', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const userId = '@user1:matrix.openmeet.net';

      // Act
      await service.removeUser(roomId, userId, testTenantId);

      // Assert
      expect(mockMatrixClient.kick).toHaveBeenCalledWith(
        roomId,
        userId,
        'Removed by system',
      );
    });

    it('should handle invitation failures gracefully', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const userId = '@user1:matrix.openmeet.net';
      mockMatrixClient.invite.mockRejectedValueOnce(
        new Error('User not found'),
      );

      // Act & Assert
      await expect(
        service.inviteUser(roomId, userId, testTenantId),
      ).rejects.toThrow('User not found');
    });
  });

  describe('Permission Management', () => {
    beforeEach(async () => {
      await service.authenticateBot(testTenantId);
    });

    it('should sync user power levels', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const userPowerLevels = {
        '@admin:matrix.openmeet.net': 100,
        '@moderator:matrix.openmeet.net': 50,
        '@member:matrix.openmeet.net': 0,
      };

      // Act
      await service.syncPermissions(roomId, userPowerLevels, testTenantId);

      // Assert
      expect(mockMatrixClient.sendStateEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.power_levels',
        expect.objectContaining({
          users: userPowerLevels,
        }),
        '',
      );
    });

    it('should preserve existing power level settings when syncing', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const existingPowerLevels = {
        users_default: 0,
        events_default: 0,
        state_default: 50,
        ban: 50,
        kick: 50,
        redact: 50,
        invite: 50,
      };
      mockMatrixClient.getStateEvent.mockResolvedValueOnce(existingPowerLevels);

      const newUserPowerLevels = {
        '@admin:matrix.openmeet.net': 100,
      };

      // Act
      await service.syncPermissions(roomId, newUserPowerLevels, testTenantId);

      // Assert
      expect(mockMatrixClient.sendStateEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.power_levels',
        expect.objectContaining({
          ...existingPowerLevels,
          users: newUserPowerLevels,
        }),
        '',
      );
    });
  });

  describe('Messaging', () => {
    beforeEach(async () => {
      await service.authenticateBot(testTenantId);
    });

    it('should send message as bot', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const message = 'Welcome to the room!';

      // Act
      const eventId = await service.sendMessage(roomId, message, testTenantId);

      // Assert
      expect(mockMatrixClient.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        {
          msgtype: 'm.text',
          body: message,
        },
      );
      expect(eventId).toBe('$test123');
    });

    it('should handle message sending failures', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      const message = 'Test message';
      mockMatrixClient.sendEvent.mockRejectedValueOnce(
        new Error('Room not found'),
      );

      // Act & Assert
      await expect(
        service.sendMessage(roomId, message, testTenantId),
      ).rejects.toThrow('Room not found');
    });
  });

  describe('Room Management', () => {
    beforeEach(async () => {
      await service.authenticateBot(testTenantId);
    });

    it('should join room successfully', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';

      // Act
      await service.joinRoom(roomId, testTenantId);

      // Assert
      expect(mockMatrixClient.joinRoom).toHaveBeenCalledWith(roomId);
    });

    it('should check if bot is in room', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      mockMatrixClient.getJoinedRooms.mockResolvedValueOnce({
        joined_rooms: [roomId, '!other:matrix.openmeet.net'],
      });

      // Act
      const isInRoom = await service.isBotInRoom(roomId, testTenantId);

      // Assert
      expect(isInRoom).toBe(true);
    });

    it('should return false if bot is not in room', async () => {
      // Arrange
      const roomId = '!test:matrix.openmeet.net';
      mockMatrixClient.getJoinedRooms.mockResolvedValueOnce({
        joined_rooms: ['!other:matrix.openmeet.net'],
      });

      // Act
      const isInRoom = await service.isBotInRoom(roomId, testTenantId);

      // Assert
      expect(isInRoom).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should load bot configuration from ConfigService', () => {
      // Act
      const adminEmail = mockConfigService.get('ADMIN_EMAIL');
      const adminPassword = mockConfigService.get('ADMIN_PASSWORD');
      const username = mockConfigService.get('matrix.bot.username');
      const displayName = mockConfigService.get('matrix.bot.displayName');

      // Assert
      expect(adminEmail).toBe('admin@openmeet.net');
      expect(adminPassword).toBe('test-admin-password');
      expect(username).toBe('openmeet-bot');
      expect(displayName).toBe('OpenMeet Bot');
    });

    it('should construct correct bot user ID from configuration', () => {
      // Act
      const botUserId = service.getBotUserId();

      // Assert
      expect(botUserId).toBe('@openmeet-bot:matrix.openmeet.net');
    });

    it('should throw error if admin password is not configured', () => {
      // Arrange
      const mockConfigServiceWithoutPassword = {
        get: jest.fn().mockImplementation((key: string) => {
          const config = {
            ADMIN_EMAIL: 'admin@openmeet.net',
            ADMIN_PASSWORD: undefined, // Missing admin password
            'matrix.bot.username': 'openmeet-bot',
            'matrix.bot.displayName': 'OpenMeet Bot',
            'matrix.serverName': 'matrix.openmeet.net',
            'matrix.baseUrl': 'http://localhost:8448',
          };
          return config[key];
        }),
      } as any;

      // Act & Assert
      expect(() => {
        new MatrixBotService(
          mockMatrixCoreService,
          mockConfigServiceWithoutPassword,
          {
            getClientForUser: jest.fn().mockResolvedValue(mockMatrixClient),
          } as any,
          {
            getOrCreateBotUser: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'openmeet-bot-test-tenant-123',
              email: 'bot-test-tenant-123@system.openmeet.net',
            }),
            needsPasswordRotation: jest.fn().mockResolvedValue(false),
            rotateBotPassword: jest.fn().mockResolvedValue(undefined),
          } as any,
          {
            findByEmail: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'admin-user',
              email: 'admin@openmeet.net',
            }),
          } as any,
        );
      }).toThrow(
        'Admin password not configured. Set ADMIN_PASSWORD environment variable.',
      );
    });
  });
});
