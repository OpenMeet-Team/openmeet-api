import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixAppServiceController } from './matrix-appservice.controller';
import { UserRoomSyncService } from '../../chat/services/user-room-sync.service';

describe('MatrixAppServiceController', () => {
  let controller: MatrixAppServiceController;

  const mockMatrixConfig = {
    appservice: {
      token: 'test-as-token',
      hsToken: 'test-hs-token',
      id: 'test-appservice-id',
      url: 'http://test.example.com/appservice',
    },
  };

  const mockUserRoomSyncService = {
    handleMemberEvent: jest.fn().mockResolvedValue(undefined),
    syncUserRoomMemberships: jest.fn().mockResolvedValue(undefined),
    queueRoomSync: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatrixAppServiceController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockMatrixConfig),
          },
        },
        {
          provide: UserRoomSyncService,
          useValue: mockUserRoomSyncService,
        },
      ],
    }).compile();

    controller = module.get<MatrixAppServiceController>(
      MatrixAppServiceController,
    );

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('token validation', () => {
    it('should accept valid homeserver token', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should reject invalid tokens', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer invalid-token',
      );
      expect(result).toEqual({ error: 'Invalid token' });
    });
  });

  describe('namespace validation', () => {
    it('should accept openmeet users', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should reject users outside namespace', async () => {
      const result = await controller.queryUser(
        '@regular-user:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({ error: 'User not in namespace' });
    });
  });

  describe('transaction handling', () => {
    it('should process valid transactions', async () => {
      const events = [{ type: 'm.room.message', sender: '@user:example.com' }];
      const result = await controller.handleTransaction(
        'txn123',
        { events },
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should trigger room sync for member join events', async () => {
      const memberJoinEvent = {
        type: 'm.room.member',
        sender: '@user:example.com',
        state_key: '@user:example.com',
        content: { membership: 'join' },
      };

      const result = await controller.handleTransaction(
        'txn456',
        { events: [memberJoinEvent] },
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
      expect(mockUserRoomSyncService.handleMemberEvent).toHaveBeenCalledWith(
        memberJoinEvent,
      );
    });

    it('should not trigger room sync for non-member events', async () => {
      const messageEvent = {
        type: 'm.room.message',
        sender: '@user:example.com',
        content: { msgtype: 'm.text', body: 'Hello' },
      };

      const result = await controller.handleTransaction(
        'txn789',
        { events: [messageEvent] },
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
      expect(mockUserRoomSyncService.handleMemberEvent).not.toHaveBeenCalled();
    });
  });
});
