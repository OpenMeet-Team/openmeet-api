import { Test, TestingModule } from '@nestjs/testing';
import { ChatRoomService } from './chat-room.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { MatrixCoreService } from '../../matrix/services/matrix-core.service';
import { MatrixBotService } from '../../matrix/services/matrix-bot.service';
import { UserService } from '../../user/user.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ElastiCacheService } from '../../elasticache/elasticache.service';
import {
  ChatRoomEntity,
  ChatRoomType,
  ChatRoomVisibility,
} from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { Repository } from 'typeorm';
import {
  EventAttendeePermission,
  EventAttendeeRole,
  GroupRole,
  GroupPermission,
} from '../../core/constants/constant';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';

describe('ChatRoomService', () => {
  let service: ChatRoomService;
  let matrixUserService: MatrixUserService;
  let matrixRoomService: MatrixRoomService;
  let userService: UserService;
  let groupMemberService: GroupMemberService;
  let eventAttendeeService: EventAttendeeService;
  let groupService: GroupService;
  let eventQueryService: EventQueryService;
  let elastiCacheService: ElastiCacheService;

  // Mock repositories
  let mockChatRoomRepository: Partial<Repository<ChatRoomEntity>>;
  let mockEventRepository: Partial<Repository<any>>;
  let mockGroupRepository: Partial<Repository<any>>;

  // Mock data
  const mockUserWithoutMatrix = {
    id: 1,
    ulid: 'USER123',
    firstName: 'Test',
    lastName: 'User',
    slug: 'test-user',
    email: 'test@example.com',
    matrixUserId: null,
    matrixAccessToken: null,
    matrixDeviceId: null,
  };

  const mockUserWithMatrix = {
    ...mockUserWithoutMatrix,
    matrixUserId: '@test_user123:matrix.openmeet.net',
    matrixAccessToken: 'matrix_token_abc123',
    matrixDeviceId: 'DEVICE_XYZ',
  };

  const mockMatrixUserInfo = {
    userId: '@test_user123:matrix.openmeet.net',
    accessToken: 'matrix_token_abc123',
    deviceId: 'DEVICE_XYZ',
  };

  const mockEvent = {
    id: 123,
    slug: 'test-event',
    name: 'Test Event',
    description: 'An event for testing',
    user: mockUserWithMatrix,
    createdBy: mockUserWithMatrix,
  };

  const mockGroup = {
    id: 456,
    slug: 'test-group',
    name: 'Test Group',
    description: 'A group for testing',
    createdBy: mockUserWithMatrix,
  };

  // Create partial mock objects that satisfy the interface but are not full entities
  const mockChatRoom = {
    id: 789,
    matrixRoomId: '!room123:matrix.openmeet.net',
    name: 'Test Room',
    topic: 'Test Topic',
    type: ChatRoomType.EVENT,
    visibility: ChatRoomVisibility.PUBLIC,
    eventId: mockEvent.id,
    event: mockEvent,
    creator: mockUserWithMatrix,
    creatorId: mockUserWithMatrix.id,
    settings: {
      historyVisibility: 'shared',
      guestAccess: false,
      requireInvitation: false,
      encrypted: false,
    },
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    group: null,
    groupId: null,
    user1Id: null,
    user2Id: null,
  };

  const mockGroupChatRoom = {
    id: 790,
    matrixRoomId: '!room456:matrix.openmeet.net',
    name: 'Test Group Room',
    topic: 'Test Group Topic',
    type: ChatRoomType.GROUP,
    visibility: ChatRoomVisibility.PUBLIC,
    groupId: mockGroup.id,
    group: mockGroup,
    creator: mockUserWithMatrix,
    creatorId: mockUserWithMatrix.id,
    settings: {
      historyVisibility: 'shared',
      guestAccess: false,
      requireInvitation: false,
      encrypted: false,
    },
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    event: null,
    eventId: null,
    user1Id: null,
    user2Id: null,
  };

  const mockDirectChatRoom = {
    id: 791,
    matrixRoomId: '!room789:matrix.openmeet.net',
    name: 'Direct Chat',
    topic: 'Direct conversation',
    type: ChatRoomType.DIRECT,
    visibility: ChatRoomVisibility.PRIVATE,
    user1Id: 1,
    user2Id: 2,
    creator: mockUserWithMatrix,
    creatorId: mockUserWithMatrix.id,
    settings: {
      historyVisibility: 'shared',
      guestAccess: false,
      requireInvitation: true,
      encrypted: true,
    },
    members: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    event: null,
    eventId: null,
    group: null,
    groupId: null,
  };

  const mockEventAttendee = {
    id: 555,
    eventId: mockEvent.id,
    userId: mockUserWithMatrix.id,
    role: {
      id: 1,
      name: EventAttendeeRole.Host,
      permissions: [{ name: EventAttendeePermission.ManageEvent }],
    },
    event: mockEvent,
    user: mockUserWithMatrix,
  };

  const mockGroupMember = {
    id: 666,
    groupId: mockGroup.id,
    userId: mockUserWithMatrix.id,
    groupRole: {
      id: 1,
      name: GroupRole.Owner,
      permissions: [{ name: GroupPermission.ManageGroup }],
    },
    group: mockGroup,
    user: mockUserWithMatrix,
  };

  const mockRequestCache = new Map();

  beforeEach(async () => {
    // Initialize mock repositories with proper types
    mockChatRoomRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          // Execute the callback directly without actual transaction
          return await callback(mockChatRoomRepository);
        }),
      },
    } as unknown as Repository<ChatRoomEntity>;

    mockEventRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          return await callback(mockEventRepository);
        }),
      },
    } as unknown as Repository<any>;

    mockGroupRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      save: jest.fn(),
      manager: {
        transaction: jest.fn(async (callback) => {
          return await callback(mockGroupRepository);
        }),
      },
    } as unknown as Repository<any>;

    // Create a custom provider for ChatRoomService to bypass the forwardRef
    const chatRoomServiceProvider = {
      provide: ChatRoomService,
      useFactory: (
        request,
        tenantConnectionService,
        matrixUserService,
        matrixRoomService,
        matrixMessageService,
        matrixCoreService,
        matrixBotService,
        userService,
        groupMemberService,
        eventAttendeeService,
        eventQueryService,
        groupService,
        elastiCacheService,
        globalMatrixValidationService,
      ) => {
        return new ChatRoomService(
          request,
          tenantConnectionService,
          matrixUserService,
          matrixRoomService,
          matrixMessageService,
          matrixCoreService,
          matrixBotService,
          userService,
          groupMemberService,
          eventAttendeeService,
          eventQueryService,
          groupService,
          elastiCacheService,
          globalMatrixValidationService,
        );
      },
      inject: [
        REQUEST,
        TenantConnectionService,
        MatrixUserService,
        MatrixRoomService,
        MatrixMessageService,
        MatrixCoreService,
        MatrixBotService,
        UserService,
        GroupMemberService,
        EventAttendeeService,
        EventQueryService,
        GroupService,
        ElastiCacheService,
        GlobalMatrixValidationService,
      ],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        chatRoomServiceProvider,
        {
          provide: MatrixUserService,
          useValue: {
            createUser: jest.fn().mockResolvedValue(mockMatrixUserInfo),
            getClientForUser: jest.fn().mockResolvedValue({
              userId: mockMatrixUserInfo.userId,
              accessToken: mockMatrixUserInfo.accessToken,
            }),
            setUserDisplayName: jest.fn().mockResolvedValue(true),
            getUserDisplayName: jest.fn().mockResolvedValue('Test User'),
            provisionMatrixUser: jest
              .fn()
              .mockResolvedValue(mockMatrixUserInfo),
          },
        },
        {
          provide: MatrixRoomService,
          useValue: {
            createRoom: jest.fn().mockResolvedValue({
              roomId: '!room123:matrix.openmeet.net',
              name: 'Test Room',
              topic: 'Test Topic',
              invitedMembers: [],
            }),
            inviteUser: jest.fn().mockResolvedValue(true),
            joinRoom: jest.fn().mockResolvedValue(true),
            setRoomPowerLevels: jest.fn().mockResolvedValue(true),
            removeUserFromRoom: jest.fn().mockResolvedValue(true),
            verifyRoomExists: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: MatrixMessageService,
          useValue: {
            sendMessage: jest.fn().mockResolvedValue('event-123'),
            getRoomMessages: jest.fn().mockResolvedValue({
              messages: [],
              end: 'end-token',
            }),
          },
        },
        {
          provide: MatrixCoreService,
          useValue: {
            getConfig: jest.fn().mockReturnValue({
              baseUrl: 'https://matrix.openmeet.net',
              serverName: 'matrix.openmeet.net',
              adminUserId: '@admin:matrix.openmeet.net',
            }),
          },
        },
        {
          provide: MatrixBotService,
          useValue: {
            createRoom: jest.fn().mockResolvedValue({
              roomId: '!room123:matrix.openmeet.net',
              name: 'Test Room',
              topic: 'Test Topic',
              invitedMembers: [],
            }),
            inviteUser: jest.fn().mockResolvedValue(true),
            authenticateBot: jest.fn().mockResolvedValue(undefined),
            isBotAuthenticated: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: UserService,
          useValue: {
            getUserById: jest.fn().mockImplementation((id) => {
              if (id === 1) return Promise.resolve(mockUserWithMatrix);
              if (id === 2) return Promise.resolve(mockUserWithoutMatrix);
              return Promise.resolve(null);
            }),
            update: jest.fn().mockResolvedValue(mockUserWithMatrix),
            getUserBySlug: jest.fn().mockImplementation((slug) => {
              if (slug === 'test-user')
                return Promise.resolve(mockUserWithMatrix);
              return Promise.resolve(null);
            }),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findEventBySlug: jest.fn().mockImplementation((slug) => {
              if (slug === 'test-event') return Promise.resolve(mockEvent);
              return Promise.resolve(null);
            }),
            findById: jest.fn().mockResolvedValue(mockEvent),
          },
        },
        {
          provide: 'EventQueryService',
          useValue: {
            findEventBySlug: jest.fn().mockImplementation((slug) => {
              if (slug === 'test-event') return Promise.resolve(mockEvent);
              return Promise.resolve(null);
            }),
            findById: jest.fn().mockResolvedValue(mockEvent),
          },
        },
        {
          provide: GroupService,
          useValue: {
            findGroupBySlug: jest.fn().mockImplementation((slug) => {
              if (slug === 'test-group') return Promise.resolve(mockGroup);
              return Promise.resolve(null);
            }),
            findOne: jest.fn().mockResolvedValue(mockGroup),
            update: jest.fn().mockResolvedValue(mockGroup),
          },
        },
        {
          provide: 'GroupService',
          useValue: {
            findGroupBySlug: jest.fn().mockImplementation((slug) => {
              if (slug === 'test-group') return Promise.resolve(mockGroup);
              return Promise.resolve(null);
            }),
            findOne: jest.fn().mockResolvedValue(mockGroup),
            update: jest.fn().mockResolvedValue(mockGroup),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            findGroupMemberByUserId: jest
              .fn()
              .mockImplementation((groupId, userId) => {
                if (
                  groupId === mockGroup.id &&
                  userId === mockUserWithMatrix.id
                ) {
                  return Promise.resolve(mockGroupMember);
                }
                return Promise.resolve(null);
              }),
          },
        },
        {
          provide: 'GroupMemberService',
          useValue: {
            findGroupMemberByUserId: jest
              .fn()
              .mockImplementation((groupId, userId) => {
                if (
                  groupId === mockGroup.id &&
                  userId === mockUserWithMatrix.id
                ) {
                  return Promise.resolve(mockGroupMember);
                }
                return Promise.resolve(null);
              }),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findEventAttendeeByUserId: jest
              .fn()
              .mockImplementation((eventId, userId) => {
                if (
                  eventId === mockEvent.id &&
                  userId === mockUserWithMatrix.id
                ) {
                  return Promise.resolve(mockEventAttendee);
                }
                return Promise.resolve(null);
              }),
          },
        },
        {
          provide: 'EventAttendeeService',
          useValue: {
            findEventAttendeeByUserId: jest
              .fn()
              .mockImplementation((eventId, userId) => {
                if (
                  eventId === mockEvent.id &&
                  userId === mockUserWithMatrix.id
                ) {
                  return Promise.resolve(mockEventAttendee);
                }
                return Promise.resolve(null);
              }),
          },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockImplementation(() => {
              return Promise.resolve({
                getRepository: jest.fn().mockImplementation((entity) => {
                  if (entity === ChatRoomEntity) return mockChatRoomRepository;
                  if (entity === 'EventEntity' || entity.name === 'EventEntity')
                    return mockEventRepository;
                  if (entity === 'GroupEntity' || entity.name === 'GroupEntity')
                    return mockGroupRepository;
                  return mockChatRoomRepository; // default
                }),
              });
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const config = {
                matrix: {
                  baseUrl: 'https://matrix.openmeet.net',
                  serverName: 'matrix.openmeet.net',
                },
              };

              const parts = key.split('.');
              let result = config;
              for (const part of parts) {
                result = result[part];
              }

              return result;
            }),
          },
        },
        {
          provide: REQUEST,
          useValue: {
            tenantId: 'default',
            chatRoomMembershipCache: {},
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
        {
          provide: ElastiCacheService,
          useValue: {
            getRedis: jest.fn().mockReturnValue({
              set: jest.fn().mockResolvedValue('OK'),
              del: jest.fn().mockResolvedValue(1),
            }),
            acquireLock: jest.fn().mockResolvedValue(true),
            releaseLock: jest.fn().mockResolvedValue(undefined),
            withLock: jest.fn().mockImplementation(async (key, fn) => {
              return await fn();
            }),
          },
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            getMatrixHandleForUser: jest.fn().mockResolvedValue(null), // No existing registry entry
            getUserByMatrixHandle: jest.fn().mockResolvedValue(null),
            isMatrixHandleUnique: jest.fn().mockResolvedValue(true),
            registerMatrixHandle: jest.fn().mockResolvedValue(undefined), // Successfully register
            suggestAvailableHandles: jest
              .fn()
              .mockResolvedValue(['testuser1', 'testuser2']),
          },
        },
      ],
    }).compile();

    // Use resolve() for scoped providers
    service = await module.resolve(ChatRoomService);

    // Use get() for non-scoped providers or mocks
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixRoomService = module.get<MatrixRoomService>(MatrixRoomService);
    userService = module.get<UserService>(UserService);
    groupMemberService = module.get<GroupMemberService>(GroupMemberService);
    eventAttendeeService =
      module.get<EventAttendeeService>(EventAttendeeService);
    groupService = module.get<GroupService>(GroupService);
    eventQueryService = module.get<EventQueryService>(EventQueryService);
    elastiCacheService = module.get<ElastiCacheService>(ElastiCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockRequestCache.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureUserHasMatrixCredentials', () => {
    it('should return existing user if Matrix credentials already exist', async () => {
      // Setup mock repository call
      mockChatRoomRepository.findOne = jest.fn().mockResolvedValue(null);

      // @ts-expect-error - calling private method
      const result = await service.ensureUserHasMatrixCredentials(1);

      // Should have called getUserById
      expect(userService.getUserById).toHaveBeenCalledWith(1);

      // Should not have called Matrix service or update
      expect(matrixUserService.createUser).not.toHaveBeenCalled();
      expect(userService.update).not.toHaveBeenCalled();

      // Should return the user with credentials
      expect(result).toEqual(mockUserWithMatrix);
    });

    it('should provision Matrix credentials if user does not have them', async () => {
      // Setup getUserById to return a user without Matrix credentials first, then with credentials after update
      (userService.getUserById as jest.Mock)
        .mockResolvedValueOnce(mockUserWithoutMatrix)
        .mockResolvedValueOnce(mockUserWithMatrix);

      // @ts-expect-error - calling private method
      const result = await service.ensureUserHasMatrixCredentials(2);

      // Should have called getUserById - the first call gets user without credentials, the second call gets the updated user
      expect(userService.getUserById).toHaveBeenCalledWith(2);

      // Should have called provisionMatrixUser, not createUser directly
      expect(matrixUserService.provisionMatrixUser).toHaveBeenCalledWith(
        mockUserWithoutMatrix,
        'default',
      );

      // Should have updated user with Matrix credentials
      expect(userService.update).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          matrixUserId: mockMatrixUserInfo.userId,
          matrixAccessToken: mockMatrixUserInfo.accessToken,
          matrixDeviceId: mockMatrixUserInfo.deviceId,
        }),
        'default', // tenantId parameter
      );

      // Should return user with Matrix credentials
      expect(result).toEqual(mockUserWithMatrix);
    });
  });

  describe('getOrCreateEventChatRoom', () => {
    it('should return existing chat room if one exists', async () => {
      // Setup mock repository call to return existing room
      mockChatRoomRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockChatRoom);

      const result = await service.getOrCreateEventChatRoom(mockEvent.id);

      // Should have called the repository's findOne
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { event: { id: mockEvent.id } },
        }),
      );

      // Should not have created a new room
      expect(mockChatRoomRepository.create).not.toHaveBeenCalled();
      expect(matrixRoomService.createRoom).not.toHaveBeenCalled();

      // Should return the existing room
      expect(result).toEqual(mockChatRoom);
    });

    it('should create a new chat room if none exists', async () => {
      // Setup mock repository calls
      mockChatRoomRepository.findOne = jest.fn().mockResolvedValue(null);
      mockEventRepository.findOne = jest.fn().mockResolvedValue(mockEvent);
      mockChatRoomRepository.create = jest.fn().mockReturnValue(mockChatRoom);
      mockChatRoomRepository.save = jest.fn().mockResolvedValue(mockChatRoom);

      // Setup Matrix createRoom
      (matrixRoomService.createRoom as jest.Mock).mockResolvedValueOnce({
        roomId: '!room123:matrix.openmeet.net',
        name: 'Test Room',
      });

      // Mock the method that creates the chat room - we need to cast to any to avoid type issues
      jest
        .spyOn(service, 'createEventChatRoom')
        .mockResolvedValue(mockChatRoom as any);

      const result = await service.getOrCreateEventChatRoom(mockEvent.id);

      // Should have called findOne to check if room exists
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { event: { id: mockEvent.id } },
        }),
      );

      // Should return the new chat room
      expect(result).toEqual(mockChatRoom);
    });
  });

  describe('getOrCreateGroupChatRoom', () => {
    it('should return existing group chat room if one exists', async () => {
      // Setup mock repository call to return existing room
      mockChatRoomRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockGroupChatRoom);

      const result = await service.getOrCreateGroupChatRoom(mockGroup.id);

      // Should have called the repository's findOne
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { group: { id: mockGroup.id } },
        }),
      );

      // Should not have created a new room
      expect(mockChatRoomRepository.create).not.toHaveBeenCalled();
      expect(matrixRoomService.createRoom).not.toHaveBeenCalled();

      // Should not have called the GroupService since we found an existing room
      expect(groupService.findOne).not.toHaveBeenCalled();

      // Should return the existing room
      expect(result).toEqual(mockGroupChatRoom);
    });

    it('should use Redis lock for group chat room creation', async () => {
      // Setup test mocks
      mockChatRoomRepository.findOne = jest.fn().mockResolvedValue(null);

      // Create a function to track if the inside of withLock was executed
      let lockFunctionExecuted = false;

      // Mock the elastiCacheService.withLock method to run the callback but track execution
      (elastiCacheService.withLock as jest.Mock).mockImplementationOnce(
        async (_lockKey, _callback) => {
          lockFunctionExecuted = true;
          await Promise.resolve(); // Add await to fix require-await error
          return mockGroupChatRoom; // Return a mock result
        },
      );

      // Call createGroupChatRoom which should use the Redis lock
      const result = await service.createGroupChatRoom(
        mockGroup.id,
        mockUserWithMatrix.id,
      );

      // Verify withLock was called
      expect(elastiCacheService.withLock).toHaveBeenCalled();

      // Verify our lock function was executed
      expect(lockFunctionExecuted).toBe(true);

      // Verify we got the expected result
      expect(result).toEqual(mockGroupChatRoom);
    });
  });

  describe('getOrCreateDirectChatRoom', () => {
    it('should return existing direct chat room if one exists', async () => {
      // Setup mock repository's queryBuilder to return existing room
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockDirectChatRoom]),
      };
      mockChatRoomRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getOrCreateDirectChatRoom(1, 2);

      // Should have called createQueryBuilder to find rooms
      expect(mockChatRoomRepository.createQueryBuilder).toHaveBeenCalledWith(
        'chatRoom',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'chatRoom.type = :type',
        { type: ChatRoomType.DIRECT },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(chatRoom.user1Id = :user1Id AND chatRoom.user2Id = :user2Id) OR (chatRoom.user1Id = :user2Id AND chatRoom.user2Id = :user1Id)',
        { user1Id: 1, user2Id: 2 },
      );

      // Should not have created a new room
      expect(mockChatRoomRepository.create).not.toHaveBeenCalled();
      expect(matrixRoomService.createRoom).not.toHaveBeenCalled();

      // Should return the existing room
      expect(result).toEqual(mockDirectChatRoom);
    });

    it('should create a new direct chat room if none exists', async () => {
      // Setup mock repository to not find existing room
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockChatRoomRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);
      mockChatRoomRepository.create = jest
        .fn()
        .mockReturnValue(mockDirectChatRoom);
      mockChatRoomRepository.save = jest
        .fn()
        .mockResolvedValue(mockDirectChatRoom);

      // Setup Matrix createRoom
      (matrixRoomService.createRoom as jest.Mock).mockResolvedValueOnce({
        roomId: '!room789:matrix.openmeet.net',
        name: 'Direct Chat',
      });

      // We need to spy on ensureUserHasMatrixCredentials since it's used in the method
      jest
        .spyOn(service as any, 'ensureUserHasMatrixCredentials')
        .mockResolvedValue(mockUserWithMatrix);

      const result = await service.getOrCreateDirectChatRoom(1, 2);

      // Should have called createQueryBuilder to find rooms
      expect(mockChatRoomRepository.createQueryBuilder).toHaveBeenCalledWith(
        'chatRoom',
      );

      // Should have called getUserById to get both users
      expect(userService.getUserById).toHaveBeenCalledWith(1);
      expect(userService.getUserById).toHaveBeenCalledWith(2);

      // Should have called ensureUserHasMatrixCredentials for the first user
      expect(
        (service as any).ensureUserHasMatrixCredentials,
      ).toHaveBeenCalledWith(1);

      // Should have called Matrix service to create room
      expect(matrixRoomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          isDirect: true,
          isPublic: false,
        }),
        'default', // tenant ID parameter
      );

      // Should have created and saved a new ChatRoomEntity with user1Id and user2Id
      expect(mockChatRoomRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ChatRoomType.DIRECT,
          visibility: ChatRoomVisibility.PRIVATE,
          user1Id: 1,
          user2Id: 2,
        }),
      );
      expect(mockChatRoomRepository.save).toHaveBeenCalled();

      // Should return the new chat room
      expect(result).toEqual(mockDirectChatRoom);
    });
  });

  describe('getEventChatRoomBySlug', () => {
    it('should find a chat room by event slug', async () => {
      // Setup mocks
      mockChatRoomRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockChatRoom);

      const result = await service.getEventChatRoomBySlug('test-event');

      // Should have called EventQueryService to find the event by slug
      expect(eventQueryService.findEventBySlug).toHaveBeenCalledWith(
        'test-event',
      );

      // Should have called ChatRoomRepository.findOne with the event ID
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { event: { id: mockEvent.id } },
          relations: ['creator', 'event'],
        }),
      );

      // Should return the chat room
      expect(result).toEqual(mockChatRoom);
    });

    it('should return null if event is not found', async () => {
      // Setup EventQueryService mock to return null
      (eventQueryService.findEventBySlug as jest.Mock).mockResolvedValueOnce(
        null,
      );

      const result = await service.getEventChatRoomBySlug('non-existent-event');

      // Should have called EventQueryService to find the event by slug
      expect(eventQueryService.findEventBySlug).toHaveBeenCalledWith(
        'non-existent-event',
      );

      // Should not have tried to find a chat room
      expect(mockChatRoomRepository.findOne).not.toHaveBeenCalled();

      // Should return null
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Setup EventQueryService mock to throw an error
      (eventQueryService.findEventBySlug as jest.Mock).mockRejectedValueOnce(
        new Error('Test error'),
      );

      const result = await service.getEventChatRoomBySlug('error-event');

      // Should have called EventQueryService to find the event by slug
      expect(eventQueryService.findEventBySlug).toHaveBeenCalledWith(
        'error-event',
      );

      // Should return null
      expect(result).toBeNull();
    });
  });

  describe('getGroupChatRoomBySlug', () => {
    it('should find a chat room by group slug', async () => {
      // Setup mocks
      mockChatRoomRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockGroupChatRoom);

      const result = await service.getGroupChatRoomBySlug('test-group');

      // Should have called GroupService to find the group by slug
      expect(groupService.findGroupBySlug).toHaveBeenCalledWith('test-group');

      // Should have called ChatRoomRepository.findOne with the group ID
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { group: { id: mockGroup.id } },
          relations: ['creator', 'group'],
        }),
      );

      // Should return the chat room
      expect(result).toEqual(mockGroupChatRoom);
    });

    it('should return null if group is not found', async () => {
      // Setup GroupService mock to return null
      (groupService.findGroupBySlug as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getGroupChatRoomBySlug('non-existent-group');

      // Should have called GroupService to find the group by slug
      expect(groupService.findGroupBySlug).toHaveBeenCalledWith(
        'non-existent-group',
      );

      // Should not have tried to find a chat room
      expect(mockChatRoomRepository.findOne).not.toHaveBeenCalled();

      // Should return null
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      // Setup GroupService mock to throw an error
      (groupService.findGroupBySlug as jest.Mock).mockRejectedValueOnce(
        new Error('Test error'),
      );

      const result = await service.getGroupChatRoomBySlug('error-group');

      // Should have called GroupService to find the group by slug
      expect(groupService.findGroupBySlug).toHaveBeenCalledWith('error-group');

      // Should return null
      expect(result).toBeNull();
    });
  });

  describe('Slug-based methods', () => {
    it('should add user to event chat room by slugs', async () => {
      // We shouldn't be mocking our service methods, but we should mock all the dependencies
      // so the real service methods can be tested

      // Mock the necessary service methods needed by addUserToEventChatRoom
      (userService.getUserBySlug as jest.Mock).mockResolvedValue(
        mockUserWithMatrix,
      );
      (eventQueryService.findEventBySlug as jest.Mock).mockResolvedValue(
        mockEvent,
      );
      (
        eventAttendeeService.findEventAttendeeByUserId as jest.Mock
      ).mockResolvedValue(mockEventAttendee);

      // Mock getChatRoomForEvent to return a mock chat room
      jest.spyOn(service as any, 'getChatRoomForEvent').mockResolvedValue({
        ...mockChatRoom,
        matrixRoomId: 'test-matrix-room-id',
      });

      // Mock the ensureUserHasMatrixCredentials method
      jest
        .spyOn(service as any, 'ensureUserHasMatrixCredentials')
        .mockResolvedValue(mockUserWithMatrix);

      // Mock the chatRoomRepository.findOne method
      mockChatRoomRepository.findOne = jest.fn().mockResolvedValue({
        ...mockChatRoom,
        matrixRoomId: 'test-matrix-room-id',
        members: [],
      });

      // Mock matrixRoomService methods
      matrixRoomService.verifyRoomExists = jest.fn().mockResolvedValue(true);
      jest.spyOn(service as any, 'addUserToMatrixRoom').mockResolvedValue(true);

      // Run the test
      await service.addUserToEventChatRoom('test-event', 'test-user');

      // Verify the right methods were called
      expect(eventQueryService.findEventBySlug).toHaveBeenCalledWith(
        'test-event',
      );
      expect(userService.getUserBySlug).toHaveBeenCalledWith('test-user');
    });

    it('should add user to group chat room by slugs', async () => {
      // We shouldn't be mocking our service methods, but we should mock all the dependencies
      // so the real service methods can be tested

      // Mock the necessary service methods needed by addUserToGroupChatRoom
      (userService.getUserBySlug as jest.Mock).mockResolvedValue(
        mockUserWithMatrix,
      );
      (groupService.findGroupBySlug as jest.Mock).mockResolvedValue(mockGroup);
      (
        groupMemberService.findGroupMemberByUserId as jest.Mock
      ).mockResolvedValue(mockGroupMember);

      // Mock the chatRoomRepository.findOne and save methods
      mockChatRoomRepository.findOne = jest.fn().mockResolvedValue({
        ...mockChatRoom,
        matrixRoomId: 'test-matrix-room-id',
        group: mockGroup,
        members: [],
      });
      mockChatRoomRepository.save = jest.fn().mockResolvedValue(mockChatRoom);

      // Mock lower-level matrix methods
      jest.spyOn(matrixRoomService, 'joinRoom').mockResolvedValue(undefined);

      // Run the test
      await service.addUserToGroupChatRoom('test-group', 'test-user');

      // Verify the right methods were called
      expect(groupService.findGroupBySlug).toHaveBeenCalledWith('test-group');
      expect(userService.getUserBySlug).toHaveBeenCalledWith('test-user');
    });
  });
});
