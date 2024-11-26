import {
  mockGetAdminClient,
  mockGetClient,
  mockUser,
  mockUserService,
  mockZulipClient,
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

  describe.skip('getUserStreamId', () => {
    it('should return user stream id', async () => {
      const stream = await zulipService.getUserStreamId(
        mockUser,
        mockZulipStream.name,
      );
      expect(stream).toEqual({ id: mockZulipStream.id });
    });
  });

  describe.skip('getAdminUsers', () => {
    it('should return users', async () => {
      const users = await zulipService.getAdminUsers();
      console.log('users', users);
      expect(users).toBeDefined();
    });
  });

  describe.skip('getUserMessages', () => {
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
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      const profile = await zulipService.getUserProfile(mockUser);
      expect(profile).toBeDefined();
    });
  });

  describe.skip('getUserStreamTopics', () => {
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

  describe.skip('getAdminSettings', () => {
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

  describe.skip('updateUserSettings', () => {
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

  describe.skip('sendUserMessage', () => {
    it('should return message id after sending', async () => {
      const message = await zulipService.sendUserMessage(mockUser, {
        to: 'test',
        content: 'test',
        type: 'direct',
      });
      expect(message).toBeDefined();
    });
  });

  describe.skip('updateUserMessage', () => {
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

  describe.skip('getAdminMessages', () => {
    it('should return admin messages', async () => {
      const messages = await zulipService.getAdminMessages({
        anchor: 'oldest',
        num_before: 0,
        num_after: 1,
      });
      expect(messages).toEqual([mockZulipMessage]);
    });
  });

  describe.skip('getAdminStreamTopics', () => {
    it('should return admin stream topics', async () => {
      const topics = await zulipService.getAdminStreamTopics(
        mockZulipStream.id,
      );
      expect(topics).toEqual([mockZulipStreamTopic]);
    });
  });

  describe.skip('updateAdminMessage', () => {
    it('should return message id after updating', async () => {
      const message = await zulipService.updateAdminMessage(1, 'test');
      expect(message).toEqual(mockZulipMessageResponse);
    });
  });

  describe.skip('deleteAdminMessage', () => {
    it('should return message id after deleting', async () => {
      const message = await zulipService.deleteAdminMessage(1);
      expect(message).toBeDefined();
    });
  });
});
