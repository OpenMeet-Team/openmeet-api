import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { CalendarInviteService } from '../services/calendar-invite.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { AttendanceChangedEvent } from '../../attendance/types';

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

  /**
   * Handle attendance.changed events emitted by AttendanceService for ATProto slug RSVPs.
   * Only sends calendar invites for first-time RSVPs to tenant events.
   */
  @OnEvent('attendance.changed')
  async handleAttendanceChanged(event: AttendanceChangedEvent): Promise<void> {
    this.logger.log(
      `attendance.changed received for event ${event.eventSlug}, user ${event.userUlid}, status: ${event.status}`,
    );

    // Only send calendar invite for first-time RSVPs (previousStatus === null)
    if (event.previousStatus !== null) {
      this.logger.debug(
        `Skipping calendar invite for status change (previousStatus: ${event.previousStatus})`,
      );
      return;
    }

    // Skip "notgoing" RSVPs
    if (event.status === 'notgoing') {
      this.logger.debug('Skipping calendar invite for notgoing status');
      return;
    }

    // Skip foreign events (no tenant event to send invite for)
    if (event.eventId === null) {
      this.logger.debug(
        'Skipping calendar invite for foreign event (no eventId)',
      );
      return;
    }

    try {
      const { calendarInviteService, eventAttendeeService } =
        await this.resolveServices(event.tenantId);

      // Look up the attendee by event ID and user ULID
      // We need to find the user first, then the attendee record
      const attendees = await eventAttendeeService.findOne({
        where: {
          event: { id: event.eventId },
        },
        relations: ['event', 'event.user', 'user'],
      });

      if (!attendees) {
        this.logger.warn(
          `Attendee record not found for event ${event.eventId}`,
        );
        return;
      }

      if (!attendees.event) {
        this.logger.warn('Event not found for attendee, skipping');
        return;
      }

      if (!attendees.event.user) {
        this.logger.warn('Event has no organizer, skipping');
        return;
      }

      if (!attendees.user) {
        this.logger.warn('User not found for attendee, skipping');
        return;
      }

      if (!attendees.user.email) {
        this.logger.warn('User has no email, skipping calendar invite');
        return;
      }

      if (attendees.user.preferences?.notifications?.email === false) {
        this.logger.debug('User opted out of email notifications, skipping');
        return;
      }

      if (attendees.user.id === attendees.event.user.id) {
        this.logger.debug('Skipping calendar invite for event creator');
        return;
      }

      const tenantConfig = this.tenantConnectionService.getTenantConfig(
        event.tenantId,
      );

      await calendarInviteService.sendCalendarInvite(
        attendees.event,
        attendees.user,
        attendees.event.user,
        tenantConfig,
      );

      this.logger.log(
        `Calendar invite sent via attendance.changed for event ${event.eventSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send calendar invite via attendance.changed: ${error.message}`,
        error.stack,
      );
    }
  }
}
