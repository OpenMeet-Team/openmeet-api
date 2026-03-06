import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../../core/constants/constant';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable()
export class CalendarInviteListener {
  private readonly logger = new Logger(CalendarInviteListener.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Resolve request-scoped durable services with a synthetic tenant context.
   * Required because EventEmitter events fire outside HTTP request scope,
   * so AggregateByTenantContextIdStrategy.attach() is never called and
   * REQUEST would be undefined. This pattern follows ActivityFeedListener.
   *
   * NestJS 11 correctly enforces scope propagation: CalendarInviteService
   * and EventAttendeeService are transitively request-scoped, so they must
   * be resolved dynamically rather than injected in the constructor.
   */
  private async resolveServices(tenantId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { tenantId, headers: { 'x-tenant-id': tenantId } },
      contextId,
    );
    const [calendarInviteService, eventAttendeeService] = await Promise.all([
      this.moduleRef.resolve(CalendarInviteService, contextId, {
        strict: false,
      }),
      this.moduleRef.resolve(EventAttendeeService, contextId, {
        strict: false,
      }),
    ]);
    return { calendarInviteService, eventAttendeeService };
  }

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
      `Calendar invite listener triggered for event ${params.eventId}, user ${params.userId}, status: ${params.status}`,
    );

    // Business rule: Only send calendar invites for confirmed RSVPs
    if (params.status !== EventAttendeeStatus.Confirmed) {
      this.logger.debug(
        `Skipping calendar invite for non-confirmed RSVP (status: ${params.status})`,
      );
      return;
    }

    try {
      // Dynamically resolve scoped services with tenant context
      const { calendarInviteService, eventAttendeeService } =
        await this.resolveServices(params.tenantId);

      // Fetch attendee with event and user relations in one query
      const attendee = await eventAttendeeService.findOne({
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

      // Skip if user opted out of email notifications
      if (attendee.user.preferences?.notifications?.email === false) {
        this.logger.debug(
          `User ${params.userId} opted out of email notifications, skipping calendar invite`,
        );
        return;
      }

      // Skip sending calendar invite to event creator
      if (attendee.user.id === attendee.event.user.id) {
        this.logger.debug(
          `Skipping calendar invite for event creator ${attendee.user.slug || attendee.user.id}`,
        );
        return;
      }

      // Get tenant config
      const tenantConfig = this.tenantConnectionService.getTenantConfig(
        params.tenantId,
      );

      // Send calendar invite
      await calendarInviteService.sendCalendarInvite(
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
