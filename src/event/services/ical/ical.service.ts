import { Injectable, Inject, forwardRef, Logger, Scope } from '@nestjs/common';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import icalGenerator from 'ical-generator';
import { ConfigService } from '@nestjs/config';
import { RecurrenceRule } from '../../../event-series/interfaces/recurrence.interface';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';
import { EventStatus } from '../../../core/constants/constant';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { toZonedTime } from 'date-fns-tz';

@Injectable({ scope: Scope.REQUEST })
export class ICalendarService {
  private readonly logger = new Logger(ICalendarService.name);

  constructor(
    @Inject(forwardRef(() => RecurrencePatternService))
    private readonly recurrencePatternService: RecurrencePatternService,
    private readonly configService: ConfigService,
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantService: TenantConnectionService,
  ) {}

  /**
   * Get the frontend domain for the current tenant
   */
  private getFrontendDomain(): string {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      // Fallback to default domain if no tenant context
      return 'openmeet.io';
    }
    const tenantConfig = this.tenantService.getTenantConfig(tenantId);
    return tenantConfig.frontendDomain;
  }

  /**
   * Create an iCalendar event from an EventEntity
   */
  public createCalendarEvent(
    event: EventEntity,
  ): ReturnType<ReturnType<typeof icalGenerator>['createEvent']> {
    // Use event's timezone or fallback to UTC
    const timezone = event.timeZone || 'UTC';

    // Convert UTC dates to the event's timezone
    // This ensures the ICS file contains correct local times with TZID
    const startDate = toZonedTime(new Date(event.startDate), timezone);
    const endDate = event.endDate
      ? toZonedTime(new Date(event.endDate), timezone)
      : undefined;

    // Create the basic event
    const calEvent = icalGenerator().createEvent({
      summary: event.name,
      description: event.description,
      location: event.location,
      start: startDate,
      end: endDate,
      timezone: timezone,
      allDay: event.isAllDay || false,
    });

    // Set the UID
    calEvent.uid(event.ulid);

    // Set URL using tenant's frontend domain
    const frontendDomain = this.getFrontendDomain();
    calEvent.url(`${frontendDomain}/events/${event.slug}`);

    // Set status
    calEvent.status(this.mapNestStatusToICalStatus(event.status) as any);

    // Set transparency
    calEvent.transparency('OPAQUE' as any);

    // Set time stamps
    calEvent.stamp(new Date());
    if (event.createdAt) calEvent.created(new Date(event.createdAt));
    if (event.updatedAt) calEvent.lastModified(new Date(event.updatedAt));

    // Add the organizer if available
    if (event.user && event.user.email) {
      // Build a fallback name from firstName/lastName if name is empty
      let organizerName = event.user.name;
      if (!organizerName || organizerName.trim() === '') {
        const firstName = (event.user as any).firstName || '';
        const lastName = (event.user as any).lastName || '';
        organizerName = `${firstName} ${lastName}`.trim();

        // If still empty, use email username as fallback
        if (!organizerName) {
          organizerName = event.user.email.split('@')[0];
        }
      }

      calEvent.organizer({
        name: organizerName,
        email: event.user.email,
      });
    }

    return calEvent;
  }

  /**
   * Generate a calendar invite for a specific attendee
   * Uses METHOD:REQUEST for email invitations
   * @param event - The event entity
   * @param attendee - Attendee information
   * @param organizer - Organizer information
   * @param eventUrl - Optional custom event URL (defaults to openmeet.io if not provided)
   */
  public generateCalendarInvite(
    event: EventEntity,
    attendee: { email: string; firstName?: string; lastName?: string },
    organizer: { email: string; firstName?: string; lastName?: string },
    eventUrl?: string,
  ): string {
    const calendar = icalGenerator({
      prodId: { company: 'OpenMeet', product: 'Calendar', language: 'EN' },
      timezone: event.timeZone || 'UTC',
    });

    // Set method to REQUEST for calendar invites
    calendar.method('REQUEST' as any);

    // Create the event using existing method
    const calEvent = this.createCalendarEvent(event);

    // Override URL if custom one provided
    if (eventUrl) {
      calEvent.url(eventUrl);
    }

    // Override organizer with provided organizer info
    const organizerName =
      `${organizer.firstName || ''} ${organizer.lastName || ''}`.trim() ||
      organizer.email.split('@')[0];

    calEvent.organizer({
      name: organizerName,
      email: organizer.email,
    });

    // Add the specific attendee with ACCEPTED status
    const attendeeName =
      `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim() ||
      attendee.email.split('@')[0];

    calEvent.createAttendee({
      name: attendeeName,
      email: attendee.email,
      rsvp: true,
      status: 'ACCEPTED' as any,
      role: 'REQ-PARTICIPANT' as any,
    });

    // Add 24-hour reminder
    calEvent.createAlarm({
      type: 'display' as any,
      trigger: 60 * 60 * 24, // 24 hours before (in seconds)
      description: `Reminder: ${event.name} tomorrow`,
    });

    // Add the event to the calendar
    calendar.events([calEvent]);

    return calendar.toString();
  }

  /**
   * Create a full iCalendar document from an EventEntity
   */
  public createICalendar(event: EventEntity): string {
    const calendar = icalGenerator({
      prodId: { company: 'OpenMeet', product: 'Calendar', language: 'EN' },
      timezone: 'UTC',
    });

    // Set method if needed
    if (event.status === EventStatus.Cancelled) {
      calendar.method('CANCEL' as any);
    } else {
      calendar.method('PUBLISH' as any);
    }

    // Add the event to the calendar
    const calEvent = this.createCalendarEvent(event);
    calendar.events([calEvent]);

    // Add recurrence rules if available
    if (
      event.series &&
      event.series.recurrenceRule &&
      typeof event.series.recurrenceRule === 'object'
    ) {
      try {
        // Get the recurrence rule and add it to the event
        const recurrenceRule = event.series
          .recurrenceRule as unknown as RecurrenceRule;

        // Add the RRULE property to the event
        const rruleString = this.createRRule(recurrenceRule);
        calEvent.repeating(rruleString);

        // Add exception dates if available
        if (
          event.series.recurrenceExceptions &&
          event.series.recurrenceExceptions.length > 0
        ) {
          // Add each exception date
          const exdates = event.series.recurrenceExceptions.map(
            (date) => new Date(date),
          );

          // For each exception date, add as exdate (exclude date) property directly
          // Use a string version of the date in iCalendar format
          exdates.forEach((date) => {
            // Format the date as YYYYMMDDTHHMMSSZ
            const dateStr =
              date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            // Add as a raw property since the direct property method isn't available
            (calEvent as any).addProperty('EXDATE', dateStr);
          });
        }
      } catch (error) {
        console.error('Error adding recurrence rule to iCalendar', error);
      }
    }

    // Return the iCalendar as a string
    return calendar.toString();
  }

  /**
   * Map NestJS event status to iCalendar status
   */
  private mapNestStatusToICalStatus(status: EventStatus): string {
    switch (status) {
      case EventStatus.Published:
        return 'CONFIRMED';
      case EventStatus.Draft:
        return 'TENTATIVE';
      case EventStatus.Cancelled:
        return 'CANCELLED';
      default:
        return 'CONFIRMED';
    }
  }

  /**
   * Create RRule string from a RecurrenceRule object
   */
  private createRRule(rule: RecurrenceRule): string {
    const parts: string[] = [];

    // Add frequency
    parts.push(`FREQ=${rule.frequency}`);

    // Add interval if specified
    if (rule.interval && rule.interval > 1) {
      parts.push(`INTERVAL=${rule.interval}`);
    }

    // Add count if specified
    if (rule.count) {
      parts.push(`COUNT=${rule.count}`);
    }

    // Add until date if specified
    if (rule.until) {
      const untilDate = new Date(rule.until);
      parts.push(
        `UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      );
    }

    // Add byweekday if specified
    if (rule.byweekday && rule.byweekday.length > 0) {
      parts.push(`BYDAY=${rule.byweekday.join(',')}`);
    }

    // Add bymonthday if specified
    if (rule.bymonthday && rule.bymonthday.length > 0) {
      parts.push(`BYMONTHDAY=${rule.bymonthday.join(',')}`);
    }

    // Add bymonth if specified
    if (rule.bymonth && rule.bymonth.length > 0) {
      parts.push(`BYMONTH=${rule.bymonth.join(',')}`);
    }

    return `RRULE:${parts.join(';')}`;
  }

  /**
   * Generate an iCalendar file for an event
   */
  generateICalendar(event: EventEntity): string {
    const calendar = icalGenerator({
      name: 'OpenMeet Calendar',
      timezone: 'UTC',
      prodId: {
        company: 'OpenMeet',
        product: 'Calendar',
        language: 'EN',
      },
    });

    // Add the event to the calendar
    const calEvent = this.createCalendarEvent(event);
    calendar.events([calEvent]);

    // Add recurrence rules if available
    if (
      event.series &&
      event.series.recurrenceRule &&
      typeof event.series.recurrenceRule === 'object'
    ) {
      try {
        // Get the recurrence rule and add it to the event
        const recurrenceRule = event.series
          .recurrenceRule as unknown as RecurrenceRule;

        // Add the RRULE property to the event
        const rruleString = this.createRRule(recurrenceRule);
        calEvent.repeating(rruleString);

        // Add exception dates if available
        if (
          event.series.recurrenceExceptions &&
          event.series.recurrenceExceptions.length > 0
        ) {
          // Add each exception date
          const exdates = event.series.recurrenceExceptions.map(
            (date) => new Date(date),
          );

          // For each exception date, add as exdate (exclude date) property directly
          // Use a string version of the date in iCalendar format
          exdates.forEach((date) => {
            // Format the date as YYYYMMDDTHHMMSSZ
            const dateStr =
              date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            // Add as a raw property since the direct property method isn't available
            (calEvent as any).addProperty('EXDATE', dateStr);
          });
        }
      } catch (error) {
        this.logger.error('Error adding recurrence rule to iCalendar', error);
      }
    }

    // Add attendees if available
    if (event.attendees && event.attendees.length > 0) {
      event.attendees.forEach((attendee) => {
        if (attendee.user && attendee.user.email) {
          calEvent.createAttendee({
            name: attendee.user.name || '',
            email: attendee.user.email || '',
            rsvp: true,
          });
        }
      });
    }

    return calendar.toString();
  }

  /**
   * Generate an iCalendar feed for multiple events
   * Used for calendar subscription feeds (user/group calendars)
   */
  generateICalendarForEvents(events: EventEntity[]): string {
    const calendar = icalGenerator({
      name: 'OpenMeet Calendar',
      timezone: 'UTC', // Default timezone for calendar itself
      prodId: {
        company: 'OpenMeet',
        product: 'Calendar',
        language: 'EN',
      },
    });

    // Set calendar method
    calendar.method('PUBLISH' as any);

    // Process each event
    const calendarEvents = events.map((event) => {
      const calEvent = this.createCalendarEvent(event);

      // Add recurrence rules if this is a series event
      if (
        event.series &&
        event.series.recurrenceRule &&
        typeof event.series.recurrenceRule === 'object'
      ) {
        try {
          const recurrenceRule = event.series
            .recurrenceRule as unknown as RecurrenceRule;
          const rruleString = this.createRRule(recurrenceRule);
          calEvent.repeating(rruleString);

          // Add exception dates if available
          if (
            event.series.recurrenceExceptions &&
            event.series.recurrenceExceptions.length > 0
          ) {
            const exdates = event.series.recurrenceExceptions.map(
              (date) => new Date(date),
            );

            exdates.forEach((date) => {
              const dateStr =
                date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
              (calEvent as any).addProperty('EXDATE', dateStr);
            });
          }
        } catch (error) {
          this.logger.error(
            `Error adding recurrence rule for event ${event.slug}`,
            error,
          );
        }
      }

      // Add attendees if available
      if (event.attendees && event.attendees.length > 0) {
        event.attendees.forEach((attendee) => {
          if (attendee.user && attendee.user.email) {
            calEvent.createAttendee({
              name: attendee.user.name || '',
              email: attendee.user.email || '',
              rsvp: true,
            });
          }
        });
      }

      return calEvent;
    });

    // Add all events to the calendar
    calendar.events(calendarEvents);

    return calendar.toString();
  }
}
