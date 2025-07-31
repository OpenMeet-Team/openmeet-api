import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatrixAppServiceController } from './matrix-appservice.controller';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { MatrixRoomService } from '../services/matrix-room.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventAttendeeQueryService } from '../../event-attendee/event-attendee-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { GlobalMatrixValidationService } from '../services/global-matrix-validation.service';
import { GroupMemberQueryService } from '../../group-member/group-member-query.service';
import { GroupRoleService } from '../../group-role/group-role.service';

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

  const mockEventQueryService = {
    showEventBySlugWithTenant: jest.fn().mockResolvedValue(null),
  };

  const mockGroupService = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockMatrixRoomService = {
    createRoom: jest
      .fn()
      .mockResolvedValue({ roomId: '!test:matrix.example.com' }),
  };

  const mockEventAttendeeQueryService = {
    showConfirmedEventAttendeesByEventId: jest.fn().mockResolvedValue([]),
    isUserAllowedToChat: jest.fn().mockResolvedValue(false),
  };

  const mockGlobalMatrixValidationService = {
    getMatrixHandleForUser: jest.fn().mockResolvedValue(null),
  };

  const mockTenantConnectionService = {
    getTenantConnection: jest.fn().mockResolvedValue(null),
  };

  const mockEventManagementService = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
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
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
        {
          provide: MatrixRoomService,
          useValue: mockMatrixRoomService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: EventAttendeeQueryService,
          useValue: mockEventAttendeeQueryService,
        },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalMatrixValidationService,
        },
        {
          provide: GroupMemberQueryService,
          useValue: {
            getConfirmedGroupMembersForMatrix: jest.fn(),
            findGroupMemberByUserId: jest.fn(),
            findGroupMemberByUserSlugAndGroupSlug: jest.fn(),
            createGroupOwner: jest.fn(),
            updateGroupMemberRole: jest.fn(),
            leaveGroup: jest.fn(),
            removeGroupMember: jest.fn(),
            findGroupDetailsMembers: jest.fn(),
            approveMember: jest.fn(),
            rejectMember: jest.fn(),
            createGroupMember: jest.fn(),
            getGroupMembersCount: jest.fn(),
            getMailServiceGroupMember: jest.fn(),
            getMailServiceGroupMembersByPermission: jest.fn(),
            getSpecificGroupMembers: jest.fn(),
            showGroupDetailsMember: jest.fn(),
          },
        },
        {
          provide: GroupRoleService,
          useValue: {
            // Mock methods if needed by the service
          },
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
    it('should accept all users (Matrix-native approach)', async () => {
      const result = await controller.queryUser(
        '@any-user:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
    });

    it('should accept openmeet users', async () => {
      const result = await controller.queryUser(
        '@openmeet-bot-test:matrix.example.com',
        'Bearer test-hs-token',
      );
      expect(result).toEqual({});
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

    it('should handle member join events (Matrix-native logging)', async () => {
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
    });

    it('should handle message events (Matrix-native logging)', async () => {
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
    });
  });

  describe('room alias conflict handling', () => {
    const mockEvent = {
      id: 123,
      slug: 'test-event',
      name: 'Test Event',
    };

    beforeEach(() => {
      mockEventQueryService.showEventBySlugWithTenant.mockResolvedValue(
        mockEvent,
      );
    });

    it('should return success when room creation succeeds', async () => {
      mockMatrixRoomService.createRoom.mockResolvedValue({
        roomId: '!test:matrix.example.com',
      });

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
      expect(mockMatrixRoomService.createRoom).toHaveBeenCalled();
    });

    it('should treat "Room alias already taken" as success', async () => {
      const roomAlreadyTakenError = new Error('Room alias already taken');
      mockMatrixRoomService.createRoom.mockRejectedValue(roomAlreadyTakenError);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
      expect(mockMatrixRoomService.createRoom).toHaveBeenCalled();
    });

    it('should treat "MatrixError: [400]" as success', async () => {
      const matrix400Error = new Error(
        'MatrixError: [400] Room alias already taken',
      );
      mockMatrixRoomService.createRoom.mockRejectedValue(matrix400Error);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
    });

    it('should treat "MatrixError: [409]" as success', async () => {
      const matrix409Error = new Error(
        'MatrixError: [409] Room alias already exists',
      );
      mockMatrixRoomService.createRoom.mockRejectedValue(matrix409Error);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
    });

    it('should treat "alias already taken" as success', async () => {
      const aliasConflictError = new Error(
        'M_ROOM_IN_USE: alias already taken',
      );
      mockMatrixRoomService.createRoom.mockRejectedValue(aliasConflictError);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
    });

    it('should treat "already exists" as success', async () => {
      const existsError = new Error('Room already exists');
      mockMatrixRoomService.createRoom.mockRejectedValue(existsError);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({});
    });

    it('should return error for genuine Matrix failures', async () => {
      const genuineError = new Error(
        'MatrixError: [500] Internal server error',
      );
      mockMatrixRoomService.createRoom.mockRejectedValue(genuineError);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({ error: 'Room not found' });
    });

    it('should return error for network failures', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockMatrixRoomService.createRoom.mockRejectedValue(networkError);

      const result = await controller.queryRoomStandard(
        '#event-test-event-tenant123:matrix.openmeet.net',
        'Bearer test-hs-token',
      );

      expect(result).toEqual({ error: 'Room not found' });
    });
  });
});
