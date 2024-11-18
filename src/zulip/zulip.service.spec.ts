import {
  mockGetAdminClient,
  mockGetClient,
  mockUser,
  mockUserService,
  mockZulipClient,
  mockZulipMessage,
  mockZulipStream,
} from '../test/mocks';
import { ZulipService } from './zulip.service';
import { Test } from '@nestjs/testing';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';

jest.mock('./zulip-client', () => ({
  getClient: mockGetClient,
  getAdminClient: mockGetAdminClient,
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
      expect(client).toBeDefined();
    });
  });

  describe('getUserStreams', () => {
    it('should return streams', async () => {
      const streams = await zulipService.getUserStreams(mockUser);
      expect(streams).toBeDefined();
    });
  });

  describe('getUserStreamId', () => {
    it('should return stream id', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const streamId = await zulipService.getUserStreamId(mockUser, 'test');
      expect(streamId).toBeDefined();
    });
  });

  describe('getAdminUsers', () => {
    it('should return users', async () => {
      const users = await zulipService.getAdminUsers();
      expect(users).toBeDefined();
    });
  });

  describe('getUserMessages', () => {
    it('should return messages', async () => {
      const messages = await zulipService.getUserMessages(mockUser, {
        num_before: 0,
        num_after: 1,
        anchor: 'first_unread',
      });
      expect(messages).toBeDefined();
    });
  });

  describe('getUserProfile', () => {
    it('should return profile', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const profile = await zulipService.getUserProfile(mockUser);
      expect(profile).toBeDefined();
    });
  });

  describe('getUserStreamTopics', () => {
    it('should return stream topics', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const topics = await zulipService.getUserStreamTopics(
        mockUser,
        mockZulipStream.id,
      );
      expect(topics).toBeDefined();
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

  describe('fetchApiKey', () => {
    it('should return api key', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const apiKey = await zulipService.fetchApiKey(
        mockUser.email as string,
        mockUser.password as string,
      );
      expect(apiKey).toBeDefined();
    });
  });

  describe('updateUserSettings', () => {
    it('should return user', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const user = await zulipService.updateUserSettings(mockUser, {});
      expect(user).toBeDefined();
    });
  });

  describe('createUser', () => {
    it('should return user', async () => {
      const user = await zulipService.createUser({
        email: mockUser.email as string,
        password: 'secret',
        full_name: mockUser.name as string,
      });
      expect(user).toBeDefined();
    });
  });

  describe('sendUserMessage', () => {
    it('should return message', async () => {
      const message = await zulipService.sendUserMessage(mockUser, {
        to: 'test',
        content: 'test',
        type: 'direct',
      });
      expect(message).toBeDefined();
    });
  });

  describe('updateUserMessage', () => {
    it('should return message', async () => {
      const message = await zulipService.updateUserMessage(
        mockUser,
        mockZulipMessage.id,
        mockZulipMessage.content,
      );
      expect(message).toBeDefined();
    });
  });

  describe('deleteUserMessage', () => {
    it('should return message', async () => {
      const message = await zulipService.deleteUserMessage(
        mockUser,
        mockZulipMessage.id,
      );
      expect(message).toBeDefined();
    });
  });

  describe('addUserMessagesReadFlag', () => {
    it('should return message', async () => {
      const message = await zulipService.addUserMessagesReadFlag(mockUser, []);
      expect(message).toBeDefined();
    });
  });

  describe('removeUserMessagesReadFlag', () => {
    it('should return message', async () => {
      const message = await zulipService.removeUserMessagesReadFlag(
        mockUser,
        [],
      );
      expect(message).toBeDefined();
    });
  });

  describe('subscribeUserToChannel', () => {
    it('should return user', async () => {
      const user = await zulipService.subscribeUserToChannel(mockUser, {
        subscriptions: [{ name: 'test' }],
      });
      expect(user).toBeDefined();
    });
  });

  describe('getAdminMessages', () => {
    it('should return messages', async () => {
      const messages = await zulipService.getAdminMessages({
        anchor: 'first_unread',
        num_before: 0,
        num_after: 1,
      });
      expect(messages).toBeDefined();
    });
  });

  describe('getAdminStreamTopics', () => {
    it('should return stream topics', async () => {
      const topics = await zulipService.getAdminStreamTopics(1);
      expect(topics).toBeDefined();
    });
  });
});
