import { Injectable, Logger, Inject } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
// import { ChatRoomService } from '../chat/rooms/chat-room.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { ZulipService } from '../zulip/zulip.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeStatus } from '../core/constants/constant';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);

  constructor(
    private readonly zulipService: ZulipService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: EventEntity & { tenantId?: string }) {
    this.logger.log('event.created', {
      id: params.id,
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

      // Create payload with all required fields including tenantId
      const payload = {
        eventSlug: params.slug,
        userSlug: params.user?.slug, // Include slug if available
        userId: params.user?.id, // Always include userId as a fallback
        eventName: params.name,
        eventVisibility: params.visibility,
        tenantId: tenantId, // Use the tenant ID from request context if not in params
      };

      this.logger.log(`Chat event payload: ${JSON.stringify(payload)}`);

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

    // Clean up Zulip channels (legacy)
    if (params.zulipChannelId) {
      this.zulipService
        .deleteChannel(params.zulipChannelId)
        .catch((error) =>
          this.logger.error(
            `Failed to delete Zulip channel for event ${params.id}: ${error.message}`,
          ),
        );
    }

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

  @OnEvent('event.attendee.updated')
  async handleEventAttendeeUpdatedEvent(params: {
    eventId: number;
    userId: number;
    status: string;
    eventSlug?: string;
    userSlug?: string;
    tenantId?: string;
  }) {
    this.logger.log('event.attendee.updated', params);

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
        params.status === EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;

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
        params.status !== EventAttendeeStatus.Confirmed &&
        eventSlug &&
        userSlug
      ) {
        // Get tenantId from params or request context
        const tenantId = params.tenantId || this.request?.tenantId;

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
