import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from '../chat-room/chat-room.service';

@Injectable()
export class ChatListener {
  private readonly logger = new Logger(ChatListener.name);

  constructor(
    private readonly discussionService: DiscussionService,
    private readonly chatRoomService: ChatRoomService,
  ) {}

  @OnEvent('chat.event.member.add')
  async handleChatEventMemberAdd(params: {
    eventSlug: string;
    userSlug: string;
  }) {
    this.logger.log('chat.event.member.add event received', params);

    try {
      await this.discussionService.addMemberToEventDiscussionBySlug(
        params.eventSlug,
        params.userSlug,
      );
      this.logger.log(
        `Added user ${params.userSlug} to event ${params.eventSlug} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user ${params.userSlug} to event ${params.eventSlug} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.event.member.remove')
  async handleChatEventMemberRemove(params: {
    eventSlug: string;
    userSlug: string;
  }) {
    this.logger.log('chat.event.member.remove event received', params);

    try {
      await this.discussionService.removeMemberFromEventDiscussionBySlug(
        params.eventSlug,
        params.userSlug,
      );
      this.logger.log(
        `Removed user ${params.userSlug} from event ${params.eventSlug} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${params.userSlug} from event ${params.eventSlug} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.add')
  async handleChatGroupMemberAdd(params: { groupId: number; userId: number }) {
    this.logger.log('chat.group.member.add event received', params);

    try {
      await this.discussionService.addMemberToGroupDiscussion(
        params.groupId,
        params.userId,
      );
      this.logger.log(
        `Added user ${params.userId} to group ${params.groupId} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user ${params.userId} to group ${params.groupId} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.remove')
  async handleChatGroupMemberRemove(params: {
    groupId: number;
    userId: number;
  }) {
    this.logger.log('chat.group.member.remove event received', params);

    try {
      await this.discussionService.removeMemberFromGroupDiscussion(
        params.groupId,
        params.userId,
      );
      this.logger.log(
        `Removed user ${params.userId} from group ${params.groupId} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${params.userId} from group ${params.groupId} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.event.created')
  async handleChatEventCreated(params: {
    eventSlug: string;
    userSlug: string;
    eventName: string;
    eventVisibility: string;
  }) {
    this.logger.log('chat.event.created event received', params);

    try {
      // Convert slugs to IDs for now, as the ChatRoomService currently uses IDs
      // Ideally, we should update ChatRoomService to use slugs directly in the future
      const { eventId, userId } = await this.discussionService.getIdsFromSlugs(
        params.eventSlug,
        params.userSlug,
      );

      if (eventId && userId) {
        await this.chatRoomService.createEventChatRoom(eventId, userId);
        this.logger.log(
          `Created chat room for event ${params.eventSlug} by user ${params.userSlug}`,
        );
      } else {
        this.logger.warn(
          `Could not convert slugs to IDs for event ${params.eventSlug} and user ${params.userSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create chat room for event ${params.eventSlug}: ${error.message}`,
        error.stack,
      );
    }
  }
}
