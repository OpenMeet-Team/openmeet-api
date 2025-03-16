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
    @Inject('CHAT_PROVIDER')
    private readonly chatProvider: ChatProviderInterface,
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

    this.logger.log(
      `User ${userId} is missing Matrix credentials, provisioning...`,
    );

    try {
      // Generate a display name for the user
      const displayName = [user.firstName, user.lastName]
        .filter(Boolean)
        .join(' ');

      // Create a unique username based on user ID
      const username = `om_${user.ulid.toLowerCase()}`;

      // Generate a random password
      const password =
        Math.random().toString(36).slice(2) +
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

      this.logger.log(
        `Successfully provisioned Matrix user for ${userId}: ${user.matrixUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to provision Matrix user for ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Matrix credentials could not be provisioned. Please try again.`,
      );
    }

    // Start a Matrix client for the user
    try {
      if (!user.matrixUserId || !user.matrixAccessToken) {
        throw new Error('Matrix credentials missing after provisioning');
      }

      await this.chatProvider.startClient({
        userId: user.matrixUserId,
        accessToken: user.matrixAccessToken,
        deviceId: user.matrixDeviceId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to start Matrix client for user ${userId}: ${error.message}`,
      );
      // Continue anyway - not critical
    }

    return user;
  }

  /**
   * Helper method to enhance messages with user display names
   */
  @Trace('discussion.enhanceMessagesWithUserInfo')
  private async enhanceMessagesWithUserInfo(
    messages: Message[],
  ): Promise<Message[]> {
    return Promise.all(
      messages.map(async (message) => {
        try {
          // Get user info from our database based on Matrix ID
          const userMatrixId = message.sender;

          // Find the OpenMeet user with this Matrix ID
          const userWithMatrixId =
            await this.userService.findByMatrixUserId(userMatrixId);

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
  private async ensureGroupChatRoom(groupId: number, _creatorId: number) {
    try {
      // Try to get existing chat rooms
      const chatRooms = await this.chatRoomService.getGroupChatRooms(groupId);

      // If no chat rooms exist, create one
      if (!chatRooms || chatRooms.length === 0) {
        return await this.chatRoomService.createGroupChatRoom(
          groupId,
          creatorId,
        );
      }

      // Return the first chat room (main group chat room)
      return chatRooms[0];
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
    body: { message: string },
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
    let chatRooms = await this.chatRoomService.getEventChatRooms(event.id);
    if (!chatRooms || chatRooms.length === 0) {
      // No chat room exists yet, create one
      try {
        await this.ensureEventChatRoom(event.id, userId);
        const updatedChatRooms = await this.chatRoomService.getEventChatRooms(event.id);
        
        // If still no chat rooms, return empty result
        if (!updatedChatRooms || updatedChatRooms.length === 0) {
          return { messages: [], end: '' };
        }
        
        // Use the newly created chat rooms
        chatRooms = updatedChatRooms;
      } catch (error) {
        this.logger.error(`Error creating chat room for event ${slug}: ${error.message}`, error.stack);
        return { messages: [], end: '' };
      }
    }

    // Ensure the current user is a member of the room
    try {
      this.logger.log(`Ensuring user ${userId} is a member of event chat room ${chatRooms[0].matrixRoomId}`);
      await this.chatRoomService.addUserToEventChatRoom(event.id, userId);
    } catch (error) {
      this.logger.error(`Error adding user ${userId} to event chat room: ${error.message}`, error.stack);
      // Continue anyway - we'll still try to get messages
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

    // Ensure chat room exists - use event.user as the creator
    const creatorId = event.user?.id || user.id;
    this.logger.debug(`Using creator ID ${creatorId} for event ${event.id}`);
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

  /**
   * Request-scoped cache for expensive operations to avoid duplication
   */
  private getRequestCache() {
    if (!this.request.discussionCache) {
      this.request.discussionCache = {
        groups: new Map(),
        chatRooms: new Map(),
        membershipVerified: new Map()
      };
    }
    return this.request.discussionCache;
  }

  @Trace('discussion.sendGroupDiscussionMessage')
  async sendGroupDiscussionMessage(
    _slug: string,
    _userId: number,
    _body: { message: string },
  ): Promise<{ id: string }> {
    const tenantId = this.request.tenantId;
    const cache = this.getRequestCache();
    
    // Get the group, using request-scoped cache if available
    let group = cache.groups.get(slug);
    if (!group) {
      group = await this.groupService.getGroupBySlug(slug);
      if (!group) {
        throw new NotFoundException(`Group with slug ${slug} not found`);
      }
      
      // Cache the group for potential future use in this request
      cache.groups.set(slug, group);
    }

    // Get or create chat room for the group, using request-scoped cache
    let chatRoom = cache.chatRooms.get(`group:${group.id}`);
    if (!chatRoom) {
      chatRoom = await this.ensureGroupChatRoom(group.id, userId);
      cache.chatRooms.set(`group:${group.id}`, chatRoom);
    }
    
    // Use a cached flag to check if we've already verified membership in this request
    const membershipCacheKey = `group:${group.id}:user:${userId}`;
    const membershipVerified = cache.membershipVerified.get(membershipCacheKey);
    
    if (!membershipVerified) {
      // Check if the user is already a member of the room
      // This will throw an error if they're not a group member
      try {
        // This call is now optimized to handle caching internally
        await this.chatRoomService.addUserToGroupChatRoom(group.id, userId);
        
        // Mark membership as verified for this request cycle
        cache.membershipVerified.set(membershipCacheKey, true);
      } catch (error) {
        if (error.message.includes('not a member of this group')) {
          this.logger.warn(`User ${userId} is not a member of group ${slug}, cannot send message`);
          throw new Error(`You must be a member of this group to send messages`);
        }
        throw error;
      }
    }

    // Send the message to the chat room
    const messageId = await this.chatRoomService.sendMessage(
      chatRoom.id,
      userId,
      body.message,
    );

    return { id: messageId };
  }

  @Trace('discussion.getGroupDiscussionMessages')
  async getGroupDiscussionMessages(
    slug: string,
    userId: number,
    limit = 50,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
    roomId?: string;
  }> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    const cache = this.getRequestCache();
    
    // Get the group, using request-scoped cache if available
    let group = cache.groups.get(slug);
    if (!group) {
      group = await this.groupService.getGroupBySlug(slug);
      if (!group) {
        throw new NotFoundException(`Group with slug ${slug} not found`);
      }
      
      // Cache the group for potential future use in this request
      cache.groups.set(slug, group);
    }

    // Try to get chat room from cache first
    let chatRoom = cache.chatRooms.get(`group:${group.id}`);
    let roomCreated = false;
    
    if (!chatRoom) {
      // Get existing chat rooms for the group
      const chatRooms = await this.chatRoomService.getGroupChatRooms(group.id);
      
      if (chatRooms && chatRooms.length > 0) {
        // Use first chat room (main group chat)
        chatRoom = chatRooms[0];
        cache.chatRooms.set(`group:${group.id}`, chatRoom);
      } else {
        // No chat room exists, create one
        this.logger.debug(`No chat room found for group ${slug}, creating one...`);
        try {
          chatRoom = await this.ensureGroupChatRoom(group.id, userId);
          cache.chatRooms.set(`group:${group.id}`, chatRoom);
          roomCreated = true;
        } catch (error) {
          this.logger.error(`Error creating chat room for group ${slug}: ${error.message}`, error.stack);
          // Return a temporary roomId for the frontend
          const tempRoomId = `temp-group-${group.id}-${Date.now()}`;
          return { 
            messages: [], 
            end: '',
            roomId: tempRoomId
          };
        }
      }
    }

    // Use memebership cache to prevent redundant checks
    const membershipCacheKey = `group:${group.id}:user:${userId}`;
    const membershipVerified = cache.membershipVerified.get(membershipCacheKey);
    
    if (!membershipVerified && !roomCreated) {
      try {
        // This call is now optimized to use internal caching
        await this.chatRoomService.addUserToGroupChatRoom(group.id, userId);
        cache.membershipVerified.set(membershipCacheKey, true);
      } catch (error) {
        // If they're not a group member, we don't continue
        if (error.message.includes('not a member of this group')) {
          this.logger.warn(`User ${userId} is not a member of group ${slug}, cannot access chat`);
          throw new Error(`You must be a member of this group to access discussions`);
        }
        
        this.logger.error(`Error adding user ${userId} to group chat room: ${error.message}`, error.stack);
      }
    }

    // Get messages from the chat room
    const messageData = await this.chatRoomService.getMessages(
      chatRoom.id,
      userId,
      limit,
      from,
    );

    // Enhance messages with user display names (could be optimized further with caching)
    const enhancedMessages = await this.enhanceMessagesWithUserInfo(
      messageData.messages,
    );

    // Return messages with the Matrix room ID
    const roomId = chatRoom.matrixRoomId;
    
    if (!roomId) {
      this.logger.warn(`No Matrix room ID found for chat room of group ${slug}`);
    } else {
      this.logger.debug(`Using Matrix room ID for group ${slug}: ${roomId}`);
    }

    return {
      messages: enhancedMessages,
      end: messageData.end,
      roomId: roomId
    };
  }

  @Trace('discussion.addMemberToGroupDiscussion')
  async addMemberToGroupDiscussion(
    _groupId: number,
    _userId: number,
  ): Promise<void> {
    // Get the group's slug first
    const tenantId = this.request.tenantId;
    
    // Find the group to get its slug
    const group = await this.groupService.findOne(groupId);
    if (!group) {
      throw new NotFoundException(`Group with id ${groupId} not found`);
    }

    // Get the user to get their slug
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Use the slug-based method which is preferred
    await this.addMemberToGroupDiscussionBySlug(group.slug, user.slug);
  }
  
  @Trace('discussion.addMemberToGroupDiscussionBySlug')
  async addMemberToGroupDiscussionBySlug(
    groupSlug: string,
    userSlug: string,
  ): Promise<void> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    // Find the group by slug
    const group = await this.groupService.getGroupBySlug(groupSlug);
    if (!group) {
      throw new NotFoundException(`Group with slug ${groupSlug} not found`);
    }
    
    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }
    
    // Ensure chat room exists - use group.createdBy as the creator
    const creatorId = group.createdBy?.id || user.id;
    this.logger.debug(`Using creator ID ${creatorId} for group ${group.id}`);
    await this.ensureGroupChatRoom(group.id, creatorId);

    // Add the user to the chat room
    await this.chatRoomService.addUserToGroupChatRoom(group.id, user.id);
  }

  @Trace('discussion.removeMemberFromGroupDiscussion')
  async removeMemberFromGroupDiscussion(
    _groupId: number,
    _userId: number,
  ): Promise<void> {
    // Get the group's slug first
    const tenantId = this.request.tenantId;
    
    // Find the group to get its slug
    const group = await this.groupService.findOne(groupId);
    if (!group) {
      throw new NotFoundException(`Group with id ${groupId} not found`);
    }

    // Get the user to get their slug
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Use the slug-based method which is preferred
    await this.removeMemberFromGroupDiscussionBySlug(group.slug, user.slug);
  }
  
  @Trace('discussion.removeMemberFromGroupDiscussionBySlug')
  async removeMemberFromGroupDiscussionBySlug(
    groupSlug: string,
    userSlug: string,
  ): Promise<void> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    
    // Find the group by slug
    const group = await this.groupService.getGroupBySlug(groupSlug);
    if (!group) {
      throw new NotFoundException(`Group with slug ${groupSlug} not found`);
    }
    
    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }
    
    // Remove the user from the chat room
    await this.chatRoomService.removeUserFromGroupChatRoom(group.id, user.id);
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
      this.logger.warn(
        `Could not find event with slug ${eventSlug}: ${error.message}`,
      );
    }

    // Find the user by slug
    try {
      const user = await this.userService.getUserBySlug(userSlug);
      if (user) {
        userId = user.id;
      }
    } catch (error) {
      this.logger.warn(
        `Could not find user with slug ${userSlug}: ${error.message}`,
      );
    }

    return { eventId, userId };
  }

  @Trace('discussion.sendDirectMessage')
  async sendDirectMessage(
    _recipientId: number,
    _senderId: number,
    _body: { message: string },
  ): Promise<{ id: string }> {
    // This would be implemented for direct messaging
    // For now, throwing an error as this is not implemented yet
    await Promise.resolve(); // Add await to fix require-await error
    throw new Error('Direct messaging functionality not implemented yet');
  }

  @Trace('discussion.getDirectMessages')
  async getDirectMessages(
    _userId1: number,
    _userId2: number,
    _limit?: number,
    _from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    // This would be implemented for direct messaging
    // For now, throwing an error as this is not implemented yet
    await Promise.resolve(); // Add await to fix require-await error
    throw new Error('Direct messaging functionality not implemented yet');
  }
}
