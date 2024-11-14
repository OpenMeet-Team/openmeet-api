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
      jest.spyOn(service, 'showChats').mockResolvedValue([mockChat]);
      const result = await service.showChats(mockUser.id);
      expect(result).toEqual([mockChat]);
    });
  });

  describe('showChat', () => {
    it('should return chat', async () => {
      jest.spyOn(service, 'showChat').mockResolvedValue(mockChat);
      const result = await service.showChat(mockChat.ulid, mockUser.id);
      expect(result).toEqual(mockChat);
    });
  });

  describe('getChatByUserUlid', () => {
    it('should return chat', async () => {
      jest.spyOn(service, 'getChatByUser').mockResolvedValue(mockChat);
      const result = await service.getChatByUser(mockUser.id, mockUser.ulid);
      expect(result).toEqual(mockChat);
    });
  });

  describe('createChat', () => {
    it('should return chat', async () => {
      jest.spyOn(service, 'createChat').mockResolvedValue(mockChat);
      const result = await service.createChat(mockUser.id, mockUser.ulid);
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
});
