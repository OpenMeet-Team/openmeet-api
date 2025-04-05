import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import icalGenerator from 'ical-generator';
import { ConfigService } from '@nestjs/config';
import { RecurrenceRule } from '../../../event-series/interfaces/recurrence.interface';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';
import { EventStatus } from '../../../core/constants/constant';

@Injectable()
export class ICalendarService {
  private readonly logger = new Logger(ICalendarService.name);

  constructor(
    @Inject(forwardRef(() => RecurrencePatternService))
    private readonly recurrencePatternService: RecurrencePatternService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create an iCalendar event from an EventEntity
   */
  public createCalendarEvent(
    event: EventEntity,
  ): ReturnType<ReturnType<typeof icalGenerator>['createEvent']> {
    // Create the basic event
    const calEvent = icalGenerator().createEvent({
      summary: event.name,
      description: event.description,
      location: event.location,
      start: new Date(event.startDate),
      end: event.endDate ? new Date(event.endDate) : undefined,
      timezone: 'UTC',
    });

    // Set the UID
    calEvent.uid(event.ulid);

    // Set URL
    calEvent.url(`https://openmeet.io/events/${event.slug}`);

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
      calEvent.organizer({
        name: event.user.name || '',
        email: event.user.email || '',
      });
    }

    return calEvent;
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
}
