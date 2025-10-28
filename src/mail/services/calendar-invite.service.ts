import { Injectable, BadRequestException } from '@nestjs/common';
import { MailerService } from '../../mailer/mailer.service';
import { ICalendarService } from '../../event/services/ical/ical.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { TenantConfig } from '../../core/constants/constant';

interface CalendarLinks {
  google: string;
  outlook: string;
  office365: string;
}

@Injectable()
export class CalendarInviteService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly icalService: ICalendarService,
  ) {}

  /**
   * Generate "Add to Calendar" links for major calendar providers
   */
  generateAddToCalendarLinks(
    event: EventEntity,
    tenantConfig: TenantConfig,
  ): CalendarLinks {
    const eventUrl = `${tenantConfig.frontendDomain}/events/${event.slug}`;
    const startTime = this.formatDateForCalendarLink(event.startDate);
    const endTime = event.endDate
      ? this.formatDateForCalendarLink(event.endDate)
      : startTime;

    // Build description with event URL
    const description = `${event.description || ''}\n\nView event: ${eventUrl}`;

    // Google Calendar
    const googleParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.name,
      dates: `${startTime}/${endTime}`,
      details: description,
      location: event.location || '',
    });
    const googleLink = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

    // Outlook.com
    const outlookParams = new URLSearchParams({
      subject: event.name,
      startdt: event.startDate.toISOString(),
      enddt: event.endDate
        ? event.endDate.toISOString()
        : event.startDate.toISOString(),
      body: description,
      location: event.location || '',
    });
    const outlookLink = `https://outlook.live.com/calendar/0/action/compose?${outlookParams.toString()}`;

    // Office 365
    const office365Link = `https://outlook.office.com/calendar/0/action/compose?${outlookParams.toString()}`;

    return {
      google: googleLink,
      outlook: outlookLink,
      office365: office365Link,
    };
  }

  /**
   * Send calendar invite email with multipart MIME including ICS attachment
   */
  async sendCalendarInvite(
    event: EventEntity,
    attendee: UserEntity,
    organizer: UserEntity,
    tenantConfig: TenantConfig,
  ): Promise<void> {
    // Validate email is present
    if (!attendee.email) {
      throw new BadRequestException(
        'Attendee email is required to send calendar invite',
      );
    }

    // Build event URL from tenant config
    const eventUrl = `${tenantConfig.frontendDomain}/events/${event.slug}`;

    // Generate ICS content using ICalendarService with tenant-specific URL
    const icsContent = this.icalService.generateCalendarInvite(
      event,
      {
        email: attendee.email,
        firstName: attendee.firstName || undefined,
        lastName: attendee.lastName || undefined,
      },
      {
        email: organizer.email || '',
        firstName: organizer.firstName || undefined,
        lastName: organizer.lastName || undefined,
      },
      eventUrl, // Pass tenant-specific URL to ICS generation
    );

    // Generate calendar links
    const calendarLinks = this.generateAddToCalendarLinks(event, tenantConfig);

    // Get event timezone (default to UTC if not specified)
    const eventTimeZone = event.timeZone || 'UTC';
    const timeZoneDisplay =
      eventTimeZone && eventTimeZone !== 'UTC' ? eventTimeZone : 'UTC';

    // Send email with calendar invite
    await this.mailerService.sendCalendarInviteMail({
      to: attendee.email,
      subject: `You're registered for ${event.name}!`,
      templateName: 'events/calendar-invite',
      context: {
        eventTitle: event.name,
        eventDescription: event.description || '',
        eventLocation: event.location || '',
        eventDate: this.formatDateHumanReadable(event.startDate, eventTimeZone),
        eventTime: this.formatTimeHumanReadable(event.startDate, eventTimeZone),
        eventTimeZone: timeZoneDisplay,
        eventUrl,
        attendeeName:
          `${attendee.firstName || ''} ${attendee.lastName || ''}`.trim() ||
          attendee.email,
        organizerName:
          `${organizer.firstName || ''} ${organizer.lastName || ''}`.trim() ||
          organizer.email,
        googleCalendarLink: calendarLinks.google,
        outlookCalendarLink: calendarLinks.outlook,
        office365CalendarLink: calendarLinks.office365,
      },
      tenantConfig,
      icsContent,
    });
  }

  /**
   * Format date for Google Calendar link (YYYYMMDDTHHMMSSZ in UTC)
   */
  private formatDateForCalendarLink(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');

    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  /**
   * Format date in human-readable format for email
   * @param date - The date to format
   * @param timeZone - IANA timezone identifier (e.g., 'America/New_York', 'UTC')
   */
  private formatDateHumanReadable(date: Date, timeZone: string): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone,
    });
  }

  /**
   * Format time in human-readable format for email
   * @param date - The date to format
   * @param timeZone - IANA timezone identifier (e.g., 'America/New_York', 'UTC')
   */
  private formatTimeHumanReadable(date: Date, timeZone: string): string {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone,
    });
  }
}
