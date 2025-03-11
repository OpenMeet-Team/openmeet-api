import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { UserService } from '../../user/user.service';
import { ChatRoomService } from '../../chat-room/chat-room.service';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { Message } from '../../matrix/types/matrix.types';

@Injectable({ scope: Scope.REQUEST })
export class EventDiscussionService {
  private readonly logger = new Logger(EventDiscussionService.name);
  private readonly tracer = trace.getTracer('event-discussion-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly userService: UserService,
    private readonly chatRoomService: ChatRoomService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-discussion.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  /**
   * Ensure a chat room exists for the event and create one if it doesn't
   */
  @Trace('event-discussion.ensureEventChatRoom')
  private async ensureEventChatRoom(eventId: number, creatorId: number) {
    try {
      // Try to get existing chat rooms
      const chatRooms = await this.chatRoomService.getEventChatRooms(eventId);

      // If no chat rooms exist, create one
      if (!chatRooms || chatRooms.length === 0) {
        return await this.chatRoomService.createEventChatRoom(
          eventId,
          creatorId,
        );
      }

      // Return the first chat room (main event chat room)
      return chatRooms[0];
    } catch (error) {
      this.logger.error(
        `Error ensuring chat room for event ${eventId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to ensure chat room for event: ${error.message}`);
    }
  }

  /**
   * Send a message to an event's chat room
   */
  @Trace('event-discussion.sendEventDiscussionMessage')
  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName?: string },
  ): Promise<{ id: string }> {
    await this.initializeRepository();

    // Find the event by slug
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // Get or create chat room for the event
    const chatRoom = await this.ensureEventChatRoom(event.id, userId);

    // Simplified approach - no topic formatting
    const plainMessage = body.message;

    // Send the message to the chat room
    const messageId = await this.chatRoomService.sendMessage(
      chatRoom.id,
      userId,
      plainMessage,
    );

    return { id: messageId };
  }

  /**
   * Get messages from an event's chat room
   */
  @Trace('event-discussion.getEventDiscussionMessages')
  async getEventDiscussionMessages(
    slug: string,
    userId: number,
    limit = 50,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    await this.initializeRepository();

    // Find the event by slug
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // Get chat rooms for the event
    const chatRooms = await this.chatRoomService.getEventChatRooms(event.id);
    if (!chatRooms || chatRooms.length === 0) {
      // No chat room exists yet, return empty result
      return { messages: [], end: '' };
    }

    // Get messages from the first (main) chat room
    const messageData = await this.chatRoomService.getMessages(
      chatRooms[0].id,
      userId,
      limit,
      from,
    );
    
    // Enhance messages with user display names
    const enhancedMessages = await Promise.all(
      messageData.messages.map(async (message) => {
        try {
          // Get user info from our database based on Matrix ID
          const userMatrixId = message.sender;
          
          // Find the OpenMeet user with this Matrix ID
          const userWithMatrixId = await this.userService.findByMatrixUserId(userMatrixId);
          
          // If we found a user, add their name to the message
          if (userWithMatrixId) {
            const displayName = [userWithMatrixId.firstName, userWithMatrixId.lastName]
              .filter(Boolean)
              .join(' ') || userWithMatrixId.email?.split('@')[0] || 'OpenMeet User';
            
            return {
              ...message,
              sender_name: displayName
            };
          }
          
          return message;
        } catch (error) {
          this.logger.warn(
            `Error getting display name for message sender ${message.sender}: ${error.message}`,
          );
          return message;
        }
      }),
    );

    return {
      messages: enhancedMessages,
      end: messageData.end,
    };
  }

  /**
   * Add a member to an event's chat room
   */
  @Trace('event-discussion.addMemberToEventDiscussion')
  async addMemberToEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    await this.initializeRepository();

    // Find the event
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Ensure chat room exists
    const chatRoom = await this.ensureEventChatRoom(eventId, event.user.id);

    // Add the user to the chat room
    await this.chatRoomService.addUserToEventChatRoom(eventId, userId);
  }

  /**
   * Remove a member from an event's chat room
   */
  @Trace('event-discussion.removeMemberFromEventDiscussion')
  async removeMemberFromEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    await this.initializeRepository();

    // Find the event
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Remove the user from the chat room
    await this.chatRoomService.removeUserFromEventChatRoom(eventId, userId);
  }
}
