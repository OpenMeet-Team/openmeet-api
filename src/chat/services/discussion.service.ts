import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserService } from '../../user/user.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { ChatRoomService } from '../../chat-room/chat-room.service';
import { ChatProviderInterface } from '../interfaces/chat-provider.interface';
import { DiscussionServiceInterface } from '../interfaces/discussion-service.interface';
import { Message } from '../../matrix/types/matrix.types';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

/**
 * Service for handling discussions across different entities (events, groups, direct messages)
 */
@Injectable({ scope: Scope.REQUEST })
export class DiscussionService implements DiscussionServiceInterface {
  private readonly logger = new Logger(DiscussionService.name);
  private readonly tracer = trace.getTracer('discussion-service');

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
    private readonly chatRoomService: ChatRoomService,
    @Inject('CHAT_PROVIDER') private readonly chatProvider: ChatProviderInterface,
  ) {}

  /**
   * Helper method to ensure a user has valid Matrix credentials
   */
  @Trace('discussion.ensureUserHasMatrixCredentials')
  private async ensureUserHasMatrixCredentials(userId: number) {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    let user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    // If user already has Matrix credentials, return the user
    if (user.matrixUserId && user.matrixAccessToken && user.matrixDeviceId) {
      return user;
    }
    
    this.logger.log(`User ${userId} is missing Matrix credentials, provisioning...`);
    
    try {
      // Generate a display name for the user
      const displayName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');
      
      // Create a unique username based on user ID
      const username = `om_${user.ulid.toLowerCase()}`;
      
      // Generate a random password
      const password = Math.random().toString(36).slice(2) + 
        Math.random().toString(36).slice(2);
      
      // Create a Matrix user
      const matrixUserInfo = await this.chatProvider.createUser({
        username,
        password,
        displayName: displayName || username,
      });
      
      // Update user with Matrix credentials
      await this.userService.update(userId, {
        matrixUserId: matrixUserInfo.userId,
        matrixAccessToken: matrixUserInfo.accessToken,
        matrixDeviceId: matrixUserInfo.deviceId,
      });
      
      // Get the updated user
      user = await this.userService.findById(userId, tenantId);
      if (!user) {
        throw new Error(`User with id ${userId} not found after update`);
      }
      
      this.logger.log(`Successfully provisioned Matrix user for ${userId}: ${user.matrixUserId}`);
    } catch (error) {
      this.logger.error(`Failed to provision Matrix user for ${userId}: ${error.message}`, error.stack);
      throw new Error(`Matrix credentials could not be provisioned. Please try again.`);
    }
    
    // Start a Matrix client for the user
    try {
      if (!user.matrixUserId || !user.matrixAccessToken) {
        throw new Error("Matrix credentials missing after provisioning");
      }
      
      await this.chatProvider.startClient({
        userId: user.matrixUserId,
        accessToken: user.matrixAccessToken,
        deviceId: user.matrixDeviceId,
      });
    } catch (error) {
      this.logger.warn(`Failed to start Matrix client for user ${userId}: ${error.message}`);
      // Continue anyway - not critical
    }
    
    return user;
  }

  /**
   * Helper method to enhance messages with user display names
   */
  @Trace('discussion.enhanceMessagesWithUserInfo')
  private async enhanceMessagesWithUserInfo(messages: Message[]): Promise<Message[]> {
    return Promise.all(
      messages.map(async (message) => {
        try {
          // Get user info from our database based on Matrix ID
          const userMatrixId = message.sender;

          // Find the OpenMeet user with this Matrix ID
          const userWithMatrixId = await this.userService.findByMatrixUserId(userMatrixId);

          // If we found a user, add their name to the message
          if (userWithMatrixId) {
            const displayName =
              [userWithMatrixId.firstName, userWithMatrixId.lastName]
                .filter(Boolean)
                .join(' ') ||
              userWithMatrixId.email?.split('@')[0] ||
              'OpenMeet User';

            return {
              ...message,
              sender_name: displayName,
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
  }

  /**
   * Ensure a chat room exists for an event
   */
  @Trace('discussion.ensureEventChatRoom')
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
   * Ensure a chat room exists for a group
   */
  @Trace('discussion.ensureGroupChatRoom')
  private async ensureGroupChatRoom(groupId: number, creatorId: number) {
    try {
      // Implementation would be similar to ensureEventChatRoom
      // For now, throwing an error as this is not implemented yet
      throw new Error('Group chat room functionality not implemented yet');
    } catch (error) {
      this.logger.error(
        `Error ensuring chat room for group ${groupId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to ensure chat room for group: ${error.message}`);
    }
  }

  @Trace('discussion.sendEventDiscussionMessage')
  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName?: string },
  ): Promise<{ id: string }> {
    const tenantId = this.request.tenantId;
    
    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(slug);
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

  @Trace('discussion.getEventDiscussionMessages')
  async getEventDiscussionMessages(
    slug: string,
    userId: number,
    limit = 50,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(slug);
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
    const enhancedMessages = await this.enhanceMessagesWithUserInfo(
      messageData.messages,
    );

    return {
      messages: enhancedMessages,
      end: messageData.end,
    };
  }

  /**
   * Legacy method - prefer using slug-based methods instead
   */
  @Trace('discussion.addMemberToEventDiscussion')
  async addMemberToEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    // Get the event's slug first
    const tenantId = this.request.tenantId;
    
    // Find the event to get its slug
    const event = await this.eventQueryService.findById(eventId, tenantId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Get the user to get their slug
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Use the slug-based method which is preferred
    await this.addMemberToEventDiscussionBySlug(event.slug, user.slug);
  }
  
  @Trace('discussion.addMemberToEventDiscussionBySlug')
  async addMemberToEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<void> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(eventSlug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }
    
    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }
    
    // Ensure chat room exists
    const creatorId = event.user?.id || user.id;
    await this.ensureEventChatRoom(event.id, creatorId);

    // Add the user to the chat room
    await this.chatRoomService.addUserToEventChatRoom(event.id, user.id);
  }

  /**
   * Legacy method - prefer using slug-based methods instead
   */
  @Trace('discussion.removeMemberFromEventDiscussion')
  async removeMemberFromEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    // Get the event's slug first
    const tenantId = this.request.tenantId;
    
    // Find the event to get its slug
    const event = await this.eventQueryService.findById(eventId, tenantId);
    if (!event) {
      throw new NotFoundException(`Event with id ${eventId} not found`);
    }

    // Get the user to get their slug
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Use the slug-based method which is preferred
    await this.removeMemberFromEventDiscussionBySlug(event.slug, user.slug);
  }
  
  @Trace('discussion.removeMemberFromEventDiscussionBySlug')
  async removeMemberFromEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<void> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(eventSlug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }
    
    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }
    
    // Remove the user from the chat room
    await this.chatRoomService.removeUserFromEventChatRoom(event.id, user.id);
  }

  @Trace('discussion.sendGroupDiscussionMessage')
  async sendGroupDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName?: string },
  ): Promise<{ id: string }> {
    // This would be implemented similarly to sendEventDiscussionMessage
    // For now, throwing an error as this is not implemented yet
    throw new Error('Group discussion functionality not implemented yet');
  }

  @Trace('discussion.getGroupDiscussionMessages')
  async getGroupDiscussionMessages(
    slug: string,
    userId: number,
    limit?: number,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    // This would be implemented similarly to getEventDiscussionMessages
    // For now, throwing an error as this is not implemented yet
    throw new Error('Group discussion functionality not implemented yet');
  }

  @Trace('discussion.addMemberToGroupDiscussion')
  async addMemberToGroupDiscussion(
    groupId: number,
    userId: number,
  ): Promise<void> {
    // This would be implemented similarly to addMemberToEventDiscussion
    // For now, throwing an error as this is not implemented yet
    throw new Error('Group discussion functionality not implemented yet');
  }

  @Trace('discussion.removeMemberFromGroupDiscussion')
  async removeMemberFromGroupDiscussion(
    groupId: number,
    userId: number,
  ): Promise<void> {
    // This would be implemented similarly to removeMemberFromEventDiscussion
    // For now, throwing an error as this is not implemented yet
    throw new Error('Group discussion functionality not implemented yet');
  }
  
  /**
   * Converts event and user slugs to their corresponding IDs
   * This is a helper method to bridge between slug-based and ID-based APIs
   */
  @Trace('discussion.getIdsFromSlugs')
  async getIdsFromSlugs(
    eventSlug: string,
    userSlug: string,
  ): Promise<{ eventId: number | null; userId: number | null }> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    let eventId: number | null = null;
    let userId: number | null = null;
    
    // Find the event by slug
    try {
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (event) {
        eventId = event.id;
      }
    } catch (error) {
      this.logger.warn(`Could not find event with slug ${eventSlug}: ${error.message}`);
    }
    
    // Find the user by slug
    try {
      const user = await this.userService.getUserBySlug(userSlug);
      if (user) {
        userId = user.id;
      }
    } catch (error) {
      this.logger.warn(`Could not find user with slug ${userSlug}: ${error.message}`);
    }
    
    return { eventId, userId };
  }

  @Trace('discussion.sendDirectMessage')
  async sendDirectMessage(
    recipientId: number,
    senderId: number,
    body: { message: string },
  ): Promise<{ id: string }> {
    // This would be implemented for direct messaging
    // For now, throwing an error as this is not implemented yet
    throw new Error('Direct messaging functionality not implemented yet');
  }

  @Trace('discussion.getDirectMessages')
  async getDirectMessages(
    userId1: number,
    userId2: number,
    limit?: number,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    // This would be implemented for direct messaging
    // For now, throwing an error as this is not implemented yet
    throw new Error('Direct messaging functionality not implemented yet');
  }
}