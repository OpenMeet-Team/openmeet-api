import { mockUser, mockUserService, mockZulipStream } from '../test/mocks';
import { ZulipService } from './zulip.service';
import { Test } from '@nestjs/testing';
import { UserService } from '../user/user.service';

describe.skip('ZulipService', () => {
  let zulipService: ZulipService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ZulipService,
        { provide: UserService, useValue: mockUserService },
      ],
    }).compile();
    zulipService = module.get<ZulipService>(ZulipService);
  });

  it('should be defined', () => {
    expect(zulipService).toBeDefined();
  });

  describe('getUserStreams', () => {
    it('should return streams', async () => {
      const streams = await zulipService.getUserStreams(mockUser);
      expect(streams).toBeDefined();
    });
  });

  describe('getUserStreamId', () => {
    it('should return stream id', async () => {
      const streamId = await zulipService.getUserStreamId(mockUser, 'test');
      expect(streamId).toBeDefined();
    });
  });

  describe('getUsers', () => {
    it('should return users', async () => {
      const users = await zulipService.getUsers();
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
      const profile = await zulipService.getUserProfile(mockUser);
      expect(profile).toBeDefined();
    });
  });

  describe('getUserStreamTopics', () => {
    it('should return stream topics', async () => {
      const topics = await zulipService.getUserStreamTopics(
        mockUser,
        mockZulipStream.id,
      );
      expect(topics).toBeDefined();
    });
  });

  describe('getAdminSettings', () => {
    it('should return settings', async () => {
      const settings = await zulipService.getAdminSettings();
      expect(settings).toBeDefined();
    });
  });

  describe('fetchApiKey', () => {
    it('should return api key', async () => {
      const apiKey = await zulipService.fetchApiKey(
        mockUser.email as string,
        mockUser.password as string,
      );
      expect(apiKey).toBeDefined();
    });
  });

  describe('createUser', () => {
    it('should return user', async () => {
      const user = await zulipService.createUser(mockUser);
      expect(user).toBeDefined();
    });
  });

  describe('getAdminUsers', () => {
    it('should return users', async () => {
      const users = await zulipService.getAdminUsers();
      expect(users).toBeDefined();
    });
  });

  describe('sendUserMessage', () => {
    it('should return message', async () => {
      const message = await zulipService.sendUserMessage(mockUser, {});
      expect(message).toBeDefined();
    });
  });
});
