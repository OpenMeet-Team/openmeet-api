import { Test, TestingModule } from '@nestjs/testing';
import { ICalendarService } from './ical.service';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';
import { ConfigService } from '@nestjs/config';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../../user/infrastructure/persistence/relational/entities/user.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../../tenant/tenant.service';

describe('ICalendarService', () => {
  let service: ICalendarService;

  const mockRecurrencePatternService = {
    // Add any methods needed
  };

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const mockTenantConnectionService = {
    getTenantConfig: jest.fn().mockReturnValue({
      id: 'test-tenant',
      name: 'Test Tenant',
      frontendDomain: 'platform.example.com',
      logoUrl: 'https://example.com/logo.png',
      companyDomain: 'example.com',
    }),
  };

  const mockRequest = {
    tenantId: 'test-tenant',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ICalendarService,
        {
          provide: RecurrencePatternService,
          useValue: mockRecurrencePatternService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    // Use resolve() for request-scoped providers
    service = await module.resolve<ICalendarService>(ICalendarService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('tenant-aware URL generation', () => {
    const mockEvent: Partial<EventEntity> = {
      id: 1,
      ulid: 'event-ulid-123',
      name: 'Tech Meetup',
      description: 'A great tech meetup event',
      location: '123 Main St, San Francisco, CA',
      slug: 'tech-meetup',
      startDate: new Date('2025-12-01T18:00:00Z'),
      endDate: new Date('2025-12-01T20:00:00Z'),
      timeZone: 'America/Los_Angeles',
      isAllDay: false,
      status: 'published' as any,
    };

    it('should use tenant frontend domain in calendar event URL', () => {
      const calEvent = service.createCalendarEvent(mockEvent as EventEntity);
      const eventString = calEvent.toString();

      expect(eventString).toContain('https://platform.example.com/events/tech-meetup');
      expect(eventString).not.toContain('openmeet.io');
    });

    it('should use tenant frontend domain in generateICalendar', () => {
      const icsContent = service.generateICalendar(mockEvent as EventEntity);

      expect(icsContent).toContain('https://platform.example.com/events/tech-meetup');
      expect(icsContent).not.toContain('openmeet.io');
    });

    it('should use tenant frontend domain in generateICalendarForEvents', () => {
      const icsContent = service.generateICalendarForEvents([mockEvent as EventEntity]);

      expect(icsContent).toContain('https://platform.example.com/events/tech-meetup');
      expect(icsContent).not.toContain('openmeet.io');
    });

    it('should use tenant frontend domain in generateCalendarInvite', () => {
      const mockAttendee = {
        email: 'attendee@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockOrganizer = {
        email: 'organizer@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee,
        mockOrganizer,
      );

      expect(icsContent).toContain('https://platform.example.com/events/tech-meetup');
      expect(icsContent).not.toContain('openmeet.io');
    });
  });

  describe('generateCalendarInvite', () => {
    const mockOrganizer: Partial<UserEntity> = {
      id: 1,
      email: 'organizer@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    const mockAttendee: Partial<UserEntity> = {
      id: 2,
      email: 'attendee@example.com',
      firstName: 'John',
      lastName: 'Doe',
    };

    const mockEvent: Partial<EventEntity> = {
      id: 1,
      ulid: 'event-ulid-123',
      name: 'Tech Meetup',
      description: 'A great tech meetup event',
      location: '123 Main St, San Francisco, CA',
      slug: 'tech-meetup',
      startDate: new Date('2025-12-01T18:00:00Z'),
      endDate: new Date('2025-12-01T20:00:00Z'),
      timeZone: 'America/Los_Angeles',
      isAllDay: false,
      createdAt: new Date('2025-10-01T10:00:00Z'),
      updatedAt: new Date('2025-10-15T12:00:00Z'),
      user: mockOrganizer as UserEntity,
    };

    it('should generate ICS content with METHOD:REQUEST', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('METHOD:REQUEST');
      expect(icsContent).not.toContain('METHOD:PUBLISH');
    });

    it('should include BEGIN:VCALENDAR and END:VCALENDAR', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('END:VCALENDAR');
    });

    it('should include event details', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('Tech Meetup');
      expect(icsContent).toContain('A great tech meetup event');
      // RFC 5545 requires commas to be escaped
      expect(icsContent).toMatch(/123 Main St.*San Francisco.*CA/);
    });

    it('should include organizer with name and email', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toMatch(/ORGANIZER.*Jane Smith/);
      expect(icsContent).toContain('organizer@example.com');
    });

    it('should include attendee with PARTSTAT:ACCEPTED', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toMatch(/ATTENDEE.*John Doe/);
      expect(icsContent).toContain('PARTSTAT=ACCEPTED');
      expect(icsContent).toContain('attendee@example.com');
    });

    it('should include RSVP:TRUE for attendee', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('RSVP=TRUE');
    });

    it('should set STATUS to CONFIRMED', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('STATUS:CONFIRMED');
    });

    it('should include unique UID', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('UID:event-ulid-123');
    });

    it('should include event URL', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      // ical-generator uses URL;VALUE=URI format
      expect(icsContent).toMatch(/URL[;:].*tech-meetup/);
    });

    it('should handle event timezone correctly', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      // Should contain date/time information
      expect(icsContent).toContain('DTSTART');
      expect(icsContent).toContain('DTEND');
    });

    it('should include 24-hour reminder alarm', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('BEGIN:VALARM');
      // ical-generator uses -P1D (1 day) format which equals 24 hours
      expect(icsContent).toMatch(/TRIGGER:-P[T]?1D/);
      expect(icsContent).toContain('ACTION:DISPLAY');
      expect(icsContent).toContain('END:VALARM');
    });

    it('should use OpenMeet PRODID', () => {
      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('PRODID');
      expect(icsContent).toContain('OpenMeet');
    });

    it('should handle organizer without full name gracefully', () => {
      const organizerWithoutName = {
        ...mockOrganizer,
        firstName: '',
        lastName: '',
        name: '',
      };

      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        mockAttendee as UserEntity,
        organizerWithoutName as UserEntity,
      );

      // Should use email username as fallback
      expect(icsContent).toContain('ORGANIZER');
      expect(icsContent).toContain('organizer@example.com');
    });

    it('should handle attendee without full name gracefully', () => {
      const attendeeWithoutName = {
        ...mockAttendee,
        firstName: '',
        lastName: '',
      };

      const icsContent = service.generateCalendarInvite(
        mockEvent as EventEntity,
        attendeeWithoutName as UserEntity,
        mockOrganizer as UserEntity,
      );

      // Should still include attendee
      expect(icsContent).toContain('ATTENDEE');
      expect(icsContent).toContain('attendee@example.com');
    });

    it('should handle all-day events correctly', () => {
      const allDayEvent = {
        ...mockEvent,
        isAllDay: true,
      };

      const icsContent = service.generateCalendarInvite(
        allDayEvent as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('BEGIN:VCALENDAR');
      // All-day events should be formatted differently
    });

    it('should handle missing end date', () => {
      const eventWithoutEndDate = {
        ...mockEvent,
        endDate: null,
      };

      const icsContent = service.generateCalendarInvite(
        eventWithoutEndDate as EventEntity,
        mockAttendee as UserEntity,
        mockOrganizer as UserEntity,
      );

      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('DTSTART');
      // Should handle missing end date gracefully
    });
  });

  describe('existing methods', () => {
    it('should have generateICalendar method', () => {
      expect(service.generateICalendar).toBeDefined();
    });

    it('should have generateICalendarForEvents method', () => {
      expect(service.generateICalendarForEvents).toBeDefined();
    });

    it('should have createCalendarEvent method', () => {
      expect(service.createCalendarEvent).toBeDefined();
    });
  });
});
