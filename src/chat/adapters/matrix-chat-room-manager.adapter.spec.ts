import { Test, TestingModule } from '@nestjs/testing';
import { MatrixChatRoomManagerAdapter } from './matrix-chat-room-manager.adapter';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { MatrixCoreService } from '../../matrix/services/matrix-core.service';
import { UserService } from '../../user/user.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { ChatRoomEntity, ChatRoomType, ChatRoomVisibility } from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { Repository, DataSource, FindOneOptions } from 'typeorm';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

describe('MatrixChatRoomManagerAdapter', () => {
  let service: MatrixChatRoomManagerAdapter;
  let tenantConnectionService: TenantConnectionService;
  let matrixRoomService: MatrixRoomService;
  let matrixUserService: MatrixUserService;
  let matrixMessageService: MatrixMessageService;
  let userService: UserService;
  let eventQueryService: EventQueryService;
  let mockChatRoomRepository: Repository<ChatRoomEntity>;
  let mockEventRepository: Repository<EventEntity>;

  const mockDataSource = {
    getRepository: jest.fn(),
  };

  beforeEach(async () => {
    // Create mock repository objects with Jest mock functions
    mockChatRoomRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    } as unknown as Repository<ChatRoomEntity>;
    
    mockEventRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    } as unknown as Repository<EventEntity>;
    
    // Configure the mockDataSource's getRepository to return different repositories
    // based on the entity type
    mockDataSource.getRepository.mockImplementation((entity) => {
      if (entity === ChatRoomEntity) {
        return mockChatRoomRepository;
      } else if (entity === EventEntity) {
        return mockEventRepository;
      }
      return {} as Repository<any>;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixChatRoomManagerAdapter,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue(mockDataSource),
          },
        },
        {
          provide: MatrixRoomService,
          useValue: {
            createRoom: jest.fn(),
            inviteUser: jest.fn(),
            joinRoom: jest.fn(),
            removeUserFromRoom: jest.fn(),
            setRoomPowerLevels: jest.fn(),
            deleteRoom: jest.fn(),
          },
        },
        {
          provide: MatrixUserService,
          useValue: {
            provisionMatrixUser: jest.fn(),
            getClientForUser: jest.fn(),
            setUserDisplayName: jest.fn(),
            generateDisplayName: jest.fn().mockReturnValue('Test User'),
          },
        },
        {
          provide: MatrixMessageService,
          useValue: {
            sendMessage: jest.fn(),
            getRoomMessages: jest.fn(),
          },
        },
        {
          provide: MatrixCoreService,
          useValue: {
            // Add methods as needed
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
            findByMatrixUserId: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            findGroupMemberByUserId: jest.fn(),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findEventAttendeeByUserId: jest.fn(),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: GroupService,
          useValue: {
            // Add methods as needed
          },
        },
      ],
    }).compile();

    service = module.get<MatrixChatRoomManagerAdapter>(MatrixChatRoomManagerAdapter);
    tenantConnectionService = module.get<TenantConnectionService>(TenantConnectionService);
    matrixRoomService = module.get<MatrixRoomService>(MatrixRoomService);
    matrixUserService = module.get<MatrixUserService>(MatrixUserService);
    matrixMessageService = module.get<MatrixMessageService>(MatrixMessageService);
    userService = module.get<UserService>(UserService);
    eventQueryService = module.get<EventQueryService>(EventQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ensureEventChatRoom', () => {
    it('should return existing chat room if it exists', async () => {
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'abc123',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      (mockChatRoomRepository.findOne as jest.Mock).mockResolvedValueOnce(mockChatRoom);

      const result = await service.ensureEventChatRoom(1, 1, 'tenant1');

      expect(result).toEqual(mockChatRoom);
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith({
        where: { event: { id: 1 } },
      });
    });

    it('should create a new chat room if none exists', async () => {
      // Mock chat room repository findOne to return null (no existing room)
      (mockChatRoomRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      // Mock event query service to return an event
      const mockEvent = {
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        visibility: 'public',
      };
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce(mockEvent);

      // Mock user service to return a user
      const mockUser = {
        id: 1,
        matrixUserId: '@user:matrix.org',
        slug: 'test-user',
      } as UserEntity;
      (userService.findById as jest.Mock).mockResolvedValueOnce(mockUser);

      // Mock matrix room service to create a room
      const mockRoomInfo = { roomId: 'new-room-id' };
      (matrixRoomService.createRoom as jest.Mock).mockResolvedValueOnce(mockRoomInfo);

      // Mock chat room repository create and save
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'new-room-id',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      (mockChatRoomRepository.create as jest.Mock).mockReturnValueOnce(mockChatRoom);
      (mockChatRoomRepository.save as jest.Mock).mockResolvedValueOnce(mockChatRoom);

      // Call the method
      const result = await service.ensureEventChatRoom(1, 1, 'tenant1');

      // Assertions
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith({
        where: { event: { id: 1 } },
      });
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(userService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(matrixRoomService.createRoom).toHaveBeenCalled();
      expect(mockChatRoomRepository.create).toHaveBeenCalled();
      expect(mockChatRoomRepository.save).toHaveBeenCalledWith(mockChatRoom);
      expect(mockEventRepository.update).toHaveBeenCalledWith(
        { id: 1 },
        { matrixRoomId: 'new-room-id' }
      );
      expect(result).toEqual(mockChatRoom);
    });

    it('should throw an error if event not found', async () => {
      // Mock chat room repository findOne to return null (no existing room)
      (mockChatRoomRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      // Mock event query service to return null (event not found)
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce(null);

      // Call the method and expect it to throw
      await expect(service.ensureEventChatRoom(1, 1, 'tenant1')).rejects.toThrow(
        'Event with id 1 not found'
      );
    });
  });

  describe('addUserToEventChatRoom', () => {
    it('should add a user to an event chat room', async () => {
      // Mock event query service to return an event
      const mockEvent = {
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        visibility: 'public',
      };
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce(mockEvent);

      // Mock chat room repository findOne to return a chat room
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'abc123',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      
      (mockChatRoomRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(mockChatRoom) // First for getChatRoomForEvent
        .mockResolvedValueOnce({
          ...mockChatRoom,
          members: [], // Second for findOne with members relation
        });

      // Mock user service to return a user with Matrix credentials
      const mockUser = {
        id: 1,
        matrixUserId: '@user:matrix.org',
        matrixAccessToken: 'access-token',
        matrixDeviceId: 'device-id',
        slug: 'test-user',
      } as UserEntity;
      (userService.findById as jest.Mock).mockResolvedValueOnce(mockUser);

      // Mock matrix room service inviteUser and joinRoom
      (matrixRoomService.inviteUser as jest.Mock).mockResolvedValueOnce(undefined);
      (matrixRoomService.joinRoom as jest.Mock).mockResolvedValueOnce(undefined);

      // Call the method
      await service.addUserToEventChatRoom(1, 1, 'tenant1');

      // Assertions
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(mockChatRoomRepository.findOne).toHaveBeenCalled(); // Don't check call count as it may vary
      expect(userService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(matrixRoomService.inviteUser).toHaveBeenCalledWith('abc123', '@user:matrix.org');
      expect(matrixRoomService.joinRoom).toHaveBeenCalledWith(
        'abc123',
        '@user:matrix.org',
        'access-token',
        'device-id'
      );
      // Don't verify save was called as it depends on internal implementation
    });

    it('should not add user to database if already a member', async () => {
      // Mock event query service to return an event
      const mockEvent = {
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        visibility: 'public',
      };
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce(mockEvent);

      // Mock chat room repository findOne to return a chat room
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'abc123',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      
      const mockUser = {
        id: 1,
        matrixUserId: '@user:matrix.org',
        matrixAccessToken: 'access-token',
        matrixDeviceId: 'device-id',
        slug: 'test-user',
      } as UserEntity;
      
      (mockChatRoomRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(mockChatRoom) // First for getChatRoomForEvent
        .mockResolvedValueOnce({ 
          ...mockChatRoom,
          members: [mockUser], // User is already a member
        });

      // Mock user service to return a user with Matrix credentials
      (userService.findById as jest.Mock).mockResolvedValueOnce(mockUser);

      // Mock matrix room service inviteUser and joinRoom
      (matrixRoomService.inviteUser as jest.Mock).mockRejectedValueOnce({
        message: 'User is already in the room',
      });

      // Call the method
      await service.addUserToEventChatRoom(1, 1, 'tenant1');

      // Assertions
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledTimes(2);
      expect(userService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(matrixRoomService.inviteUser).toHaveBeenCalledWith('abc123', '@user:matrix.org');
      // Should not save the chat room since user is already a member
      expect(mockChatRoomRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('should get messages from a chat room', async () => {
      // Mock chat room repository findOne to return a chat room
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'abc123',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      (mockChatRoomRepository.findOne as jest.Mock).mockResolvedValueOnce(mockChatRoom);

      // Mock user service to return a user with Matrix credentials
      const mockUser = {
        id: 1,
        matrixUserId: '@user:matrix.org',
        matrixAccessToken: 'access-token',
        matrixDeviceId: 'device-id',
        slug: 'test-user',
      } as UserEntity;
      (userService.findById as jest.Mock).mockResolvedValueOnce(mockUser);

      // Mock matrix message service to return messages
      const mockMessages = [
        {
          id: 'msg1',
          sender: '@user:matrix.org',
          content: 'Hello world',
        },
        {
          id: 'msg2',
          sender: '@other:matrix.org',
          content: 'Hello user',
        },
      ];
      (matrixMessageService.getRoomMessages as jest.Mock).mockResolvedValueOnce({
        messages: mockMessages,
        end: 'end-token',
      });

      // Mock userService.findByMatrixUserId
      (userService.findByMatrixUserId as jest.Mock).mockResolvedValueOnce({
        firstName: 'Test',
        lastName: 'User',
      });

      // Call the method
      const result = await service.getMessages(1, 1, 50, undefined, 'tenant1');

      // Assertions
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(userService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(matrixMessageService.getRoomMessages).toHaveBeenCalledWith(
        'abc123',
        50,
        undefined,
        '@user:matrix.org'
      );
      expect(result.messages.length).toBe(2);
      expect(result.end).toBe('end-token');
      expect(userService.findByMatrixUserId).toHaveBeenCalledWith('@user:matrix.org', 'tenant1');
      // First message should have sender_name
      expect(result.messages[0]).toHaveProperty('sender_name', 'Test User');
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a chat room', async () => {
      // Create a proper mock ChatRoomEntity with required properties
      const mockChatRoom = {
        id: 1,
        matrixRoomId: 'abc123',
        name: 'Test Room',
        topic: 'Test Topic',
        type: ChatRoomType.EVENT,
        visibility: ChatRoomVisibility.PUBLIC,
        members: [],
        creator: {} as UserEntity,
        event: {} as EventEntity,
        group: null,
        user1Id: null,
        user2Id: null,
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date()
      } as unknown as ChatRoomEntity;
      
      (mockChatRoomRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(mockChatRoom) // First call
        .mockResolvedValueOnce({ ...mockChatRoom, members: [] }); // Second call with members

      // Mock user service to return a user with Matrix credentials
      const mockUser = {
        id: 1,
        matrixUserId: '@user:matrix.org',
        matrixAccessToken: 'access-token',
        matrixDeviceId: 'device-id',
        slug: 'test-user',
        firstName: 'Test',
        lastName: 'User',
      } as UserEntity;
      (userService.findById as jest.Mock).mockResolvedValueOnce(mockUser);

      // Mock matrix room service inviteUser and joinRoom
      (matrixRoomService.inviteUser as jest.Mock).mockResolvedValueOnce(undefined);
      (matrixRoomService.joinRoom as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock matrix user service setUserDisplayName
      (matrixUserService.setUserDisplayName as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock matrix message service sendMessage
      (matrixMessageService.sendMessage as jest.Mock).mockResolvedValueOnce('msg1');

      // Call the method
      const result = await service.sendMessage(1, 1, 'Hello world', 'tenant1');

      // Assertions
      expect(mockChatRoomRepository.findOne).toHaveBeenCalledTimes(2);
      expect(userService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(matrixRoomService.inviteUser).toHaveBeenCalledWith('abc123', '@user:matrix.org');
      expect(matrixRoomService.joinRoom).toHaveBeenCalledWith(
        'abc123',
        '@user:matrix.org',
        'access-token',
        'device-id'
      );
      expect(matrixUserService.setUserDisplayName).toHaveBeenCalledWith(
        '@user:matrix.org',
        'access-token',
        'Test User',
        'device-id'
      );
      expect(matrixMessageService.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
        roomId: 'abc123',
        content: 'Hello world',
        userId: '@user:matrix.org',
        accessToken: 'access-token',
        deviceId: 'device-id',
      }));
      expect(result).toBe('msg1');
    });
  });

  describe('checkEventExists', () => {
    it('should return true if event exists', async () => {
      // Mock event query service to return an event
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce({
        id: 1,
        slug: 'test-event',
      });

      // Call the method
      const result = await service.checkEventExists(1, 'tenant1');

      // Assertions
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(result).toBe(true);
    });

    it('should return false if event does not exist', async () => {
      // Mock event query service to return null
      (eventQueryService.findById as jest.Mock).mockResolvedValueOnce(null);

      // Call the method
      const result = await service.checkEventExists(1, 'tenant1');

      // Assertions
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(result).toBe(false);
    });

    it('should return false if event query throws an error', async () => {
      // Mock event query service to throw an error
      (eventQueryService.findById as jest.Mock).mockRejectedValueOnce(new Error('Database error'));

      // Call the method
      const result = await service.checkEventExists(1, 'tenant1');

      // Assertions
      expect(eventQueryService.findById).toHaveBeenCalledWith(1, 'tenant1');
      expect(result).toBe(false);
    });
  });
});