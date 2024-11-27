import {
  mockChat,
  mockTenantConnectionService,
  mockUser,
  mockUserService,
  mockZulipMessageResponse,
} from '../test/mocks';
import { ChatService } from './chat.service';
import { mockRepository, mockZulipService } from '../test/mocks';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { ZulipService } from '../zulip/zulip.service';
import { UserService } from '../user/user.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { TESTING_TENANT_ID } from '../../test/utils/constants';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: Repository,
          useValue: mockRepository,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: ZulipService,
          useValue: mockZulipService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = await module.resolve<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('showChats', () => {
    it('should return chats', async () => {
      jest
        .spyOn(service, 'showChats')
        .mockResolvedValue({ chats: [mockChat], chat: mockChat });
      const result = await service.showChats(mockUser.id, {});
      expect(result).toEqual({ chats: [mockChat], chat: mockChat || null });
    });
  });

  describe('getChatByUserUlid', () => {
    it('should return chat', async () => {
      jest.spyOn(service, 'getChatByUlid').mockResolvedValue(mockChat);
      const result = await service.getChatByUlid(mockUser.ulid, mockUser.id);
      expect(result).toEqual(mockChat);
    });
  });

  describe('getChatByParticipantUlid', () => {
    it('should return chat', async () => {
      jest
        .spyOn(service, 'getChatByParticipantUlid')
        .mockResolvedValue(mockChat);
      const result = await service.getChatByParticipantUlid(
        mockUser.ulid,
        mockUser.id,
      );
      expect(result).toEqual(mockChat);
    });
  });

  describe('createChat', () => {
    it('should return chat', async () => {
      jest.spyOn(service, 'createChat').mockResolvedValue(mockChat);
      const result = await service.createChat(mockUser.id, mockUser);
      expect(result).toEqual(mockChat);
    });
  });

  describe('sendMessage', () => {
    it('should return message', async () => {
      jest
        .spyOn(service, 'sendMessage')
        .mockResolvedValue(mockZulipMessageResponse as any);
      const result = await service.sendMessage(
        mockChat.ulid,
        mockUser.id,
        'test message',
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('setMessagesRead', () => {
    it('should return message', async () => {
      jest
        .spyOn(service, 'setMessagesRead')
        .mockResolvedValue({ messages: [1] });
      const result = await service.setMessagesRead(mockUser.id, [1]);
      expect(result).toEqual({ messages: [1] });
    });
  });
});
