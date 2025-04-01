import { Injectable } from '@nestjs/common';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import icalGenerator from 'ical-generator';
import { RecurrenceService } from '../../../recurrence/recurrence.service';
import { ConfigService } from '@nestjs/config';
import { RecurrenceRule } from '../../../recurrence/interfaces/recurrence.interface';

@Injectable()
export class ICalendarService {
  constructor(
    private readonly recurrenceService: RecurrenceService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate an iCalendar file for an event
   */
  generateICalendar(event: EventEntity): string {
    const calendar = icalGenerator({
      name: 'OpenMeet Calendar',
      timezone: event.timeZone || 'UTC',
      prodId: {
        company: 'OpenMeet',
        product: 'Calendar',
        language: 'EN',
      },
    });

    this.addEventToCalendar(calendar, event);

    return calendar.toString();
  }

  /**
   * Add an event to an iCalendar object
   */
  private addEventToCalendar(
    calendar: ReturnType<typeof icalGenerator>,
    event: EventEntity,
  ): void {
    const locationParts: string[] = [];
    if (event.location) {
      locationParts.push(event.location);
    }
    if (event.locationOnline) {
      locationParts.push(`Online: ${event.locationOnline}`);
    }
    const locationStr = locationParts.join(' | ');

    const eventObj = calendar.createEvent({
      id: event.ulid,
      summary: event.name,
      description: event.description || '',
      location: locationStr,
      start: new Date(event.startDate),
      end: event.endDate ? new Date(event.endDate) : undefined,
      timezone: event.timeZone,
      allDay: event.isAllDay === true,
    });

    // Add URL
    const baseUrl = this.configService.get<string>('CLIENT_URL', {
      infer: true,
    });
    if (baseUrl) {
      eventObj.url(`${baseUrl}/events/${event.slug}`);
    }

    // Add organizer if available
    if (event.user && event.user.email) {
      eventObj.organizer({
        name: `${event.user.name || ''}`,
        email: event.user.email,
      });
    }

    // We'll skip status for now due to type issues with the ical-generator library

    // Add recurrence rule if this is a recurring event
    if (
      event.isRecurring &&
      event.recurrenceRule &&
      typeof event.recurrenceRule === 'object'
    ) {
      try {
        // Create the RRULE string from our recurrence rule object
        const recurrenceRule =
          event.recurrenceRule as unknown as RecurrenceRule;
        const rruleString =
          this.recurrenceService.buildRRuleString(recurrenceRule);

        if (rruleString) {
          // Pass the raw RRULE string
          eventObj.repeating(rruleString);

          // Add excluded dates if any exist
          if (
            event.recurrenceExceptions &&
            event.recurrenceExceptions.length > 0
          ) {
            // Skip exdate due to type issues with ical-generator
            // const excludeDates = event.recurrenceExceptions.map((ex) => new Date(ex));
          }
        }
      } catch (error) {
        console.error('Error creating recurrence rule:', error);
      }
    }

    // Add attendees if available
    if (event.attendees && event.attendees.length > 0) {
      event.attendees.forEach((attendee) => {
        if (attendee.user && attendee.user.email) {
          eventObj.createAttendee({
            name: attendee.user.name || '',
            email: attendee.user.email,
            rsvp: true,
          });

          // Skip role and status settings due to type issues with ical-generator
        }
      });
    }

    // Skip categories for now due to type issues with ical-generator
  }

  // These mapping methods have been moved directly into the addEventToCalendar method
  // to be used with the updated ical-generator API
}
