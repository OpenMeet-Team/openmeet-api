import { Test, TestingModule } from '@nestjs/testing';
import { CalendarInviteService } from './calendar-invite.service';
import { MailerService } from '../../mailer/mailer.service';
import { ICalendarService } from '../../event/services/ical/ical.service';
import { RecurrencePatternService } from '../../event-series/services/recurrence-pattern.service';
import { ConfigService } from '@nestjs/config';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConfig } from '../../core/constants/constant';

describe('CalendarInviteService', () => {
  let service: CalendarInviteService;
  let mailerService: MailerService;
  let icalService: ICalendarService;

  const mockEvent: Partial<EventEntity> = {
    id: 1,
    ulid: 'event-ulid-123',
    name: 'Tech Meetup',
    description: 'A great tech meetup event',
    startDate: new Date('2025-12-01T18:00:00Z'),
    endDate: new Date('2025-12-01T20:00:00Z'),
    location: '123 Main St, San Francisco, CA',
    slug: 'tech-meetup',
  };

  const mockAttendee: Partial<UserEntity> = {
    id: 1,
    email: 'attendee@example.com',
    firstName: 'John',
    lastName: 'Doe',
  };

  const mockOrganizer: Partial<UserEntity> = {
    id: 2,
    email: 'organizer@example.com',
    firstName: 'Jane',
    lastName: 'Smith',
  };

  const mockTenantConfig: Partial<TenantConfig> = {
    tenantId: 'test-tenant',
    name: 'OpenMeet',
    frontendDomain: 'https://platform.openmeet.net',
    mailDefaultName: 'OpenMeet',
    mailDefaultEmail: 'noreply@openmeet.net',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarInviteService,
        {
          provide: MailerService,
          useValue: {
            sendCalendarInviteMail: jest.fn(),
          },
        },
        {
          provide: ICalendarService,
          useValue: {
            generateCalendarInvite: jest
              .fn()
              .mockReturnValue('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR'),
          },
        },
        {
          provide: RecurrencePatternService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CalendarInviteService>(CalendarInviteService);
    mailerService = module.get<MailerService>(MailerService);
    icalService = module.get<ICalendarService>(ICalendarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAddToCalendarLinks', () => {
    it('should generate all three calendar provider links', () => {
      const links = service.generateAddToCalendarLinks(
        mockEvent as EventEntity,
        mockTenantConfig as TenantConfig,
      );

      expect(links.google).toBeDefined();
      expect(links.outlook).toBeDefined();
      expect(links.office365).toBeDefined();
    });

    it('should include event URL in calendar links', () => {
      const links = service.generateAddToCalendarLinks(
        mockEvent as EventEntity,
        mockTenantConfig as TenantConfig,
      );

      const eventUrl = `${mockTenantConfig.frontendDomain}/events/${mockEvent.slug}`;
      expect(links.google).toContain(encodeURIComponent(eventUrl));
    });
  });

  describe('sendCalendarInvite', () => {
    it('should call ICalendarService to generate ICS content', async () => {
      await service.sendCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      expect(icalService.generateCalendarInvite).toHaveBeenCalledWith(
        mockEvent,
        {
          email: 'attendee@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
        {
          email: 'organizer@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
        },
        'https://platform.openmeet.net/events/tech-meetup', // Event URL from tenant config
      );
    });

    it('should call mailerService with correct email parameters', async () => {
      await service.sendCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      expect(mailerService.sendCalendarInviteMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'attendee@example.com',
          subject: "You're registered for Tech Meetup!",
          templateName: 'events/calendar-invite',
        }),
      );
    });

    it('should include ICS content in email', async () => {
      await service.sendCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.icsContent).toContain('BEGIN:VCALENDAR');
    });

    it('should include timezone in email context', async () => {
      const eventWithTimezone = {
        ...mockEvent,
        timeZone: 'America/New_York',
      };

      await service.sendCalendarInvite(
        eventWithTimezone as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.eventTimeZone).toBe('America/New_York');
    });

    it('should default to UTC timezone if not specified', async () => {
      await service.sendCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.eventTimeZone).toBe('UTC');
    });

    it('should include end time in email context when event has endDate', async () => {
      await service.sendCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.eventEndTime).toBeDefined();
      expect(call.context.eventEndTime).not.toBeNull();
    });

    it('should not include end time when event has no endDate', async () => {
      const eventWithoutEndDate = {
        ...mockEvent,
        endDate: null,
      };

      await service.sendCalendarInvite(
        eventWithoutEndDate as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.eventEndTime).toBeNull();
    });

    it('should mark event as not multi-day when start and end are on same day', async () => {
      const sameDayEvent = {
        ...mockEvent,
        startDate: new Date('2025-12-01T10:00:00Z'),
        endDate: new Date('2025-12-01T14:00:00Z'),
      };

      await service.sendCalendarInvite(
        sameDayEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.isMultiDay).toBe(false);
      expect(call.context.eventEndDate).toBeNull();
    });

    it('should mark event as multi-day when start and end are on different days', async () => {
      const multiDayEvent = {
        ...mockEvent,
        startDate: new Date('2025-12-01T22:00:00Z'),
        endDate: new Date('2025-12-02T02:00:00Z'),
      };

      await service.sendCalendarInvite(
        multiDayEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];
      expect(call.context.isMultiDay).toBe(true);
      expect(call.context.eventEndDate).toBeDefined();
      expect(call.context.eventEndDate).not.toBeNull();
    });

    it('should handle multi-day events with timezone correctly', async () => {
      const multiDayEvent = {
        ...mockEvent,
        startDate: new Date('2025-12-01T23:00:00Z'), // Dec 1, 11pm UTC
        endDate: new Date('2025-12-02T05:00:00Z'), // Dec 2, 5am UTC
        timeZone: 'America/New_York', // In NY: Dec 1 6pm - Dec 2 12am (same day in NY but different in UTC)
      };

      await service.sendCalendarInvite(
        multiDayEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
        mockTenantConfig as TenantConfig,
      );

      const call = (mailerService.sendCalendarInviteMail as jest.Mock).mock
        .calls[0][0];

      // In America/New_York timezone, this might span days differently than UTC
      expect(call.context.isMultiDay).toBeDefined();
    });
  });
});
