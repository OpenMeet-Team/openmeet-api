import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import {
  mockAuthService,
  mockChat,
  mockChatService,
  mockUser,
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
      expect(result).toEqual([mockChat]);
      expect(chatService.showChats).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('showChatByUser', () => {
    it('should find a chat by user ulid', async () => {
      const result = await controller.showChatByUser(mockUser.ulid, mockUser);
      expect(result).toEqual(mockChat);
    });
  });

  describe('showChat', () => {
    it('should show a chat', async () => {
      const result = await controller.showChat(mockChat.ulid, mockUser);
      expect(result).toEqual(mockChat);
      expect(chatService.showChat).toHaveBeenCalledWith(
        mockChat.ulid,
        mockUser.id,
      );
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
});
