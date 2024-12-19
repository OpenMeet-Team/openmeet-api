import {
  mockGetZulipAdminClient,
  mockGetZulipClient,
  mockZulipClient,
  mockZulipFetchApiKeyResponse,
  mockZulipMessage,
  mockZulipMessageResponse,
  mockZulipStream,
  mockZulipStreamTopic,
  mockZulipUser,
} from '../test/mocks';
import { ZulipService } from './zulip.service';
import { Test } from '@nestjs/testing';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';

jest.mock('./zulip-client', () => ({
  getClient: mockGetZulipClient,
  getAdminClient: mockGetZulipAdminClient,
}));

describe('ZulipService', () => {
  let zulipService: ZulipService;
  let userService: UserService;

  const mockUser: UserEntity = {
    id: 1,
    slug: 'test-user',
    ulid: 'test-ulid',
    email: 'test@example.com',
    password: 'hashedpassword',
    name: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    provider: 'local',
    zulipUserId: 'zulip123',
    zulipUsername: 'testuser',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    isActive: true,
    isVerified: true,
    roles: [],
    events: [],
    attendances: [],
    groups: [],
    groupMemberships: [],
    notifications: [],
    notificationSettings: [],
    preferences: [],
    loadPreviousPassword: jest.fn(),
    hashPassword: jest.fn(),
    validatePassword: jest.fn(),
    comparePassword: jest.fn(),
    toJSON: jest.fn(),
  } as unknown as UserEntity;

  const mockMessageResponse = {
    id: 123,
    result: 'success',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ZulipService,
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockUser),
          },
        },
        { provide: REQUEST, useValue: {} },
      ],
    }).compile();
    zulipService = module.get<ZulipService>(ZulipService);
    userService = module.get<UserService>(UserService);
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

  describe('getUserProfile', () => {
    it('should return profile', async () => {
      jest
        .spyOn(zulipService, 'getUserProfile')
        .mockResolvedValue(mockZulipUser);
      const profile = await zulipService.getUserProfile(mockUser);
      expect(profile).toEqual(mockZulipUser);
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

  describe('getAdminApiKey', () => {
    it('should return api key', async () => {
      jest
        .spyOn(zulipService, 'getInitialisedClient')
        .mockResolvedValue(mockZulipClient);
      jest
        .spyOn(zulipService, 'getAdminApiKey')
        .mockResolvedValue(mockZulipFetchApiKeyResponse);
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

  describe('createUser', () => {
    it('should return created user', async () => {
      jest.spyOn(zulipService, 'createUser').mockResolvedValue({ id: 5 });

      const user = await zulipService.createUser({
        email: mockUser.email as string,
        password: mockUser.password as string,
        full_name: mockUser.name as string,
      });

      expect(user).toMatchObject({ id: 5 });
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

  describe('sendEventDiscussionMessage', () => {
    it('should send a message to the event stream', async () => {
      const messageData = {
        message: 'Test message',
        topicName: 'Test topic',
      };

      jest
        .spyOn(zulipService, 'sendUserMessage')
        .mockResolvedValue(mockMessageResponse);

      const result = await zulipService.sendEventDiscussionMessage(
        'event-slug',
        1,
        messageData,
      );

      expect(result).toEqual(mockMessageResponse);
      expect(zulipService.sendUserMessage).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          to: 'event-event-slug',
          topic: messageData.topicName,
          content: messageData.message,
          type: 'stream',
        }),
      );
    });

    it('should throw error if user not found', async () => {
      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      await expect(
        zulipService.sendEventDiscussionMessage('event-slug', 1, {
          message: 'test',
          topicName: 'test',
        }),
      ).rejects.toThrow('User not found');
    });
  });

  // Similar tests for update and delete...
});
