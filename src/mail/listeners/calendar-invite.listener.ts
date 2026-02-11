import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable()
export class CalendarInviteListener {
  private readonly logger = new Logger(CalendarInviteListener.name);

  constructor(
    private readonly calendarInviteService: CalendarInviteService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  @OnEvent('event.rsvp.added')
  async handleEventRsvpAdded(params: {
    eventId: number;
    userId: number;
    status: EventAttendeeStatus;
    eventSlug?: string;
    userSlug?: string;
    tenantId: string;
  }): Promise<void> {
    this.logger.log(
      `🎫 Calendar invite listener triggered for event ${params.eventId}, user ${params.userId}, status: ${params.status}`,
    );

    // Business rule: Only send calendar invites for confirmed RSVPs
    if (params.status !== EventAttendeeStatus.Confirmed) {
      this.logger.debug(
        `Skipping calendar invite for non-confirmed RSVP (status: ${params.status})`,
      );
      return;
    }

    try {
      // Fetch attendee with event and user relations in one query
      const attendee = await this.eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
        relations: ['event', 'event.user', 'user'],
      });

      if (!attendee) {
        this.logger.warn(
          `Attendee record not found for event ${params.eventId} and user ${params.userId}`,
        );
        return;
      }

      if (!attendee.event) {
        this.logger.warn(
          `Event not found for attendee, skipping calendar invite`,
        );
        return;
      }

      if (!attendee.event.user) {
        this.logger.warn(
          `Event ${params.eventId} has no organizer, skipping calendar invite`,
        );
        return;
      }

      if (!attendee.user) {
        this.logger.warn(
          `User not found for attendee, skipping calendar invite`,
        );
        return;
      }

      if (!attendee.user.email) {
        this.logger.warn(
          `Email not available for user ${params.userId}, skipping calendar invite for event ${params.eventId}`,
        );
        return;
      }

      // Get tenant config
      const tenantConfig = this.tenantConnectionService.getTenantConfig(
        params.tenantId,
      );

      // Send calendar invite
      await this.calendarInviteService.sendCalendarInvite(
        attendee.event,
        attendee.user,
        attendee.event.user,
        tenantConfig,
      );

      this.logger.log(
        `Calendar invite sent for event ${params.eventSlug || params.eventId} to user ${params.userSlug || params.userId}`,
      );
    } catch (error) {
      // Never throw - email failures should not break RSVP processing
      this.logger.error(
        `Failed to send calendar invite for event ${params.eventId} to user ${params.userId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
