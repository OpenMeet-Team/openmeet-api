import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { DiscussionService } from './services/discussion.service';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { EventQueryService } from '../event/services/event-query.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { GroupService } from '../group/group.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { mockUser } from '../test/mocks';

// Create mock discussion service with methods matching the controller
const mockDiscussionService = {
  sendEventDiscussionMessage: jest
    .fn()
    .mockResolvedValue({ id: 'event-msg-123' }),
  getEventDiscussionMessages: jest.fn().mockResolvedValue({
    messages: [{ id: 'msg-1', content: { body: 'test message' } }],
    end: 'token-123',
  }),
  addMemberToEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  addMemberToEventDiscussionBySlugAndGetRoomId: jest
    .fn()
    .mockResolvedValue({ roomId: 'room-123' }),
  removeMemberFromEventDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  sendGroupDiscussionMessage: jest
    .fn()
    .mockResolvedValue({ id: 'group-msg-123' }),
  getGroupDiscussionMessages: jest.fn().mockResolvedValue({
    messages: [{ id: 'msg-2', content: { body: 'test group message' } }],
    end: 'token-456',
  }),
  groupExists: jest.fn().mockResolvedValue(true),
  addMemberToGroupDiscussionBySlug: jest.fn().mockResolvedValue(undefined),
  getGroupChatRooms: jest
    .fn()
    .mockResolvedValue([{ matrixRoomId: 'room-456' }]),
  sendDirectMessage: jest.fn().mockResolvedValue({ id: 'direct-msg-123' }),
  getDirectMessages: jest.fn().mockResolvedValue({
    messages: [{ id: 'msg-3', content: { body: 'test direct message' } }],
    end: 'token-789',
  }),
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
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    discussionService = module.get<DiscussionService>(DiscussionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Event discussion endpoints', () => {
    it('should send a message to an event discussion', async () => {
      const eventSlug = 'test-event';
      const messageBody = { message: 'test message', topicName: 'General' };

      const result = await controller.sendEventMessage(
        eventSlug,
        messageBody,
        mockUser,
      );

      expect(result).toEqual({ id: 'event-msg-123' });
      expect(discussionService.sendEventDiscussionMessage).toHaveBeenCalledWith(
        eventSlug,
        mockUser.id,
        messageBody,
      );
    });

    it('should get messages from an event discussion', async () => {
      const eventSlug = 'test-event';
      const limit = 50;
      const from = 'token-abc';

      const result = await controller.getEventMessages(
        eventSlug,
        mockUser,
        limit,
        from,
      );

      expect(result.messages.length).toBe(1);
      expect(result.end).toBe('token-123');
      expect(discussionService.getEventDiscussionMessages).toHaveBeenCalledWith(
        eventSlug,
        mockUser.id,
        limit,
        from,
      );
    });

    it('should add a member to an event discussion', async () => {
      const eventSlug = 'test-event';
      const userSlug = 'test-user';

      await controller.addMemberToEventDiscussion(
        eventSlug,
        userSlug,
        mockUser,
      );

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

  describe('Group discussion endpoints', () => {
    it('should get messages from a group discussion for authenticated users', async () => {
      const groupSlug = 'test-group';
      const limit = 50;
      const from = 'token-abc';
      const mockRequest = {
        tenantId: 'test-tenant',
        headers: {},
      };

      const result = await controller.getGroupMessages(
        groupSlug,
        mockRequest,
        limit,
        from,
        mockUser,
      );

      expect(result.messages.length).toBe(1);
      expect(result.end).toBe('token-456');
      expect(discussionService.getGroupDiscussionMessages).toHaveBeenCalledWith(
        groupSlug,
        mockUser.id,
        limit,
        from,
        'test-tenant',
      );
    });

    // Test for unauthenticated access to public groups
    it('should get messages from a public group discussion for unauthenticated users', async () => {
      const groupSlug = 'public-group';
      const limit = 50;
      const mockRequest = {
        tenantId: 'test-tenant',
        headers: {},
      };

      // Configure the mock to return messages for unauthenticated users
      mockDiscussionService.getGroupDiscussionMessages.mockResolvedValueOnce({
        messages: [
          { id: 'msg-1', content: { body: 'Public message 1' } },
          { id: 'msg-2', content: { body: 'Public message 2' } },
        ],
        end: 'token-public',
      });

      // This should work without a user (unauthenticated)
      const result = await controller.getGroupMessages(
        groupSlug,
        mockRequest,
        limit,
        undefined,
        undefined, // No authenticated user
      );

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].content.body).toBe('Public message 1');
      expect(result.end).toBe('token-public');
      expect(discussionService.getGroupDiscussionMessages).toHaveBeenCalledWith(
        groupSlug,
        null, // Should pass null for unauthenticated users
        limit,
        undefined,
        'test-tenant',
      );
    });

    // Test for unauthenticated access to private groups (should be forbidden)
    it('should handle unauthenticated users trying to access private groups', async () => {
      const groupSlug = 'private-group';
      const mockRequest = {
        tenantId: 'test-tenant',
        headers: {},
      };

      // Configure the mock to throw forbidden error for private groups
      mockDiscussionService.getGroupDiscussionMessages.mockRejectedValueOnce(
        new Error('Access denied to private group'),
      );

      // This should throw an error for unauthenticated users accessing private groups
      await expect(
        controller.getGroupMessages(
          groupSlug,
          mockRequest,
          50,
          undefined,
          undefined, // No authenticated user
        ),
      ).rejects.toThrow('Access denied to private group');

      expect(discussionService.getGroupDiscussionMessages).toHaveBeenCalledWith(
        groupSlug,
        null, // Should pass null for unauthenticated users
        50,
        undefined,
        'test-tenant',
      );
    });
  });

  // We could add more tests for direct message endpoints
});
