import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { EventQueryService } from '../event/services/event-query.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { GroupService } from '../group/group.service';
import { GroupMemberService } from '../group-member/group-member.service';
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

describe('ChatController', () => {
  let controller: ChatController;
  let discussionService: DiscussionService;

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
          provide: ChatRoomService,
          useValue: mockChatRoomService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    discussionService = module.get<DiscussionService>(DiscussionService);
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

      await controller.removeMemberFromEventDiscussion(
        eventSlug,
        userSlug,
        mockUser,
      );

      expect(
        discussionService.removeMemberFromEventDiscussionBySlug,
      ).toHaveBeenCalledWith(eventSlug, userSlug);
    });
  });
});
