import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import {
  mockAuthService,
  mockChat,
  mockChatService,
  mockUser,
  mockZulipMessage,
  mockZulipMessageResponse,
} from '../test/mocks';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
    chatService = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('showChats', () => {
    it('should find all chats', async () => {
      const result = await controller.showChats(mockUser);
      expect(result).toEqual({ chats: [mockChat], chat: mockChat });
    });

    it('should return chat', async () => {
      const result = await controller.showChats(mockUser, {
        chat: mockChat.ulid,
      });
      expect(result).toEqual({ chats: [mockChat], chat: mockChat });
    });

    it('should not return own user chat', async () => {
      jest
        .spyOn(chatService, 'showChats')
        .mockResolvedValue({ chats: [mockChat], chat: null });
      const result = await controller.showChats(mockUser, {
        member: mockUser.ulid,
      });
      expect(result).toEqual({ chats: [mockChat], chat: null });
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      const result = await controller.sendMessage(
        mockChat.ulid,
        { content: 'test message' },
        mockUser,
      );

      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('setMessagesRead', () => {
    it('should set messages as read', async () => {
      const result = await controller.setMessagesRead(
        { messages: [mockZulipMessage.id] },
        mockUser,
      );
      expect(result).toEqual({ messages: [mockZulipMessage.id] });
    });
  });
});
