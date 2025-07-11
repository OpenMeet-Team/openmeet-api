import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../core/constants/constant';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);

  constructor(
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('event.created', {
      id: params.eventId,
      slug: params.slug,
      tenantId: params.tenantId,
    });

    // Get the tenant ID from the request context if not provided in the event
    const tenantId = params.tenantId || this.request?.tenantId;

    // Emit an event for the chat module to handle chat room creation
    // instead of directly calling the chat room service
    try {
      this.logger.log(
        `Emitting chat.event.created event for event ${params.slug}`,
      );

      // Create payload with all required fields including tenantId and userId
      const payload = {
        eventSlug: params.slug,
        userId: params.userId, // Use userId from event creation payload
        eventName: params.eventId.toString(), // We don't have the event name, use ID as fallback
        eventVisibility: 'public', // Default visibility
        tenantId: tenantId,
      };

      // Log crucial fields to debug
      this.logger.log(`Chat event payload: ${JSON.stringify(payload)}`);

      // Skip emitting event if we don't have any user identifier
      if (!payload.userId) {
        this.logger.warn(
          `Cannot create chat room for event ${params.slug}: No user identifier provided`,
        );
        return;
      }

      // Emit the event with our prepared payload
      this.eventEmitter.emit('chat.event.created', payload);
    } catch (error) {
      this.logger.error(`Error in handleEventCreatedEvent: ${error.message}`);
    }
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
    newStatus: string;
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

      // If status changed to confirmed, add user to chat
      if (
        params.newStatus === EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;
        
        if (!tenantId) {
          this.logger.error('No tenantId available in event parameters or request context for chat.event.member.add');
          return;
        }

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
        params.newStatus !== EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;
        
        if (!tenantId) {
          this.logger.error('No tenantId available in event parameters or request context for chat.event.member.remove');
          return;
        }

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
}
