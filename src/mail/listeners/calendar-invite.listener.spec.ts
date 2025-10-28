import { Test, TestingModule } from '@nestjs/testing';
import { CalendarInviteListener } from './calendar-invite.listener';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { TenantConnectionService } from '../../tenant/tenant.service';

describe('CalendarInviteListener - Behavior Tests', () => {
  let listener: CalendarInviteListener;
  let sendInviteSpy: jest.SpyInstance;

  const mockTenantConfig = {
    tenantId: 'test',
    appUrl: 'https://test.openmeet.net',
    appName: 'Test OpenMeet',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarInviteListener,
        {
          provide: CalendarInviteService,
          useValue: { sendCalendarInvite: jest.fn() },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 1,
              status: EventAttendeeStatus.Confirmed,
              event: {
                id: 1,
                name: 'Test Event',
                user: { id: 2, email: 'organizer@example.com' },
              },
              user: { id: 1, email: 'attendee@example.com' },
            }),
          },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConfig: jest.fn().mockReturnValue(mockTenantConfig),
          },
        },
      ],
    }).compile();

    listener = module.get(CalendarInviteListener);
    const calendarService = module.get(CalendarInviteService);
    sendInviteSpy = jest.spyOn(calendarService, 'sendCalendarInvite');
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

    it('should NOT send invite when status is Waitlisted', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Waitlisted,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });

    it('should NOT send invite when status is Declined', async () => {
      await listener.handleEventRsvpAdded({
        eventId: 1,
        userId: 1,
        status: EventAttendeeStatus.Declined,
        tenantId: 'test',
      });

      expect(sendInviteSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error resilience (must not crash event processing)', () => {
    it('should not throw when attendee lookup fails', async () => {
      const module = await Test.createTestingModule({
        providers: [
          CalendarInviteListener,
          {
            provide: CalendarInviteService,
            useValue: { sendCalendarInvite: jest.fn() },
          },
          {
            provide: EventAttendeeService,
            useValue: {
              findOne: jest.fn().mockRejectedValue(new Error('DB error')),
            },
          },
          {
            provide: TenantConnectionService,
            useValue: {
              getTenantConfig: jest.fn().mockReturnValue(mockTenantConfig),
            },
          },
        ],
      }).compile();

      const errorListener = module.get(CalendarInviteListener);

      await expect(
        errorListener.handleEventRsvpAdded({
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
  });
});
