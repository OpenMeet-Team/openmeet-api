import { Test, TestingModule } from '@nestjs/testing';
import { UserRoomSyncService } from './user-room-sync.service';
import { ChatRoomManagerInterface } from '../interfaces/chat-room-manager.interface';
import { UserService } from '../../user/user.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';

describe('UserRoomSyncService', () => {
  let service: UserRoomSyncService;
  let chatRoomManager: jest.Mocked<ChatRoomManagerInterface>;
  let userService: jest.Mocked<UserService>;
  let eventAttendeeService: jest.Mocked<EventAttendeeService>;
  let groupMemberService: jest.Mocked<GroupMemberService>;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;
  let globalMatrixValidationService: jest.Mocked<GlobalMatrixValidationService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRoomSyncService,
        {
          provide: 'ChatRoomManagerInterface',
          useValue: {
            addUserToEventChatRoom: jest.fn(),
            addUserToGroupChatRoom: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findByMatrixHandle: jest.fn(),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findByUserSlug: jest.fn(),
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            // No methods needed for current implementation
          },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getAllTenantIds: jest.fn(),
          },
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: {
            getUserByMatrixHandle: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserRoomSyncService>(UserRoomSyncService);
    chatRoomManager = module.get('ChatRoomManagerInterface');
    userService = module.get(UserService);
    eventAttendeeService = module.get(EventAttendeeService);
    groupMemberService = module.get(GroupMemberService);
    tenantConnectionService = module.get(TenantConnectionService);
    globalMatrixValidationService = module.get(GlobalMatrixValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleMemberEvent', () => {
    it('should process user login event and trigger room sync', async () => {
      const mockEvent = {
        type: 'm.room.member',
        sender: '@test-user:matrix.example.com',
        state_key: '@test-user:matrix.example.com',
        content: {
          membership: 'join',
        },
      };

      const mockUser = {
        id: 1,
        slug: 'test-user',
        email: 'test@example.com',
      };

      const mockAttendances = [
        {
          id: 1,
          status: 'confirmed',
          event: {
            slug: 'test-event',
            name: 'Test Event',
          },
        },
      ];

      // Mock the user lookup
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      userService.findByMatrixHandle.mockResolvedValue(mockUser);
      eventAttendeeService.findByUserSlug.mockResolvedValue(mockAttendances);

      // Mock successful room addition
      chatRoomManager.addUserToEventChatRoom.mockResolvedValue(undefined);

      await service.handleMemberEvent(mockEvent);

      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'tenant-1',
      );
    });

    it('should not process events where sender !== state_key', async () => {
      const mockEvent = {
        type: 'm.room.member',
        sender: '@admin:matrix.example.com',
        state_key: '@test-user:matrix.example.com', // Different from sender
        content: {
          membership: 'join',
        },
      };

      await service.handleMemberEvent(mockEvent);

      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should not process leave events', async () => {
      const mockEvent = {
        type: 'm.room.member',
        sender: '@test-user:matrix.example.com',
        state_key: '@test-user:matrix.example.com',
        content: {
          membership: 'leave',
        },
      };

      await service.handleMemberEvent(mockEvent);

      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should handle invalid Matrix user ID format gracefully', async () => {
      const mockEvent = {
        type: 'm.room.member',
        sender: 'invalid-matrix-id',
        state_key: 'invalid-matrix-id',
        content: {
          membership: 'join',
        },
      };

      await service.handleMemberEvent(mockEvent);

      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });
  });

  describe('syncUserRoomMemberships', () => {
    it('should handle user not found across tenants', async () => {
      const matrixUserId = '@unknown-user:matrix.example.com';

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      userService.findByMatrixHandle.mockResolvedValue(null);

      await service.syncUserRoomMemberships(matrixUserId);

      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should process multiple event attendances for user', async () => {
      const matrixUserId = '@multi-event-user:matrix.example.com';
      const mockUser = {
        id: 1,
        slug: 'multi-event-user',
        email: 'multi@example.com',
      };

      const mockAttendances = [
        {
          id: 1,
          status: 'confirmed',
          event: { slug: 'event-1', name: 'Event 1' },
        },
        {
          id: 2,
          status: 'pending',
          event: { slug: 'event-2', name: 'Event 2' },
        },
        {
          id: 3,
          status: 'cancelled', // Should be filtered out
          event: { slug: 'event-3', name: 'Event 3' },
        },
      ];

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      userService.findByMatrixHandle.mockResolvedValue(mockUser);
      eventAttendeeService.findByUserSlug.mockResolvedValue(mockAttendances);
      chatRoomManager.addUserToEventChatRoom.mockResolvedValue(undefined);

      await service.syncUserRoomMemberships(matrixUserId);

      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledTimes(2);
      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'event-1',
        'multi-event-user',
        'tenant-1',
      );
      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'event-2',
        'multi-event-user',
        'tenant-1',
      );
    });

    it('should handle errors in room addition gracefully', async () => {
      const matrixUserId = '@error-user:matrix.example.com';
      const mockUser = {
        id: 1,
        slug: 'error-user',
        email: 'error@example.com',
      };

      const mockAttendances = [
        {
          id: 1,
          status: 'confirmed',
          event: { slug: 'error-event', name: 'Error Event' },
        },
      ];

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      userService.findByMatrixHandle.mockResolvedValue(mockUser);
      eventAttendeeService.findByUserSlug.mockResolvedValue(mockAttendances);

      // Mock error in room addition
      chatRoomManager.addUserToEventChatRoom.mockRejectedValue(
        new Error('Room addition failed'),
      );

      // Should not throw error
      await expect(
        service.syncUserRoomMemberships(matrixUserId),
      ).resolves.not.toThrow();
    });
  });

  describe('isValidMatrixUserId', () => {
    it('should validate correct Matrix user ID format', () => {
      const validIds = [
        '@user:matrix.example.com',
        '@user123:matrix.example.com',
        '@user-name:matrix.example.com',
        '@user_name:matrix.example.com',
        '@user.name:matrix.example.com',
      ];

      validIds.forEach((id) => {
        expect((service as any).isValidMatrixUserId(id)).toBe(true);
      });
    });

    it('should reject invalid Matrix user ID format', () => {
      const invalidIds = [
        'user:matrix.example.com', // Missing @
        '@user', // Missing domain
        '@:matrix.example.com', // Missing localpart
        'invalid-format',
        '@user:',
        '',
        null,
        undefined,
      ];

      invalidIds.forEach((id) => {
        expect((service as any).isValidMatrixUserId(id)).toBe(false);
      });
    });
  });
});
