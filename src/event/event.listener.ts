import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../core/constants/constant';
import { UserService } from '../user/user.service';
import { AttendanceChangedEvent } from '../attendance/types';

interface ResolvedServices {
  eventAttendeeService: EventAttendeeService;
  userService: UserService;
}

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Resolve request-scoped durable services with a synthetic tenant context.
   * Required because EventEmitter events fire outside HTTP request scope,
   * so AggregateByTenantContextIdStrategy.attach() is never called and
   * REQUEST would be undefined. This pattern follows ActivityFeedListener.
   */
  private async resolveServices(tenantId: string): Promise<ResolvedServices> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { tenantId, headers: { 'x-tenant-id': tenantId } },
      contextId,
    );
    const [eventAttendeeService, userService] = await Promise.all([
      this.moduleRef.resolve(EventAttendeeService, contextId, {
        strict: false,
      }),
      this.moduleRef.resolve(UserService, contextId, { strict: false }),
    ]);
    return { eventAttendeeService, userService };
  }

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

    // Matrix-native approach: Rooms are created on-demand via Application Service
    // No longer emit chat.event.created events - rooms are created when first accessed
    this.logger.log(
      `Event ${params.slug} created - rooms will be created on-demand via Matrix Application Service`,
    );
  }

  @OnEvent('event.deleted')
  handleEventDeletedEvent(params: { event: EventEntity; tenantId: string }) {
    this.logger.log('event.deleted', {
      id: params.event.id,
    });

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
      if (!params.tenantId) {
        this.logger.error(
          'No tenantId available in event parameters for event.attendee.created',
        );
        return;
      }

      const { eventAttendeeService } = await this.resolveServices(
        params.tenantId,
      );

      // Only add users to the chat room if they're approved
      const attendee = await eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
        relations: ['event', 'user'],
      });

      if (attendee && attendee.status === EventAttendeeStatus.Confirmed) {
        const tenantId = params.tenantId;

        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: params.eventSlug || attendee.event!.slug,
          userSlug: params.userSlug || attendee.user.slug,
          tenantId: tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.add event for user ${attendee.user.slug} in event ${attendee.event!.slug}`,
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
        const tenantId = params.tenantId;

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
      const tenantId = params.tenantId;

      if (!tenantId) {
        this.logger.error('No tenantId available in event parameters');
        return;
      }

      // Get the attendee to fetch slugs if they weren't provided
      let eventSlug = params.eventSlug;
      let userSlug = params.userSlug;

      if (!eventSlug || !userSlug) {
        const { eventAttendeeService } = await this.resolveServices(tenantId);

        const attendee = await eventAttendeeService.findOne({
          where: {
            event: { id: params.eventId },
            user: { id: params.userId },
          },
          relations: ['event', 'user'],
        });

        if (attendee) {
          eventSlug = attendee.event!.slug;
          userSlug = attendee.user.slug;
        }
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
      if (!params.tenantId) {
        this.logger.error(
          'No tenantId available in event parameters for event.attendee.deleted',
        );
        return;
      }

      const { eventAttendeeService } = await this.resolveServices(
        params.tenantId,
      );

      // Find event and user to get slugs
      const attendee = await eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
        relations: ['event', 'user'],
      });

      if (attendee && attendee.event && attendee.user) {
        const tenantId = params.tenantId;

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

      const { userService, eventAttendeeService } = await this.resolveServices(
        params.tenantId,
      );

      // Get user to retrieve slug
      const user = await userService.findById(params.userId);
      if (!user) {
        this.logger.warn(
          `User ${params.userId} not found, cannot reprocess invitations`,
        );
        return;
      }

      // Find all attendances for this user
      const attendances = await eventAttendeeService.findByUserSlug(user.slug);

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
          eventSlug: attendance.event!.slug,
          userSlug: user.slug,
          tenantId: params.tenantId,
        });
        this.logger.log(
          `Re-emitted chat.event.member.add for user ${user.slug} in event ${attendance.event!.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to reprocess event invitations for user ${params.userId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle attendance.changed events emitted by AttendanceService for ATProto slug RSVPs.
   * Emits chat.event.member.add/remove for tenant events only.
   */
  @OnEvent('attendance.changed')
  async handleAttendanceChanged(event: AttendanceChangedEvent): Promise<void> {
    this.logger.log('attendance.changed received', {
      status: event.status,
      eventSlug: event.eventSlug,
      eventId: event.eventId,
      userUlid: event.userUlid,
    });

    // Skip foreign events - no chat room to manage
    if (event.eventId === null) {
      this.logger.debug(
        'Skipping attendance.changed for foreign event (no eventId)',
      );
      return;
    }

    try {
      const { userService } = await this.resolveServices(event.tenantId);

      // Look up user by ULID to get their slug
      const user = await userService.findByUlid(event.userUlid);
      if (!user) {
        this.logger.warn(
          `User not found for ULID ${event.userUlid}, skipping chat update`,
        );
        return;
      }

      if (event.status === 'going') {
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: event.eventSlug,
          userSlug: user.slug,
          tenantId: event.tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.add via attendance.changed for user ${user.slug} in event ${event.eventSlug}`,
        );
      } else if (event.status === 'notgoing') {
        this.eventEmitter.emit('chat.event.member.remove', {
          eventSlug: event.eventSlug,
          userSlug: user.slug,
          tenantId: event.tenantId,
        });
        this.logger.log(
          `Emitted chat.event.member.remove via attendance.changed for user ${user.slug} in event ${event.eventSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle attendance.changed for chat: ${error.message}`,
        error.stack,
      );
    }
  }
}
