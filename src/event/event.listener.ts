import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../core/constants/constant';
import { UserService } from '../user/user.service';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);

  constructor(
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userService: UserService,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId: string;
  }) {
    this.logger.log('event.created', {
      id: params.eventId,
      slug: params.slug,
      tenantId: params.tenantId,
    });

    // Use the tenant ID from the event payload (provided by event service)
    // const tenantId = params.tenantId; // Currently not used

    // Matrix-native approach: Rooms are created on-demand via Application Service
    // No longer emit chat.event.created events - rooms are created when first accessed
    this.logger.log(
      `Event ${params.slug} created - rooms will be created on-demand via Matrix Application Service`,
    );
  }

  @OnEvent('event.deleted')
  handleEventDeletedEvent(params: EventEntity) {
    this.logger.log('event.deleted', {
      id: params.id,
    });

    // Matrix rooms are handled via the Matrix service
    // We no longer need to manually delete Zulip channels

    // For Matrix rooms, we don't delete them but could archive them if needed
    // The rooms will remain in the database but can be marked as inactive
  }

  @OnEvent('event.attendee.created')
  async handleEventAttendeeCreatedEvent(params: {
    eventId: number;
    userId: number;
    eventSlug?: string;
    userSlug?: string;
    tenantId?: string;
  }) {
    this.logger.log('event.attendee.created', params);

    try {
      // Only add users to the chat room if they're approved
      const attendee = await this.eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
        relations: ['event', 'user'],
      });

      if (attendee && attendee.status === EventAttendeeStatus.Confirmed) {
        // Emit an event for the chat module to handle using slugs
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;

        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: params.eventSlug || attendee.event.slug,
          userSlug: params.userSlug || attendee.user.slug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.add event for user ${attendee.user.slug} in event ${attendee.event.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process event attendee created for user ${params.userId} in event ${params.eventId}: ${error.message}`,
      );
    }
  }

  @OnEvent('event.attendee.added')
  handleEventAttendeeAddedEvent(params: {
    eventId: number;
    userId: number;
    status: string;
    eventSlug?: string;
    userSlug?: string;
    tenantId?: string;
  }) {
    this.logger.log('event.attendee.added', params);

    try {
      if (params.status === EventAttendeeStatus.Confirmed) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;

        // Emit an event for the chat module to handle using slugs
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: params.eventSlug,
          userSlug: params.userSlug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.add event for user ${params.userSlug} in event ${params.eventSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process event attendee added for user ${params.userId} in event ${params.eventId}: ${error.message}`,
      );
    }
  }

  @OnEvent('event.attendee.status.changed')
  async handleEventAttendeeUpdatedEvent(params: {
    eventId: number;
    userId: number;
    newStatus?: string;
    status?: string;
    previousStatus?: string;
    eventSlug?: string;
    userSlug?: string;
    tenantId?: string;
  }) {
    this.logger.log('event.attendee.status.changed received', params);

    try {
      // Get the attendee to fetch slugs if they weren't provided
      let eventSlug = params.eventSlug;
      let userSlug = params.userSlug;

      if (!eventSlug || !userSlug) {
        const attendee = await this.eventAttendeeService.findOne({
          where: {
            event: { id: params.eventId },
            user: { id: params.userId },
          },
          relations: ['event', 'user'],
        });

        if (attendee) {
          eventSlug = attendee.event.slug;
          userSlug = attendee.user.slug;
        }
      }

      // Get tenantId from params or request context
      const tenantId = params.tenantId || this.request?.tenantId;

      if (!tenantId) {
        this.logger.error(
          'No tenantId available in event parameters or request context',
        );
        return;
      }

      // Handle status parameter (for backward compatibility)
      const currentStatus = params.newStatus || params.status;

      // If status changed to confirmed, add user to chat
      if (
        currentStatus === EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Emit an event for the chat module to handle
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug,
          userSlug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.add event for user ${userSlug} in event ${eventSlug}`,
        );
      }
      // If status changed from confirmed to something else, remove from chat
      else if (
        params.previousStatus === EventAttendeeStatus.Confirmed &&
        currentStatus !== EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Emit an event for the chat module to handle
        this.eventEmitter.emit('chat.event.member.remove', {
          eventSlug,
          userSlug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.remove event for user ${userSlug} in event ${eventSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle event attendee update for user ${params.userId} in event ${params.eventId}: ${error.message}`,
      );
    }
  }

  @OnEvent('event.attendee.deleted')
  async handleEventAttendeeDeletedEvent(params: {
    eventId: number;
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('event.attendee.deleted', params);

    try {
      // Find event and user to get slugs
      const attendee = await this.eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
        relations: ['event', 'user'],
      });

      if (attendee && attendee.event && attendee.user) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;

        // Emit an event for the chat module to handle using slugs
        this.eventEmitter.emit('chat.event.member.remove', {
          eventSlug: attendee.event.slug,
          userSlug: attendee.user.slug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.remove event for user ${attendee.user.slug} in event ${attendee.event.slug}`,
        );
      } else {
        this.logger.warn(
          `Could not retrieve event or user details for attendee (event: ${params.eventId}, user: ${params.userId})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process event attendee deleted for user ${params.userId} in event ${params.eventId}: ${error.message}`,
      );
    }
  }

  /**
   * Handle Matrix handle registration event
   * Reprocess pending event chat invitations for users who RSVP'd before connecting to Matrix
   */
  @OnEvent('matrix.handle.registered')
  async handleMatrixHandleRegistered(params: {
    userId: number;
    tenantId: string;
    handle: string;
  }) {
    try {
      this.logger.log(
        `Matrix handle registered for user ${params.userId}, reprocessing pending event invitations`,
      );

      // Get user to retrieve slug
      const user = await this.userService.findById(params.userId);
      if (!user) {
        this.logger.warn(
          `User ${params.userId} not found, cannot reprocess invitations`,
        );
        return;
      }

      // Find all attendances for this user
      const attendances =
        await this.eventAttendeeService.findByUserSlug(user.slug);

      // Filter to attendances that allow chat access (confirmed, cancelled)
      const chatAllowedStatuses = [
        EventAttendeeStatus.Confirmed,
        EventAttendeeStatus.Cancelled,
      ];
      const eligibleAttendances = attendances.filter((a) =>
        chatAllowedStatuses.includes(a.status as EventAttendeeStatus),
      );

      this.logger.log(
        `Found ${eligibleAttendances.length} eligible event attendances for user ${user.slug} (confirmed/cancelled)`,
      );

      // Re-emit chat.event.member.add for each eligible attendance
      for (const attendance of eligibleAttendances) {
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: attendance.event.slug,
          userSlug: user.slug,
          tenantId: params.tenantId,
        });
        this.logger.log(
          `Re-emitted chat.event.member.add for user ${user.slug} in event ${attendance.event.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to reprocess event invitations for user ${params.userId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
