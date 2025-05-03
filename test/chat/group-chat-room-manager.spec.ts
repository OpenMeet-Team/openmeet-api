import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ChatRoomManagerInterface } from '../../src/chat/interfaces/chat-room-manager.interface';
import { GroupEntity } from '../../src/group/persistence/relational/entities/group.entity';
import { UserEntity } from '../../src/user/infrastructure/persistence/relational/entities/user.entity';
import { ChatRoomEntity } from '../../src/chat/infrastructure/persistence/relational/entities/chat-room.entity';
import { TenantConnectionService } from '../../src/tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ChatModule } from '../../src/chat/chat.module';
import { MockMatrixService } from '../mocks/matrix-service.mock';
import { MatrixCoreService } from '../../src/matrix/services/matrix-core.service';
import { TESTING_TENANT_ID } from '../utils/constants';

/**
 * Integration tests for ChatRoomManagerInterface group operations
 *
 * These tests validate the tenant-aware, group-specific operations of the
 * ChatRoomManagerInterface implementation.
 */
describe('ChatRoomManagerInterface - Group Operations', () => {
  let app: INestApplication;
  let chatRoomManager: ChatRoomManagerInterface;
  let userRepository: Repository<UserEntity>;
  let groupRepository: Repository<GroupEntity>;
  let chatRoomRepository: Repository<ChatRoomEntity>;
  let mockMatrixService: MockMatrixService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _tenantConnectionService: TenantConnectionService;

  // Test data
  let testUser: UserEntity;
  let testUser2: UserEntity;
  let testGroup: GroupEntity;

  // Matrix room ID for the test
  const TEST_MATRIX_ROOM_ID = '!test-room-id:matrix.org';

  beforeAll(async () => {
    // Create a mock implementation of MatrixCoreService
    mockMatrixService = new MockMatrixService();

    // Configure test module
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), ChatModule],
      providers: [
        {
          provide: MatrixCoreService,
          useValue: mockMatrixService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'matrix.homeserver')
                return 'https://matrix.test.server';
              return null;
            }),
          },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn(() => {
              return {
                getRepository: jest.fn((entity) => {
                  if (entity === UserEntity) return userRepository;
                  if (entity === GroupEntity) return groupRepository;
                  if (entity === ChatRoomEntity) return chatRoomRepository;
                  return null;
                }),
              };
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Get the ChatRoomManagerInterface instance
    chatRoomManager = moduleRef.get<ChatRoomManagerInterface>(
      'ChatRoomManagerInterface',
    );
    _tenantConnectionService = moduleRef.get<TenantConnectionService>(
      TenantConnectionService,
    );

    // Setup mock repositories
    userRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as Repository<UserEntity>;

    groupRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as Repository<GroupEntity>;

    chatRoomRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getMany: jest.fn(),
      }),
    } as unknown as Repository<ChatRoomEntity>;

    // Create test users
    testUser = {
      id: 1,
      slug: 'test-user',
      username: 'testuser',
      email: 'test@example.com',
      matrixUserId: '@test:matrix.org',
      matrixAccessToken: 'test-token',
      firstName: 'Test',
      lastName: 'User',
    } as UserEntity;

    testUser2 = {
      id: 2,
      slug: 'test-user-2',
      username: 'testuser2',
      email: 'test2@example.com',
      matrixUserId: '@test2:matrix.org',
      matrixAccessToken: 'test-token-2',
      firstName: 'Test',
      lastName: 'User 2',
    } as UserEntity;

    // Create test group
    testGroup = {
      id: 1,
      slug: 'test-group',
      name: 'Test Group',
      description: 'A test group for integration tests',
      matrixRoomId: TEST_MATRIX_ROOM_ID,
      isPublic: true,
      createdBy: testUser,
    } as GroupEntity;

    // Setup mock responses
    (userRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where.id === testUser.id) return Promise.resolve(testUser);
      if (where.id === testUser2.id) return Promise.resolve(testUser2);
      return Promise.resolve(null);
    });

    (groupRepository.findOne as jest.Mock).mockImplementation(({ where }) => {
      if (where.id === testGroup.id) return Promise.resolve(testGroup);
      return Promise.resolve(null);
    });

    // Setup mock Matrix API responses
    mockMatrixService.createRoom.mockResolvedValue({
      room_id: TEST_MATRIX_ROOM_ID,
    });
    mockMatrixService.inviteUserToRoom.mockResolvedValue({
      room_id: TEST_MATRIX_ROOM_ID,
    });
    mockMatrixService.joinRoom.mockResolvedValue({
      room_id: TEST_MATRIX_ROOM_ID,
    });
    mockMatrixService.leaveRoom.mockResolvedValue({
      room_id: TEST_MATRIX_ROOM_ID,
    });
    mockMatrixService.getRoomMembers.mockResolvedValue([testUser.matrixUserId]);
    mockMatrixService.deleteRoom.mockResolvedValue(true);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('ensureGroupChatRoom', () => {
    it('should create a new group chat room when one does not exist', async () => {
      // Setup: Chat room doesn't exist yet
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Setup: New chat room saved successfully
      const newChatRoom = {
        id: 1,
        name: 'Test Group Chat',
        entityType: 'group',
        entityId: testGroup.id,
        matrixRoomId: TEST_MATRIX_ROOM_ID,
        isPrivate: false,
      } as ChatRoomEntity;
      (chatRoomRepository.save as jest.Mock).mockResolvedValue(newChatRoom);

      // Execute
      const result = await chatRoomManager.ensureGroupChatRoom(
        testGroup.id,
        testUser.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(result).toBeDefined();
      expect(result.matrixRoomId).toBe(TEST_MATRIX_ROOM_ID);
      expect(mockMatrixService.createRoom).toHaveBeenCalled();
      expect(chatRoomRepository.save).toHaveBeenCalled();
    });

    it('should return existing chat room if one already exists', async () => {
      // Setup: Chat room already exists
      const existingChatRoom = {
        id: 1,
        name: 'Test Group Chat',
        entityType: 'group',
        entityId: testGroup.id,
        matrixRoomId: TEST_MATRIX_ROOM_ID,
        isPrivate: false,
      } as ChatRoomEntity;
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(
        existingChatRoom,
      );

      // Execute
      const result = await chatRoomManager.ensureGroupChatRoom(
        testGroup.id,
        testUser.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(result).toBeDefined();
      expect(result.id).toBe(existingChatRoom.id);
      expect(result.matrixRoomId).toBe(TEST_MATRIX_ROOM_ID);
      expect(mockMatrixService.createRoom).not.toHaveBeenCalled();
    });
  });

  describe('addUserToGroupChatRoom', () => {
    let chatRoom: ChatRoomEntity;

    beforeEach(() => {
      // Setup test chat room
      chatRoom = {
        id: 1,
        name: 'Test Group Chat',
        entityType: 'group',
        entityId: testGroup.id,
        matrixRoomId: TEST_MATRIX_ROOM_ID,
        isPrivate: false,
      } as ChatRoomEntity;

      // Reset mock calls
      mockMatrixService.inviteUserToRoom.mockClear();
      mockMatrixService.joinRoom.mockClear();

      // Setup: Chat room exists
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(chatRoom);
    });

    it('should add a user to an existing group chat room', async () => {
      // Execute
      await chatRoomManager.addUserToGroupChatRoom(
        testGroup.id,
        testUser2.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.inviteUserToRoom).toHaveBeenCalledWith(
        TEST_MATRIX_ROOM_ID,
        testUser2.matrixUserId,
        expect.any(String),
      );

      expect(mockMatrixService.joinRoom).toHaveBeenCalledWith(
        TEST_MATRIX_ROOM_ID,
        testUser2.matrixUserId,
        expect.any(String),
      );
    });

    it('should create a chat room if one does not exist', async () => {
      // Setup: Chat room doesn't exist yet
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      // Setup: New chat room saved successfully
      (chatRoomRepository.save as jest.Mock).mockResolvedValue(chatRoom);

      // Execute
      await chatRoomManager.addUserToGroupChatRoom(
        testGroup.id,
        testUser2.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.createRoom).toHaveBeenCalled();
      expect(mockMatrixService.inviteUserToRoom).toHaveBeenCalled();
      expect(mockMatrixService.joinRoom).toHaveBeenCalled();
    });
  });

  describe('removeUserFromGroupChatRoom', () => {
    let chatRoom: ChatRoomEntity;

    beforeEach(() => {
      // Setup test chat room
      chatRoom = {
        id: 1,
        name: 'Test Group Chat',
        entityType: 'group',
        entityId: testGroup.id,
        matrixRoomId: TEST_MATRIX_ROOM_ID,
        isPrivate: false,
      } as ChatRoomEntity;

      // Reset mock calls
      mockMatrixService.leaveRoom.mockClear();

      // Setup: Chat room exists
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(chatRoom);
    });

    it('should remove a user from a group chat room', async () => {
      // Execute
      await chatRoomManager.removeUserFromGroupChatRoom(
        testGroup.id,
        testUser2.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.leaveRoom).toHaveBeenCalledWith(
        TEST_MATRIX_ROOM_ID,
        testUser2.matrixUserId,
        expect.any(String),
      );
    });

    it('should handle gracefully if chat room does not exist', async () => {
      // Setup: Chat room doesn't exist
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Execute
      await chatRoomManager.removeUserFromGroupChatRoom(
        testGroup.id,
        testUser2.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.leaveRoom).not.toHaveBeenCalled();
    });
  });

  describe('deleteGroupChatRooms', () => {
    let chatRooms: ChatRoomEntity[];

    beforeEach(() => {
      // Setup test chat rooms
      chatRooms = [
        {
          id: 1,
          name: 'Test Group Chat 1',
          entityType: 'group',
          entityId: testGroup.id,
          matrixRoomId: `${TEST_MATRIX_ROOM_ID}-1`,
          isPrivate: false,
        } as ChatRoomEntity,
        {
          id: 2,
          name: 'Test Group Chat 2',
          entityType: 'group',
          entityId: testGroup.id,
          matrixRoomId: `${TEST_MATRIX_ROOM_ID}-2`,
          isPrivate: true,
        } as ChatRoomEntity,
      ];

      // Reset mock calls
      mockMatrixService.deleteRoom.mockClear();

      // Setup: Chat rooms exist
      (chatRoomRepository.find as jest.Mock).mockResolvedValue(chatRooms);
    });

    it('should delete all chat rooms for a group', async () => {
      // Execute
      await chatRoomManager.deleteGroupChatRooms(
        testGroup.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.deleteRoom).toHaveBeenCalledTimes(
        chatRooms.length,
      );
      expect(chatRoomRepository.delete).toHaveBeenCalled();
      expect(groupRepository.update).toHaveBeenCalledWith(testGroup.id, {
        matrixRoomId: null,
      });
    });

    it('should handle gracefully if no chat rooms exist', async () => {
      // Setup: No chat rooms exist
      (chatRoomRepository.find as jest.Mock).mockResolvedValue([]);

      // Execute
      await chatRoomManager.deleteGroupChatRooms(
        testGroup.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(mockMatrixService.deleteRoom).not.toHaveBeenCalled();
      expect(chatRoomRepository.delete).not.toHaveBeenCalled();
      expect(groupRepository.update).toHaveBeenCalledWith(testGroup.id, {
        matrixRoomId: null,
      });
    });
  });

  describe('isUserInGroupChatRoom', () => {
    let chatRoom: ChatRoomEntity;

    beforeEach(() => {
      // Setup test chat room
      chatRoom = {
        id: 1,
        name: 'Test Group Chat',
        entityType: 'group',
        entityId: testGroup.id,
        matrixRoomId: TEST_MATRIX_ROOM_ID,
        isPrivate: false,
      } as ChatRoomEntity;

      // Setup: Chat room exists
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(chatRoom);
    });

    it('should return true if user is in the group chat room', async () => {
      // Setup: Matrix API returns that the user is a member
      mockMatrixService.getRoomMembers.mockResolvedValue([
        testUser.matrixUserId,
      ]);

      // Execute
      const result = await chatRoomManager.isUserInGroupChatRoom(
        testGroup.id,
        testUser.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(result).toBe(true);
      expect(mockMatrixService.getRoomMembers).toHaveBeenCalledWith(
        TEST_MATRIX_ROOM_ID,
        expect.any(String),
      );
    });

    it('should return false if user is not in the group chat room', async () => {
      // Setup: Matrix API returns that the user is not a member
      mockMatrixService.getRoomMembers.mockResolvedValue([
        testUser2.matrixUserId,
      ]);

      // Execute
      const result = await chatRoomManager.isUserInGroupChatRoom(
        testGroup.id,
        testUser.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(result).toBe(false);
    });

    it('should return false if chat room does not exist', async () => {
      // Setup: Chat room doesn't exist
      (chatRoomRepository.findOne as jest.Mock).mockResolvedValue(null);

      // Execute
      const result = await chatRoomManager.isUserInGroupChatRoom(
        testGroup.id,
        testUser.id,
        TESTING_TENANT_ID,
      );

      // Verify
      expect(result).toBe(false);
      expect(mockMatrixService.getRoomMembers).not.toHaveBeenCalled();
    });
  });
});
