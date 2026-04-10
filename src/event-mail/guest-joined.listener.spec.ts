import { Test, TestingModule } from '@nestjs/testing';
import { GuestJoinedListener } from './guest-joined.listener';
import { EventMailService } from './event-mail.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { AttendanceChangedEvent } from '../attendance/types';

describe('GuestJoinedListener', () => {
  let listener: GuestJoinedListener;
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };
  let mockEventAttendeeService: { findOne: jest.Mock };
  let mockEventMailService: { sendMailAttendeeGuestJoined: jest.Mock };
  let mockUserService: { findByUlid: jest.Mock };

  const defaultUser = { id: 1, ulid: 'user-ulid-123' };

  const defaultAttendee = {
    id: 1,
    status: 'Confirmed',
    event: {
      id: 10,
      name: 'Test Event',
      user: { id: 2, email: 'organizer@example.com' },
    },
    user: defaultUser,
  };

  const baseEvent: AttendanceChangedEvent = {
    status: 'going',
    previousStatus: null,
    eventUri: null,
    eventId: 10,
    eventSlug: 'test-event',
    userUlid: 'user-ulid-123',
    userDid: 'did:plc:abc',
    tenantId: 'test-tenant',
  };

  beforeEach(async () => {
    mockEventAttendeeService = {
      findOne: jest.fn().mockResolvedValue(defaultAttendee),
    };

    mockEventMailService = {
      sendMailAttendeeGuestJoined: jest.fn(),
    };

    mockUserService = {
      findByUlid: jest.fn().mockResolvedValue(defaultUser),
    };

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass: any) => {
        if (serviceClass === EventAttendeeService) {
          return Promise.resolve(mockEventAttendeeService);
        }
        if (serviceClass === EventMailService) {
          return Promise.resolve(mockEventMailService);
        }
        if (serviceClass === UserService) {
          return Promise.resolve(mockUserService);
        }
        return Promise.resolve({});
      }),
    };

    jest.spyOn(ContextIdFactory, 'create').mockReturnValue({
      id: 1,
      getParent: () => undefined,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuestJoinedListener,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConfig: jest.fn(),
          },
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    listener = module.get(GuestJoinedListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleAttendanceChanged', () => {
    it('should have @OnEvent(attendance.changed) decorator', () => {
      const metadata = Reflect.getMetadata(
        'EVENT_LISTENER_METADATA',
        listener.handleAttendanceChanged,
      );
      // OnEvent stores metadata; verify the method exists and is decorated
      expect(metadata).toBeDefined();
      expect(metadata.map((m: any) => m.event)).toContain('attendance.changed');
    });

    it('should call sendMailAttendeeGuestJoined for first-time going RSVP', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(mockUserService.findByUlid).toHaveBeenCalledWith('user-ulid-123');
      expect(mockEventAttendeeService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            event: { id: 10 },
            user: { id: 1 },
          },
        }),
      );
      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).toHaveBeenCalledWith(defaultAttendee);
    });

    it('should call sendMailAttendeeGuestJoined for first-time maybe RSVP', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'maybe',
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).toHaveBeenCalledWith(defaultAttendee);
    });

    it('should NOT fire when previousStatus is not null (status change)', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        previousStatus: 'notgoing',
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should NOT fire when status is notgoing', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'notgoing',
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should NOT fire for foreign events (eventId is null)', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should NOT fire when status is pending', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'pending',
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should NOT fire when status is waitlist', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'waitlist',
      });

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should skip if user not found', async () => {
      mockUserService.findByUlid.mockResolvedValue(null);

      await listener.handleAttendanceChanged(baseEvent);

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should skip if attendee not found', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(null);

      await listener.handleAttendanceChanged(baseEvent);

      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully (log and continue)', async () => {
      mockModuleRef.resolve.mockRejectedValue(new Error('boom'));

      await expect(
        listener.handleAttendanceChanged(baseEvent),
      ).resolves.not.toThrow();
    });

    it('should resolve services dynamically via ModuleRef', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(ContextIdFactory.create).toHaveBeenCalled();
      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
          headers: { 'x-tenant-id': 'test-tenant' },
        }),
        expect.anything(),
      );
      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        EventMailService,
        expect.anything(),
        { strict: false },
      );
      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        UserService,
        expect.anything(),
        { strict: false },
      );
    });
  });
});
