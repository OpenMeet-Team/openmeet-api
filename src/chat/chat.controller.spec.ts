import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import {
  mockAuthService,
  mockChat,
  mockChatService,
  mockUser,
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

  it('should find all chats', async () => {
    const result = await controller.showChats(mockUser);
    expect(result).toEqual([mockChat]);
    expect(chatService.showChats).toHaveBeenCalledWith(mockUser.id);
  });

  it('should find a chat', async () => {
    const result = await controller.showChat(mockChat.uuid, mockUser);
    expect(result).toEqual(mockChat);
    expect(chatService.showChat).toHaveBeenCalledWith(
      mockChat.uuid,
      mockUser.id,
    );
  });
});
