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
        mockAttendee,
        mockOrganizer,
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
  });
});
