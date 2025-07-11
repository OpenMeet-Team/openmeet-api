import { Test, TestingModule } from '@nestjs/testing';
import { ChatListener } from './chat.listener';
import { ModuleRef } from '@nestjs/core';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ChatRoomManagerInterface } from './interfaces/chat-room-manager.interface';
import { UserService } from '../user/user.service';
import { GroupService } from '../group/group.service';
import { ContextIdFactory } from '@nestjs/core';

describe('ChatListener - Matrix Invitation Event Handling', () => {
  let listener: ChatListener;
  let moduleRef: jest.Mocked<ModuleRef>;
  let chatRoomService: jest.Mocked<ChatRoomService>;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;
  let chatRoomManager: jest.Mocked<ChatRoomManagerInterface>;
  let userService: jest.Mocked<UserService>;
  let groupService: jest.Mocked<GroupService>;
  let mockDiscussionService: any;

  beforeEach(async () => {
    // Mock DiscussionService
    mockDiscussionService = {
      getIdsFromSlugsWithTenant: jest.fn(),
      getGroupAndUserIdsFromSlugsWithTenant: jest.fn(),
      getGroupIdFromSlugWithTenant: jest.fn(),
      getUserIdFromSlugWithTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatListener,
        {
          provide: ModuleRef,
          useFactory: () => ({
            resolve: jest.fn(),
          }),
        },
        {
          provide: ChatRoomService,
          useFactory: () => ({
            getGroupChatRooms: jest.fn(),
            getEventChatRooms: jest.fn(),
          }),
        },
        {
          provide: TenantConnectionService,
          useFactory: () => ({
            getTenantConnection: jest.fn(),
          }),
        },
        {
          provide: 'ChatRoomManagerInterface',
          useFactory: () => ({
            addUserToEventChatRoom: jest.fn(),
            removeUserFromEventChatRoom: jest.fn(),
            addUserToGroupChatRoom: jest.fn(),
            removeUserFromGroupChatRoom: jest.fn(),
            deleteEventChatRooms: jest.fn(),
            deleteGroupChatRooms: jest.fn(),
            ensureEventChatRoom: jest.fn(),
            checkEventExists: jest.fn(),
          }),
        },
        {
          provide: UserService,
          useFactory: () => ({
            findById: jest.fn(),
            getUserBySlug: jest.fn(),
            getUserBySlugWithTenant: jest.fn(),
          }),
        },
        {
          provide: GroupService,
          useFactory: () => ({
            findOne: jest.fn(),
            getGroupBySlug: jest.fn(),
          }),
        },
      ],
    }).compile();

    listener = module.get<ChatListener>(ChatListener);
    moduleRef = module.get(ModuleRef) as jest.Mocked<ModuleRef>;
    chatRoomService = module.get(
      ChatRoomService,
    ) as jest.Mocked<ChatRoomService>;
    tenantConnectionService = module.get(
      TenantConnectionService,
    ) as jest.Mocked<TenantConnectionService>;
    chatRoomManager = module.get(
      'ChatRoomManagerInterface',
    ) as jest.Mocked<ChatRoomManagerInterface>;
    userService = module.get(UserService) as jest.Mocked<UserService>;
    groupService = module.get(GroupService) as jest.Mocked<GroupService>;

    // Setup moduleRef to return mock DiscussionService
    moduleRef.resolve.mockResolvedValue(mockDiscussionService);

    jest.clearAllMocks();
  });

  describe('handleChatEventMemberAdd', () => {
    it('should successfully add user to event chat room via Matrix bot', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      // Act
      await listener.handleChatEventMemberAdd(params);

      // Assert
      expect(moduleRef.resolve).toHaveBeenCalledWith(
        DiscussionService,
        expect.any(Object), // ContextId
        { strict: false },
      );

      expect(
        mockDiscussionService.getIdsFromSlugsWithTenant,
      ).toHaveBeenCalledWith('test-event', 'test-user', 'test-tenant');

      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'test-tenant',
      );
    });

    it('should log error and continue when tenantId is missing (CRITICAL: Error Swallowing)', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        // tenantId missing
      };

      // Act - Should NOT throw error, just log it
      await listener.handleChatEventMemberAdd(params);

      // Assert - CRITICAL FINDING: Errors are being swallowed!
      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should log error and continue when event or user cannot be found', async () => {
      // Arrange
      const params = {
        eventSlug: 'nonexistent-event',
        userSlug: 'nonexistent-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: null,
        userId: null,
      });

      // Act
      await listener.handleChatEventMemberAdd(params);

      // Assert
      expect(
        mockDiscussionService.getIdsFromSlugsWithTenant,
      ).toHaveBeenCalled();
      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should log error and continue when Matrix bot service fails', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      const matrixError = new Error('Matrix server unavailable');
      chatRoomManager.addUserToEventChatRoom.mockRejectedValue(matrixError);

      // Act - Should not throw error
      await listener.handleChatEventMemberAdd(params);

      // Assert
      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'test-tenant',
      );
      // Should continue processing despite Matrix error
    });

    it('should handle DiscussionService resolution failure', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      const resolutionError = new Error('Failed to resolve DiscussionService');
      moduleRef.resolve.mockRejectedValue(resolutionError);

      // Act - Should not throw error
      await listener.handleChatEventMemberAdd(params);

      // Assert
      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });
  });

  describe('handleChatEventMemberRemove', () => {
    it('should successfully remove user from event chat room', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      // Act
      await listener.handleChatEventMemberRemove(params);

      // Assert
      expect(
        mockDiscussionService.getIdsFromSlugsWithTenant,
      ).toHaveBeenCalledWith('test-event', 'test-user', 'test-tenant');

      expect(chatRoomManager.removeUserFromEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'test-tenant',
      );
    });

    it('should log error and continue when tenantId is missing (CRITICAL: Error Swallowing)', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        // tenantId missing
      };

      // Act - Should NOT throw error, just log it
      await listener.handleChatEventMemberRemove(params);

      // Assert - CRITICAL FINDING: Errors are being swallowed!
      expect(
        chatRoomManager.removeUserFromEventChatRoom,
      ).not.toHaveBeenCalled();
    });

    it('should log error when user removal fails but not throw', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      const removalError = new Error('Failed to remove user from Matrix room');
      chatRoomManager.removeUserFromEventChatRoom.mockRejectedValue(
        removalError,
      );

      // Act - Should not throw error
      await listener.handleChatEventMemberRemove(params);

      // Assert
      expect(chatRoomManager.removeUserFromEventChatRoom).toHaveBeenCalled();
    });
  });

  describe('handleChatGroupMemberAdd', () => {
    it('should add user to group chat room using slugs (CRITICAL: Errors are swallowed)', async () => {
      // Arrange
      const params = {
        groupSlug: 'test-group',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      // The group method resolves IDs even when we have slugs, so we need to mock this
      mockDiscussionService.getGroupAndUserIdsFromSlugsWithTenant.mockResolvedValue(
        {
          groupId: 1,
          userId: 1,
        },
      );

      // Act
      await listener.handleChatGroupMemberAdd(params);

      // Assert - CRITICAL FINDING: This flow also swallows Matrix errors
      expect(chatRoomManager.addUserToGroupChatRoom).toHaveBeenCalledWith(
        'test-group',
        'test-user',
        'test-tenant',
      );
    });

    it('should resolve IDs from slugs when only slugs are provided', async () => {
      // Arrange
      const params = {
        groupSlug: 'test-group',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getGroupAndUserIdsFromSlugsWithTenant.mockResolvedValue(
        {
          groupId: 1,
          userId: 1,
        },
      );

      // Act
      await listener.handleChatGroupMemberAdd(params);

      // Assert
      expect(chatRoomManager.addUserToGroupChatRoom).toHaveBeenCalledWith(
        'test-group',
        'test-user',
        'test-tenant',
      );
    });

    it('should handle mixed ID and slug parameters', async () => {
      // Arrange
      const params = {
        groupId: 1,
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getUserIdFromSlugWithTenant.mockResolvedValue(1);

      const mockGroup = { id: 1, slug: 'test-group' };
      groupService.findOne.mockResolvedValue(mockGroup);

      const mockUser = { id: 1, slug: 'test-user' };
      userService.findById.mockResolvedValue(mockUser);

      // Act
      await listener.handleChatGroupMemberAdd(params);

      // Assert
      expect(chatRoomManager.addUserToGroupChatRoom).toHaveBeenCalledWith(
        'test-group',
        'test-user',
        'test-tenant',
      );
    });
  });

  describe('handleChatEventCreated', () => {
    it('should create event chat room when valid parameters provided', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        eventName: 'Test Event',
        eventVisibility: 'public',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      chatRoomManager.checkEventExists.mockResolvedValue(true);

      // Act
      await listener.handleChatEventCreated(params);

      // Assert
      expect(chatRoomManager.checkEventExists).toHaveBeenCalledWith(
        'test-event',
        'test-tenant',
      );

      expect(chatRoomManager.ensureEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'test-tenant',
      );
    });

    it('should log error and continue when tenantId is missing (CRITICAL: Error Swallowing)', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        eventName: 'Test Event',
        eventVisibility: 'public',
        // tenantId missing
      };

      // Act - Should NOT throw error, just log it
      await listener.handleChatEventCreated(params);

      // Assert - CRITICAL FINDING: Errors are being swallowed!
      expect(chatRoomManager.ensureEventChatRoom).not.toHaveBeenCalled();
    });

    it('should skip chat room creation when event no longer exists', async () => {
      // Arrange
      const params = {
        eventSlug: 'deleted-event',
        userSlug: 'test-user',
        eventName: 'Deleted Event',
        eventVisibility: 'public',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      chatRoomManager.checkEventExists.mockResolvedValue(false);

      // Act
      await listener.handleChatEventCreated(params);

      // Assert
      expect(chatRoomManager.checkEventExists).toHaveBeenCalled();
      expect(chatRoomManager.ensureEventChatRoom).not.toHaveBeenCalled();
    });

    it('should handle missing userSlug by logging warning and returning early', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        eventName: 'Test Event',
        eventVisibility: 'public',
        tenantId: 'test-tenant',
        // userSlug and userId missing
      };

      // Act
      await listener.handleChatEventCreated(params);

      // Assert
      expect(chatRoomManager.ensureEventChatRoom).not.toHaveBeenCalled();
    });

    it('should handle userId instead of userSlug', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userId: 1,
        eventName: 'Test Event',
        eventVisibility: 'public',
        tenantId: 'test-tenant',
      };

      // Mock the tenant connection and event repository for userId flow
      const mockEventRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          slug: 'test-event',
          name: 'Test Event',
        }),
      };

      const mockDataSource = {
        getRepository: jest.fn().mockReturnValue(mockEventRepo),
      };

      tenantConnectionService.getTenantConnection.mockResolvedValue(
        mockDataSource,
      );

      const mockUser = { id: 1, slug: 'test-user' };
      userService.findById.mockResolvedValue(mockUser);

      chatRoomManager.checkEventExists.mockResolvedValue(true);

      // Act
      await listener.handleChatEventCreated(params);

      // Assert
      expect(tenantConnectionService.getTenantConnection).toHaveBeenCalledWith(
        'test-tenant',
      );
      expect(userService.findById).toHaveBeenCalledWith(1, 'test-tenant');
      expect(chatRoomManager.ensureEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'test-user',
        'test-tenant',
      );
    });
  });

  describe('Auto-Invitation Flow Gaps', () => {
    it('should call Matrix bot when chat.event.member.add is handled', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'new-user', 
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      // Act
      await listener.handleChatEventMemberAdd(params);

      // Assert: Matrix bot should be called
      expect(chatRoomManager.addUserToEventChatRoom).toHaveBeenCalledWith(
        'test-event',
        'new-user', 
        'test-tenant',
      );
    });

    it('should handle Matrix bot failures without crashing', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant', 
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockResolvedValue({
        eventId: 1,
        userId: 1,
      });

      chatRoomManager.addUserToEventChatRoom.mockRejectedValue(
        new Error('Bot failed')
      );

      // Act & Assert: Should not throw
      await expect(
        listener.handleChatEventMemberAdd(params)
      ).resolves.not.toThrow();
    });

    it('should not call Matrix bot when tenantId is missing', async () => {
      // Arrange
      const params = {
        eventSlug: 'test-event',
        userSlug: 'test-user',
        // tenantId missing
      };

      // Act
      await listener.handleChatEventMemberAdd(params);

      // Assert: Bot should not be called
      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });

    it('should handle slug resolution failures gracefully', async () => {
      // Arrange
      const params = {
        eventSlug: 'nonexistent-event',
        userSlug: 'test-user',
        tenantId: 'test-tenant',
      };

      mockDiscussionService.getIdsFromSlugsWithTenant.mockRejectedValue(
        new Error('Not found')
      );

      // Act & Assert: Should not throw
      await expect(
        listener.handleChatEventMemberAdd(params)
      ).resolves.not.toThrow();

      expect(chatRoomManager.addUserToEventChatRoom).not.toHaveBeenCalled();
    });
  });

  describe('Event Cleanup Handlers', () => {
    describe('handleEventBeforeDelete', () => {
      it('should delete event chat rooms when event is being deleted', async () => {
        // Arrange
        const params = {
          eventId: 1,
          eventSlug: 'test-event',
          tenantId: 'test-tenant',
        };

        // Act
        await listener.handleEventBeforeDelete(params);

        // Assert
        expect(chatRoomManager.deleteEventChatRooms).toHaveBeenCalledWith(
          'test-event',
          'test-tenant',
        );
      });

      it('should skip cleanup when skipChatCleanup is true', async () => {
        // Arrange
        const params = {
          eventId: 1,
          eventSlug: 'test-event',
          tenantId: 'test-tenant',
          skipChatCleanup: true,
        };

        // Act
        await listener.handleEventBeforeDelete(params);

        // Assert
        expect(chatRoomManager.deleteEventChatRooms).not.toHaveBeenCalled();
      });

      it('should continue when chat room deletion fails', async () => {
        // Arrange
        const params = {
          eventId: 1,
          eventSlug: 'test-event',
          tenantId: 'test-tenant',
        };

        const deletionError = new Error('Failed to delete Matrix rooms');
        chatRoomManager.deleteEventChatRooms.mockRejectedValue(deletionError);

        // Act - Should not throw error
        await listener.handleEventBeforeDelete(params);

        // Assert
        expect(chatRoomManager.deleteEventChatRooms).toHaveBeenCalled();
      });
    });

    describe('handleGroupBeforeDelete', () => {
      it('should delete group chat rooms when group is being deleted', async () => {
        // Arrange
        const params = {
          groupId: 1,
          groupSlug: 'test-group',
          tenantId: 'test-tenant',
        };

        // Act
        await listener.handleGroupBeforeDelete(params);

        // Assert
        expect(chatRoomManager.deleteGroupChatRooms).toHaveBeenCalledWith(
          'test-group',
          'test-tenant',
        );
      });

      it('should resolve group slug from ID when only ID provided', async () => {
        // Arrange
        const params = {
          groupId: 1,
          tenantId: 'test-tenant',
        };

        mockDiscussionService.getGroupIdFromSlugWithTenant.mockResolvedValue(1);

        const mockGroup = { id: 1, slug: 'test-group' };
        groupService.findOne.mockResolvedValue(mockGroup);

        // Act
        await listener.handleGroupBeforeDelete(params);

        // Assert
        expect(groupService.findOne).toHaveBeenCalledWith(1);
        expect(chatRoomManager.deleteGroupChatRooms).toHaveBeenCalledWith(
          'test-group',
          'test-tenant',
        );
      });
    });
  });
});
