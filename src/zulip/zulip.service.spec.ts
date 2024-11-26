import {
  mockGetZulipAdminClient,
  mockGetZulipClient,
  mockUser,
  mockUserService,
  mockZulipClient,
  mockZulipFetchApiKeyResponse,
  mockZulipMessage,
  mockZulipMessageResponse,
  mockZulipStream,
  mockZulipStreamTopic,
} from '../test/mocks';
import { ZulipService } from './zulip.service';
import { Test } from '@nestjs/testing';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';

jest.mock('./zulip-client', () => ({
  getClient: mockGetZulipClient,
  getAdminClient: mockGetZulipAdminClient,
}));

describe('ZulipService', () => {
  let zulipService: ZulipService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ZulipService,
        { provide: UserService, useValue: mockUserService },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    zulipService = module.get<ZulipService>(ZulipService);
  });

  it('should be defined', () => {
    expect(zulipService).toBeDefined();
  });

  describe('getInitialisedClient', () => {
    it('should return client', async () => {
      const client = await zulipService.getInitialisedClient(mockUser);
      expect(client).toEqual(mockZulipClient);
    });
  });

  describe('getUserStreams', () => {
    it('should return streams', async () => {
      const streams = await zulipService.getUserStreams(mockUser);
      expect(streams).toBeDefined();
    });
  });

  describe('getAdminUsers', () => {
    it('should return admin users', async () => {
      const users = await zulipService.getAdminUsers();
      expect(users).toBeDefined();
    });
  });

  describe('getUserMessages', () => {
    it('should return user messages', async () => {
      const messages = await zulipService.getUserMessages(mockUser, {
        num_before: 0,
        num_after: 1,
        anchor: 'oldest',
      });
      expect(messages).toEqual([mockZulipMessage]);
    });
  });

  describe.skip('getUserProfile', () => {
    it('should return profile', async () => {
      const profile = await zulipService.getUserProfile(mockUser);
      expect(profile).toBeDefined();
    });
  });

  describe('getUserStreamTopics', () => {
    it('should return user stream topics', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const topics = await zulipService.getUserStreamTopics(
        mockUser,
        mockZulipStream.id,
      );
      expect(topics).toEqual([mockZulipStreamTopic]);
    });
  });

  describe('getAdminSettings', () => {
    it('should return settings', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const settings = await zulipService.getAdminSettings();
      expect(settings).toBeDefined();
    });
  });

  describe.skip('getAdminApiKey', () => {
    it('should return api key', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const apiKeyResponse = await zulipService.getAdminApiKey(
        mockUser.zulipUsername as string,
        mockUser.password as string,
      );
      expect(apiKeyResponse).toEqual(mockZulipFetchApiKeyResponse);
    });
  });

  describe.skip('updateUserProfile', () => {
    it('should return updated user', async () => {
      const user = await zulipService.updateUserProfile(mockUser, {
        full_name: mockUser.name,
      });
      expect(user).toBeDefined();
    });
  });

  describe.skip('createUser', () => {
    it('should return created user', async () => {
      const user = await zulipService.createUser({
        email: mockUser.email as string,
        password: mockUser.password as string,
        full_name: mockUser.name as string,
      });
      expect(user).toMatchObject({ id: mockUser.zulipUserId });
    });
  });

  describe('sendUserMessage', () => {
    it('should return message id after sending', async () => {
      const message = await zulipService.sendUserMessage(mockUser, {
        to: 'test',
        content: 'test',
        type: 'direct',
      });
      expect(message).toBeDefined();
    });
  });

  describe('updateUserMessage', () => {
    it('should return message id after updating', async () => {
      const message = await zulipService.updateUserMessage(
        mockUser,
        mockZulipMessage.id,
        mockZulipMessage.content,
      );
      expect(message).toBeDefined();
    });
  });

  describe('deleteUserMessage', () => {
    it('should return message id after deleting', async () => {
      const message = await zulipService.deleteUserMessage(
        mockUser,
        mockZulipMessage.id,
      );
      expect(message).toBeDefined();
    });
  });

  describe('addUserMessagesReadFlag', () => {
    it('should return message id after adding read flag', async () => {
      const message = await zulipService.addUserMessagesReadFlag(mockUser, []);
      expect(message).toBeDefined();
    });
  });

  describe('removeUserMessagesReadFlag', () => {
    it('should return message id after removing read flag', async () => {
      const message = await zulipService.removeUserMessagesReadFlag(
        mockUser,
        [],
      );
      expect(message).toBeDefined();
    });
  });

  describe('subscribeUserToChannel', () => {
    it('should return user id after subscribing', async () => {
      const user = await zulipService.subscribeUserToChannel(mockUser, {
        subscriptions: [{ name: 'test' }],
      });
      expect(user).toBeDefined();
    });
  });

  describe('getAdminMessages', () => {
    it('should return admin messages', async () => {
      const messages = await zulipService.getAdminMessages({
        anchor: 'oldest',
        num_before: 0,
        num_after: 1,
      });
      expect(messages).toEqual([mockZulipMessage]);
    });
  });

  describe('getAdminStreamTopics', () => {
    it('should return admin stream topics', async () => {
      const topics = await zulipService.getAdminStreamTopics(
        mockZulipStream.id,
      );
      expect(topics).toEqual([mockZulipStreamTopic]);
    });
  });

  describe('updateAdminMessage', () => {
    it('should return message id after updating', async () => {
      const message = await zulipService.updateAdminMessage(1, 'test');
      expect(message).toEqual(mockZulipMessageResponse);
    });
  });

  describe('deleteAdminMessage', () => {
    it('should return message id after deleting', async () => {
      const message = await zulipService.deleteAdminMessage(1);
      expect(message).toBeDefined();
    });
  });
});
