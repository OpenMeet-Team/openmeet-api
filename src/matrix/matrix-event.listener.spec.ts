import { Test, TestingModule } from '@nestjs/testing';
import { MatrixEventListener } from './matrix-event.listener';
import { RoomAliasUtils } from './utils/room-alias.utils';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { EventAttendeeQueryService } from '../event-attendee/event-attendee-query.service';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { UserService } from '../user/user.service';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupService } from '../group/group.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { AttendanceChangedEvent } from '../attendance/types';

// Mock getTenantConfig to return a valid config with matrixConfig
jest.mock('../utils/tenant-config', () => ({
  getTenantConfig: jest.fn().mockReturnValue({
    id: 'test-tenant',
    matrixConfig: {
      serverName: 'matrix.test',
    },
  }),
}));

describe('MatrixEventListener - handleAttendanceChanged', () => {
  let listener: MatrixEventListener;
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };
  let mockGlobalMatrixValidation: { getMatrixHandleForUser: jest.Mock };
  let mockRoomAliasUtils: {
    generateEventRoomAlias: jest.Mock;
    generateGroupRoomAlias: jest.Mock;
  };
  let mockEventAttendeeQueryService: {
    showConfirmedEventAttendeesByEventId: jest.Mock;
  };
  let mockUserService: { findBySlug: jest.Mock; findByUlid: jest.Mock };
  let mockEventQueryService: { showEventBySlugWithTenant: jest.Mock };
  let mockMatrixRoomService: {
    inviteUser: jest.Mock;
    removeUserFromRoom: jest.Mock;
    createRoom: jest.Mock;
  };

  const baseEvent: AttendanceChangedEvent = {
    status: 'going',
    previousStatus: null,
    eventUri: null,
    eventId: 1,
    eventSlug: 'test-event',
    userUlid: 'user-ulid-123',
    userDid: 'did:plc:abc',
    tenantId: 'test-tenant',
  };

  beforeEach(async () => {
    mockUserService = {
      findBySlug: jest.fn(),
      findByUlid: jest.fn().mockResolvedValue({
        id: 1,
        slug: 'test-user',
      }),
    };
    mockEventQueryService = {
      showEventBySlugWithTenant: jest.fn().mockResolvedValue({
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        visibility: 'public',
      }),
    };
    mockMatrixRoomService = {
      inviteUser: jest.fn(),
      removeUserFromRoom: jest.fn(),
      createRoom: jest.fn(),
    };

    mockGlobalMatrixValidation = {
      getMatrixHandleForUser: jest.fn().mockResolvedValue({
        handle: 'test-handle',
      }),
    };

    mockRoomAliasUtils = {
      generateEventRoomAlias: jest
        .fn()
        .mockReturnValue('#event-test-event:matrix.test'),
      generateGroupRoomAlias: jest.fn(),
    };

    mockEventAttendeeQueryService = {
      showConfirmedEventAttendeesByEventId: jest.fn().mockResolvedValue([]),
    };

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass) => {
        if (serviceClass === UserService)
          return Promise.resolve(mockUserService);
        if (serviceClass === EventQueryService)
          return Promise.resolve(mockEventQueryService);
        if (serviceClass === GroupService) return Promise.resolve({});
        if (serviceClass === MatrixRoomService)
          return Promise.resolve(mockMatrixRoomService);
        return Promise.resolve({});
      }),
    };

    jest.spyOn(ContextIdFactory, 'create').mockReturnValue({
      id: 1,
      getParent: () => undefined,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatrixEventListener,
        { provide: RoomAliasUtils, useValue: mockRoomAliasUtils },
        {
          provide: GlobalMatrixValidationService,
          useValue: mockGlobalMatrixValidation,
        },
        {
          provide: EventAttendeeQueryService,
          useValue: mockEventAttendeeQueryService,
        },
        { provide: ModuleRef, useValue: mockModuleRef },
      ],
    }).compile();

    listener = module.get<MatrixEventListener>(MatrixEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip foreign events (eventId is null)', async () => {
    await listener.handleAttendanceChanged({
      ...baseEvent,
      eventId: null,
      eventSlug: null,
    });

    expect(mockMatrixRoomService.inviteUser).not.toHaveBeenCalled();
    expect(mockMatrixRoomService.removeUserFromRoom).not.toHaveBeenCalled();
  });

  it('should invite user to Matrix room when status is going and previousStatus is null', async () => {
    await listener.handleAttendanceChanged(baseEvent);

    expect(mockMatrixRoomService.inviteUser).toHaveBeenCalled();
  });

  it('should remove user from Matrix room when status changes to notgoing', async () => {
    await listener.handleAttendanceChanged({
      ...baseEvent,
      status: 'notgoing',
      previousStatus: 'going',
    });

    expect(mockMatrixRoomService.removeUserFromRoom).toHaveBeenCalled();
  });

  it('should not throw on errors', async () => {
    mockUserService.findByUlid.mockRejectedValue(new Error('boom'));

    await expect(
      listener.handleAttendanceChanged(baseEvent),
    ).resolves.not.toThrow();
  });
});
