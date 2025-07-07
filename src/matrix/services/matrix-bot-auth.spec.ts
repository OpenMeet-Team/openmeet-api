import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixBotService } from './matrix-bot.service';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixUserService } from './matrix-user.service';
import { MatrixBotUserService } from './matrix-bot-user.service';

describe('MatrixBotService - Authentication Integration Tests', () => {
  let service: MatrixBotService;
  let configService: ConfigService;
  let matrixCoreService: MatrixCoreService;
  let matrixUserService: MatrixUserService;
  let matrixBotUserService: MatrixBotUserService;

  const testTenantId = 'lsdfaopkljdfs';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixBotService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: any) => {
                const config = {
                  ADMIN_EMAIL: 'admin@openmeet.net',
                  ADMIN_PASSWORD: 'test-password',
                  'matrix.bot.username': 'openmeet-admin-bot',
                  'matrix.bot.displayName': 'OpenMeet Admin Bot',
                  'matrix.serverName': 'matrix.openmeet.net',
                  'matrix.baseUrl': 'http://localhost:8448',
                  matrix: {
                    appservice: {
                      token:
                        process.env.MATRIX_APPSERVICE_TOKEN ||
                        'test-appservice-token',
                      hsToken:
                        process.env.MATRIX_APPSERVICE_HS_TOKEN ||
                        'test-hs-token',
                      id:
                        process.env.MATRIX_APPSERVICE_ID ||
                        'test-appservice-id',
                      url:
                        process.env.MATRIX_APPSERVICE_URL ||
                        'http://localhost:3000/api/matrix/appservice',
                    },
                  },
                };
                return config[key] || defaultValue;
              }),
          },
        },
        {
          provide: MatrixCoreService,
          useValue: {
            getSdk: jest.fn().mockReturnValue({
              createClient: jest.fn().mockReturnValue({
                setDisplayName: jest.fn().mockResolvedValue({}),
                createRoom: jest
                  .fn()
                  .mockResolvedValue({ room_id: '!test:matrix.openmeet.net' }),
                invite: jest.fn().mockResolvedValue({}),
                kick: jest.fn().mockResolvedValue({}),
                joinRoom: jest.fn().mockResolvedValue({}),
                sendEvent: jest
                  .fn()
                  .mockResolvedValue({ event_id: '$test123' }),
                getJoinedRooms: jest
                  .fn()
                  .mockResolvedValue({ joined_rooms: [] }),
                roomState: jest.fn().mockResolvedValue([]),
                getStateEvent: jest.fn().mockResolvedValue({}),
                sendStateEvent: jest.fn().mockResolvedValue({}),
              }),
              Visibility: {
                Public: 'public',
                Private: 'private',
              },
              Preset: {
                PublicChat: 'public_chat',
                PrivateChat: 'private_chat',
              },
            }),
          },
        },
        {
          provide: MatrixUserService,
          useValue: {
            getClientForUser: jest.fn().mockResolvedValue({
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
            }),
          },
        },
        {
          provide: MatrixBotUserService,
          useValue: {
            getOrCreateBotUser: jest.fn().mockResolvedValue({
              slug: `openmeet-bot-${testTenantId}`,
              email: `bot-${testTenantId}@openmeet.net`,
            }),
            needsPasswordRotation: jest.fn().mockResolvedValue(false),
            rotateBotPassword: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: 'USER_SERVICE_FOR_MATRIX',
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<MatrixBotService>(MatrixBotService);
    configService = module.get<ConfigService>(ConfigService);
    matrixCoreService = module.get<MatrixCoreService>(MatrixCoreService);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixBotUserService =
      module.get<MatrixBotUserService>(MatrixBotUserService);
  });

  describe('AppService Authentication', () => {
    it('should authenticate bot with Application Service token', async () => {
      // This should use AppService authentication since token is configured
      await service.authenticateBot(testTenantId);

      expect(service.isBotAuthenticated()).toBe(true);
      expect(matrixBotUserService.getOrCreateBotUser).toHaveBeenCalledWith(
        testTenantId,
      );
    });

    it('should create room using AppService authentication', async () => {
      await service.authenticateBot(testTenantId);

      const roomOptions = {
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
        inviteUserIds: ['@user1:matrix.openmeet.net'],
      };

      const result = await service.createRoom(roomOptions, testTenantId);

      expect(result.roomId).toBe('!test:matrix.openmeet.net');
      expect(result.name).toBe('Test Room');
    });

    it('should invite user to room using AppService authentication', async () => {
      await service.authenticateBot(testTenantId);

      const roomId = '!test:matrix.openmeet.net';
      const userId = '@user1:matrix.openmeet.net';

      await expect(
        service.inviteUser(roomId, userId, testTenantId),
      ).resolves.not.toThrow();
    });

    it('should kick user from room using AppService authentication', async () => {
      await service.authenticateBot(testTenantId);

      const roomId = '!test:matrix.openmeet.net';
      const userId = '@user1:matrix.openmeet.net';

      await expect(
        service.removeUser(roomId, userId, testTenantId),
      ).resolves.not.toThrow();
    });

    it('should send message to room using AppService authentication', async () => {
      await service.authenticateBot(testTenantId);

      const roomId = '!test:matrix.openmeet.net';
      const message = 'Test message from bot';

      const eventId = await service.sendMessage(roomId, message, testTenantId);

      expect(eventId).toBe('$test123');
    });
  });

  describe('AppService Authentication Requirement', () => {
    beforeEach(() => {
      // Mock no AppService token to test authentication requirement
      configService.get = jest
        .fn()
        .mockImplementation((key: string, defaultValue?: any) => {
          const config = {
            ADMIN_EMAIL: 'admin@openmeet.net',
            ADMIN_PASSWORD: 'test-password',
            'matrix.bot.username': 'openmeet-admin-bot',
            'matrix.bot.displayName': 'OpenMeet Admin Bot',
            'matrix.serverName': 'matrix.openmeet.net',
            'matrix.homeServer': 'http://localhost:8448',
            matrix: {
              appservice: {
                token: '', // No token - forces OIDC fallback
              },
            },
          };
          return config[key] || defaultValue;
        });
    });

    it('should require AppService authentication when token not available', async () => {
      // Create new service instance with no AppService token
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MatrixBotService,
          {
            provide: ConfigService,
            useValue: configService,
          },
          {
            provide: MatrixCoreService,
            useValue: matrixCoreService,
          },
          {
            provide: MatrixUserService,
            useValue: matrixUserService,
          },
          {
            provide: MatrixBotUserService,
            useValue: matrixBotUserService,
          },
          {
            provide: 'USER_SERVICE_FOR_MATRIX',
            useValue: {},
          },
        ],
      }).compile();

      const service = module.get<MatrixBotService>(MatrixBotService);

      // Should throw error requiring AppService authentication
      await expect(service.authenticateBot(testTenantId)).rejects.toThrow(
        'Matrix AppService authentication is required for bot operations',
      );

      expect(service.isBotAuthenticated()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication failures gracefully', async () => {
      // Mock authentication failure
      matrixBotUserService.getOrCreateBotUser = jest
        .fn()
        .mockRejectedValue(new Error('Authentication failed'));

      await expect(service.authenticateBot(testTenantId)).rejects.toThrow(
        'Authentication failed',
      );
      expect(service.isBotAuthenticated()).toBe(false);
    });

    it('should handle room creation failures gracefully', async () => {
      await service.authenticateBot(testTenantId);

      // Mock room creation failure
      const sdk = matrixCoreService.getSdk();
      const mockClient = sdk.createClient();
      mockClient.createRoom = jest
        .fn()
        .mockRejectedValue(new Error('Room creation failed'));

      const roomOptions = {
        name: 'Test Room',
        topic: 'Test Topic',
        isPublic: false,
      };

      await expect(
        service.createRoom(roomOptions, testTenantId),
      ).rejects.toThrow();
    });
  });
});
