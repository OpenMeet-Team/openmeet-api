import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { EventMailService } from './event-mail.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { UserService } from '../user/user.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { AttendanceChangedEvent } from '../attendance/types';

@Injectable()
export class GuestJoinedListener {
  private readonly logger = new Logger(GuestJoinedListener.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Resolve request-scoped durable services with a synthetic tenant context.
   * Same pattern as CalendarInviteListener.
   */
  private async resolveServices(tenantId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { tenantId, headers: { 'x-tenant-id': tenantId } },
      contextId,
    );
    const [eventMailService, eventAttendeeService, userService] =
      await Promise.all([
        this.moduleRef.resolve(EventMailService, contextId, { strict: false }),
        this.moduleRef.resolve(EventAttendeeService, contextId, {
          strict: false,
        }),
        this.moduleRef.resolve(UserService, contextId, { strict: false }),
      ]);
    return { eventMailService, eventAttendeeService, userService };
  }

  /**
   * Handle attendance.changed events to send "guest joined" emails to organizers.
   * Only fires for first-time RSVPs (going/maybe) to tenant events.
   */
  @OnEvent('attendance.changed')
  async handleAttendanceChanged(event: AttendanceChangedEvent): Promise<void> {
    this.logger.log(
      `attendance.changed received for guest-joined check: event ${event.eventSlug}, user ${event.userUlid}, status: ${event.status}`,
    );

    // Only fire for first-time RSVPs
    if (event.previousStatus !== null) {
      this.logger.debug(
        `Skipping guest-joined mail: not a first-time RSVP (previousStatus: ${event.previousStatus})`,
      );
      return;
    }

    // Only fire for going or maybe
    if (event.status !== 'going' && event.status !== 'maybe') {
      this.logger.debug(
        `Skipping guest-joined mail: status is ${event.status}`,
      );
      return;
    }

    // Skip foreign events
    if (event.eventId === null) {
      this.logger.debug(
        'Skipping guest-joined mail: foreign event (no eventId)',
      );
      return;
    }

    try {
      const { eventMailService, eventAttendeeService, userService } =
        await this.resolveServices(event.tenantId);

      // Resolve user by ULID
      const user = await userService.findByUlid(event.userUlid);
      if (!user) {
        this.logger.warn(
          `User not found for ULID ${event.userUlid}, skipping guest-joined mail`,
        );
        return;
      }

      // Look up the attendee by eventId AND user
      const attendee = await eventAttendeeService.findOne({
        where: {
          event: { id: event.eventId },
          user: { id: user.id },
        },
        relations: ['event', 'event.user', 'user'],
      });

      if (!attendee) {
        this.logger.warn(
          `Attendee not found for event ${event.eventId} and user ${user.id}, skipping guest-joined mail`,
        );
        return;
      }

      await eventMailService.sendMailAttendeeGuestJoined(attendee);

      this.logger.log(
        `Guest-joined mail sent for event ${event.eventSlug}, user ${event.userUlid}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send guest-joined mail: ${error.message}`,
        error.stack,
      );
    }
  }
}
