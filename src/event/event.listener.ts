import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChatRoomService } from '../chat-room/chat-room.service';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { ZulipService } from '../zulip/zulip.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventDiscussionService } from './services/event-discussion.service';
import { EventAttendeeStatus } from '../core/constants/constant';

@Injectable()
export class EventListener {
  private readonly logger = new Logger(EventListener.name);

  constructor(
    private readonly zulipService: ZulipService,
    private readonly chatRoomService: ChatRoomService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventDiscussionService: EventDiscussionService,
  ) {}

  @OnEvent('event.created')
  handleEventCreatedEvent(params: EventEntity) {
    this.logger.log('event.created', {
      id: params.id,
    });

    // Create a chat room for the event (async)
    // This will be called automatically when needed later if it fails
    try {
      this.chatRoomService
        .createEventChatRoom(params.id, params.user.id)
        .catch((error) =>
          this.logger.error(
            `Failed to create chat room for event ${params.id}: ${error.message}`,
          ),
        );
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
  }) {
    this.logger.log('event.attendee.created', params);

    // Add the user to the event chat room
    try {
      // Only add users to the chat room if they're approved
      const attendee = await this.eventAttendeeService.findOne({
        where: {
          event: { id: params.eventId },
          user: { id: params.userId },
        },
      });

      if (attendee && attendee.status === EventAttendeeStatus.Confirmed) {
        await this.eventDiscussionService.addMemberToEventDiscussion(
          params.eventId,
          params.userId,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to add user ${params.userId} to event ${params.eventId} chat room: ${error.message}`,
      );
    }
  }

  @OnEvent('event.attendee.updated')
  async handleEventAttendeeUpdatedEvent(params: {
    eventId: number;
    userId: number;
    status: string;
  }) {
    this.logger.log('event.attendee.updated', params);

    try {
      // If status changed to confirmed, add user to chat
      if (params.status === EventAttendeeStatus.Confirmed) {
        await this.eventDiscussionService.addMemberToEventDiscussion(
          params.eventId,
          params.userId,
        );
      }
      // If status changed from confirmed to something else, remove from chat
      else if (params.status !== EventAttendeeStatus.Confirmed) {
        await this.eventDiscussionService.removeMemberFromEventDiscussion(
          params.eventId,
          params.userId,
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

    // Remove the user from the event chat room
    try {
      await this.eventDiscussionService.removeMemberFromEventDiscussion(
        params.eventId,
        params.userId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${params.userId} from event ${params.eventId} chat room: ${error.message}`,
      );
    }
  }
}
