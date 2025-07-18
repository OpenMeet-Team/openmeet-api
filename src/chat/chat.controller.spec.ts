import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { EventQueryService } from '../event/services/event-query.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { GroupService } from '../group/group.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { MatrixBotService } from '../matrix/services/matrix-bot.service';
import { mockUser } from '../test/mocks';

// Create mock discussion service with methods for active functionality only
const mockDiscussionService = {
  addMemberToEventDiscussionBySlugAndGetRoomId: jest
    .fn()
    .mockResolvedValue({ roomId: 'room-123' }),
  removeMemberFromEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  groupExists: jest.fn().mockResolvedValue(true),
  addMemberToGroupDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
};

// Mock services for VisibilityGuard dependencies
const mockEventQueryService = {
  findEventBySlug: jest.fn(),
};

const mockEventAttendeeService = {
  findEventAttendeeByUserId: jest.fn(),
};

const mockGroupService = {
  findGroupBySlug: jest.fn(),
};

const mockGroupMemberService = {
  findGroupMemberByUserId: jest.fn(),
};

const mockChatRoomService = {
  addUserToEventChatRoom: jest.fn(),
  ensureRoomAccess: jest.fn(),
  addUserToGroupChatRoom: jest.fn(),
};

const mockMatrixBotService = {
  getBotUserId: jest.fn().mockReturnValue('@bot:matrix.example.com'),
  verifyRoomExists: jest.fn().mockResolvedValue(true),
  isBotInRoom: jest.fn().mockResolvedValue(true),
  joinRoom: jest.fn().mockResolvedValue({}),
  inviteUser: jest.fn().mockResolvedValue({}),
  removeUser: jest.fn().mockResolvedValue({}),
  syncPermissions: jest.fn().mockResolvedValue({}),
  getBotPowerLevel: jest.fn().mockResolvedValue(100),
};

describe('ChatController', () => {
  let controller: ChatController;
  let discussionService: DiscussionService;
  let chatRoomManager: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: DiscussionService,
          useValue: mockDiscussionService,
        },
        {
          provide: VisibilityGuard,
          useValue: {
            canActivate: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
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
            ensureGroupChatRoom: jest.fn(),
            checkEventExists: jest.fn(),
            checkGroupExists: jest.fn(),
            isUserInEventChatRoom: jest.fn(),
            isUserInGroupChatRoom: jest.fn(),
            getEventChatRooms: jest.fn(),
            getGroupChatRooms: jest.fn(),
            getChatRoomMembers: jest.fn(),
          }),
        },
        {
          provide: ChatRoomService,
          useValue: mockChatRoomService,
        },
        {
          provide: MatrixBotService,
          useValue: mockMatrixBotService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    discussionService = module.get<DiscussionService>(DiscussionService);
    chatRoomManager = module.get('ChatRoomManagerInterface');
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Event chat room management', () => {
    it('should add a member to an event discussion', async () => {
      const eventSlug = 'test-event';
      const userSlug = 'test-user';

      const result = await controller.addMemberToEventDiscussion(
        eventSlug,
        userSlug,
        mockUser,
      );

      expect(result).toEqual({
        success: true,
        roomId: 'room-123',
        message: 'Member added to event discussion successfully',
      });
      expect(
        discussionService.addMemberToEventDiscussionBySlugAndGetRoomId,
      ).toHaveBeenCalledWith(eventSlug, userSlug);
    });

    it('should remove a member from an event discussion', async () => {
      const eventSlug = 'test-event';
      const userSlug = 'test-user';
      const mockRequest = { tenantId: 'test-tenant' };

      await controller.removeMemberFromEventDiscussion(
        eventSlug,
        userSlug,
        mockUser,
        mockRequest,
      );

      // Method now uses chatRoomManager instead of discussionService
      expect(chatRoomManager.removeUserFromEventChatRoom).toHaveBeenCalledWith(
        eventSlug,
        userSlug,
        'test-tenant',
      );
    });
  });
});
