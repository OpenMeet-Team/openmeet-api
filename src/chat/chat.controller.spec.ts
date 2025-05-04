import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { DiscussionService } from './services/discussion.service';
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
  sendDirectMessage: jest.fn().mockResolvedValue({ id: 'direct-msg-123' }),
  getDirectMessages: jest.fn().mockResolvedValue({
    messages: [{ id: 'msg-3', content: { body: 'test direct message' } }],
    end: 'token-789',
  }),
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

  // We could add more tests for group and direct message endpoints
});
