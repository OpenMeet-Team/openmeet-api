import { Test, TestingModule } from '@nestjs/testing';
import { CalendarInviteListener } from './calendar-invite.listener';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';

describe('CalendarInviteListener - Behavior Tests', () => {
  let listener: CalendarInviteListener;
  let sendInviteSpy: jest.SpyInstance;
  let mockModuleRef: {
    registerRequestByContextId: jest.Mock;
    resolve: jest.Mock;
  };
  let mockEventAttendeeService: { findOne: jest.Mock };
  let mockCalendarInviteService: { sendCalendarInvite: jest.Mock };

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

    mockModuleRef = {
      registerRequestByContextId: jest.fn(),
      resolve: jest.fn().mockImplementation((serviceClass: any) => {
        if (serviceClass === CalendarInviteService) {
          return Promise.resolve(mockCalendarInviteService);
        }
        if (serviceClass === EventAttendeeService) {
          return Promise.resolve(mockEventAttendeeService);
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
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test-tenant',
      });

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
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'my-tenant',
      });

      expect(mockModuleRef.registerRequestByContextId).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'my-tenant',
          headers: { 'x-tenant-id': 'my-tenant' },
        }),
        expect.anything(),
      );
    });
  });

  describe('Status-based filtering (core business logic)', () => {
    it('should send invite when status is Confirmed', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).toHaveBeenCalled();
    });

    it('should NOT send invite when status is Pending', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Pending,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when status is Waitlist', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Waitlist,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when status is Cancelled', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Cancelled,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT resolve services when status is not Confirmed', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Pending,
        tenantId: 'test',
      });

      // Should short-circuit before resolving services
      expect(mockModuleRef.resolve).not.toHaveBeenCalled();
    });
  });

  describe('Email validation', () => {
    it('should NOT send invite when attendee has no email', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: { id: 1, email: null },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when attendee email is empty string', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: { id: 1, email: '' },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });
  });

  describe('Email notification preference', () => {
    it('should NOT send invite when user opted out of email notifications', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: {
          id: 1,
          email: 'attendee@example.com',
          preferences: { notifications: { email: false } },
        },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should send invite when user has email notifications enabled', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: {
          id: 1,
          email: 'attendee@example.com',
          preferences: { notifications: { email: true } },
        },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).toHaveBeenCalled();
    });

    it('should send invite when user has no notification preferences set (default)', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: {
          id: 1,
          email: 'attendee@example.com',
          preferences: {},
        },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).toHaveBeenCalled();
    });
  });

  describe('Self-notification guard', () => {
    it('should NOT send invite when attendee is the event creator', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        event: {
          id: 1,
          name: 'Test Event',
          user: { id: 1, email: 'creator@example.com' },
        },
        user: { id: 1, email: 'creator@example.com' },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });
  });

  describe('Missing data guards', () => {
    it('should NOT send invite when attendee record is not found', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue(null);

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when event is missing from attendee', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        event: null,
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when event has no organizer', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        event: { id: 1, name: 'Test Event', user: null },
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when user is missing from attendee', async () => {
      mockEventAttendeeService.findOne.mockResolvedValue({
        ...defaultAttendee,
        user: null,
      });

      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Confirmed,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error resilience (must not crash event processing)', () => {
    it('should not throw when attendee lookup fails', async () => {
      mockEventAttendeeService.findOne.mockRejectedValue(new Error('DB error'));

      await expect(
        listener.handleEventRsvpAdded({
          eventId: 1,
          userId: 1,
          status: EventAttendeeStatus.Confirmed,
          tenantId: 'test',
        }),
      ).resolves.not.toThrow();
    });

    it('should not throw when email sending fails', async () => {
      sendInviteSpy.mockRejectedValue(new Error('SMTP error'));

      await expect(
        listener.handleEventRsvpAdded({
          eventId: 1,
          userId: 1,
          status: EventAttendeeStatus.Confirmed,
          tenantId: 'test',
        }),
      ).resolves.not.toThrow();
    });

    it('should not throw when ModuleRef resolution fails', async () => {
      mockModuleRef.resolve.mockRejectedValue(
        new Error('Cannot resolve service'),
      );

      await expect(
        listener.handleEventRsvpAdded({
          eventId: 1,
          userId: 1,
          status: EventAttendeeStatus.Confirmed,
          tenantId: 'test',
        }),
      ).resolves.not.toThrow();
    });
  });
});
