import { Test, TestingModule } from '@nestjs/testing';
import { CalendarInviteListener } from './calendar-invite.listener';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { UserService } from '../../user/user.service';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { AttendanceChangedEvent } from '../../attendance/types';

describe('CalendarInviteListener - Behavior Tests', () => {
  let listener: CalendarInviteListener;
  let sendInviteSpy: jest.SpyInstance;
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };
  let mockEventAttendeeService: { findOne: jest.Mock };
  let mockCalendarInviteService: { sendCalendarInvite: jest.Mock };
  let mockUserService: { findByUlid: jest.Mock };

  const mockTenantConfig = {
    tenantId: 'test',
    appUrl: 'https://test.openmeet.net',
    appName: 'Test OpenMeet',
  };

  const defaultAttendee = {
    id: 1,
    status: EventAttendeeStatus.Confirmed,
    event: {
      id: 1,
      name: 'Test Event',
      user: { id: 2, email: 'organizer@example.com' },
    },
    user: { id: 1, email: 'attendee@example.com' },
  };

  beforeEach(async () => {
    mockEventAttendeeService = {
      findOne: jest.fn().mockResolvedValue(defaultAttendee),
    };

    mockCalendarInviteService = {
      sendCalendarInvite: jest.fn(),
    };

    mockUserService = {
      findByUlid: jest.fn().mockResolvedValue({
        id: 1,
        ulid: 'user-ulid-123',
        email: 'attendee@example.com',
      }),
    };

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass: any) => {
        if (serviceClass === CalendarInviteService) {
          return Promise.resolve(mockCalendarInviteService);
        }
        if (serviceClass === EventAttendeeService) {
          return Promise.resolve(mockEventAttendeeService);
        }
        if (serviceClass === UserService) {
          return Promise.resolve(mockUserService);
        }
        return Promise.resolve({});
      }),
    };

    // Spy on ContextIdFactory.create to verify it's called
    jest.spyOn(ContextIdFactory, 'create').mockReturnValue({
      id: 1,
      getParent: () => undefined,
    } as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarInviteListener,
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConfig: jest.fn().mockReturnValue(mockTenantConfig),
          },
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    listener = module.get(CalendarInviteListener);
    sendInviteSpy = mockCalendarInviteService.sendCalendarInvite;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Dynamic service resolution via ModuleRef', () => {
    it('should resolve EventAttendeeService dynamically via ModuleRef (not constructor-injected)', async () => {
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

      await listener.handleAttendanceChanged(baseEvent);

      // Verify ContextIdFactory.create() was called
      expect(ContextIdFactory.create).toHaveBeenCalled();

      // Verify registerRequestByContextId was called with synthetic request containing tenantId
      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant',
        }),
        expect.anything(),
      );

      // Verify resolve was called for EventAttendeeService
      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        EventAttendeeService,
        expect.anything(),
        { strict: false },
      );
    });

    it('should include x-tenant-id header in synthetic request', async () => {
      const baseEvent: AttendanceChangedEvent = {
        status: 'going',
        previousStatus: null,
        eventUri: null,
        eventId: 1,
        eventSlug: 'test-event',
        userUlid: 'user-ulid-123',
        userDid: 'did:plc:abc',
        tenantId: 'my-tenant',
      };

      await listener.handleAttendanceChanged(baseEvent);

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'my-tenant',
          headers: { 'x-tenant-id': 'my-tenant' },
        }),
        expect.anything(),
      );
    });
  });

  describe('handleAttendanceChanged', () => {
    const baseEvent: AttendanceChangedEvent = {
      status: 'going',
      previousStatus: null,
      eventUri: null,
      eventId: 1,
      eventSlug: 'test-event',
      userUlid: 'user-ulid-123',
      userDid: 'did:plc:abc',
      tenantId: 'test',
    };

    it('should send calendar invite for first-time RSVP to tenant event', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(sendInviteSpy).toHaveBeenCalled();
    });

    it('should NOT send invite when previousStatus is not null (status change, not first RSVP)', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        previousStatus: 'notgoing',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when status is notgoing', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        status: 'notgoing',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite for foreign events (eventId is null)', async () => {
      await listener.handleAttendanceChanged({
        ...baseEvent,
        eventId: null,
        eventSlug: null,
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should not throw on errors', async () => {
      mockModuleRef.resolve.mockRejectedValue(new Error('boom'));

      await expect(
        listener.handleAttendanceChanged(baseEvent),
      ).resolves.not.toThrow();
    });

    it('should resolve UserService via ModuleRef', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        UserService,
        expect.anything(),
        { strict: false },
      );
    });

    it('should look up user by ULID from the event', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(mockUserService.findByUlid).toHaveBeenCalledWith('user-ulid-123');
    });

    it('should filter attendee lookup by both event ID and user ID', async () => {
      await listener.handleAttendanceChanged(baseEvent);

      expect(mockEventAttendeeService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            event: { id: 1 },
            user: { id: 1 },
          },
        }),
      );
    });

    it('should NOT send invite when user is not found by ULID', async () => {
      mockUserService.findByUlid.mockResolvedValue(null);

      await listener.handleAttendanceChanged(baseEvent);

      expect(sendInviteSpy).not.toHaveBeenCalled();
      expect(mockEventAttendeeService.findOne).not.toHaveBeenCalled();
    });
  });
});
