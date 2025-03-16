import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
  ) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: EventEntity) {
    this.logger.log('event.created', {
      id: params.id,
    });

    // Emit an event for the chat module to handle chat room creation
    // instead of directly calling the chat room service
    try {
      this.logger.log(
        `Emitting chat.event.created event for event ${params.slug}`,
      );
      this.eventEmitter.emit('chat.event.created', {
        eventSlug: params.slug,
        userSlug: params.user.slug,
        eventName: params.name,
        eventVisibility: params.visibility,
      });
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
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug: params.eventSlug || attendee.event.slug,
          userSlug: params.userSlug || attendee.user.slug,
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

  @OnEvent('event.attendee.updated')
  async handleEventAttendeeUpdatedEvent(params: {
    eventId: number;
    userId: number;
    status: string;
    eventSlug?: string;
    userSlug?: string;
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
        // Emit an event for the chat module to handle
        this.eventEmitter.emit('chat.event.member.add', {
          eventSlug,
          userSlug,
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
        // Emit an event for the chat module to handle
        this.eventEmitter.emit('chat.event.member.remove', {
          eventSlug,
          userSlug,
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
        // Emit an event for the chat module to handle using slugs
        this.eventEmitter.emit('chat.event.member.remove', {
          eventSlug: attendee.event.slug,
          userSlug: attendee.user.slug,
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
