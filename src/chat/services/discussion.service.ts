import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserService } from '../../user/user.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { ChatRoomService } from '../rooms/chat-room.service';
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
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private readonly chatRoomService: ChatRoomService,
    @Inject('CHAT_PROVIDER')
    private readonly chatProvider: ChatProviderInterface,
  ) {}

  /**
   * Get messages from either an event or group discussion
   * Generic method that centralizes the logic for both entity types
   */
  @Trace('discussion.getEntityDiscussionMessages')
  private async getEntityDiscussionMessages(
    entityType: 'event' | 'group',
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

    // Get the entity by slug
    let entityId: number;
    let chatRooms;
    let membershipCacheKey: string;

    if (entityType === 'event') {
      // Find the event by slug
      const event = await this.eventQueryService.showEventBySlug(slug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${slug} not found`);
      }
      entityId = event.id;
      membershipCacheKey = `event:${entityId}:user:${userId}`;

      // Get chat rooms for the event
      chatRooms = await this.chatRoomService.getEventChatRooms(entityId);

      // Cache the event for potential future use
      cache.events.set(slug, event);
    } else {
      // Get the group, using request-scoped cache if available
      let group = cache.groups.get(slug);
      if (!group) {
        group = await this.groupService.getGroupBySlug(slug);
        if (!group) {
          throw new NotFoundException(`Group with slug ${slug} not found`);
        }
        // Cache the group for potential future use
        cache.groups.set(slug, group);
      }
      entityId = group.id;
      membershipCacheKey = `group:${entityId}:user:${userId}`;

      // Get chat rooms for the group
      chatRooms = await this.chatRoomService.getGroupChatRooms(entityId);
    }

    // If no chat rooms exist, create one
    let roomCreated = false;
    if (!chatRooms || chatRooms.length === 0) {
      try {
        // Get a lock key to prevent concurrent creation
        const lockKey = `create-${entityType}-chatroom-${entityId}`;
        const existingLock = this.request.locks?.get(lockKey);

        // Initialize lock tracking if needed
        if (!this.request.locks) {
          this.request.locks = new Map();
        }

        if (existingLock) {
          this.logger.debug(
            `Creation of ${entityType} chat room for ID ${entityId} already in progress, waiting...`,
          );

          // Before creating a chat room, check if one was created while we were waiting
          const freshChatRooms =
            entityType === 'event'
              ? await this.chatRoomService.getEventChatRooms(entityId)
              : await this.chatRoomService.getGroupChatRooms(entityId);

          if (freshChatRooms && freshChatRooms.length > 0) {
            this.logger.debug(
              `${entityType} chat room was created by another process, using existing room`,
            );
            chatRooms = freshChatRooms;
          } else {
            // Still no chat room, we should create one
            // But only if we don't already have too many locks (prevent deadlocks)
            if (this.request.locks.size > 5) {
              this.logger.warn(
                `Too many locks in request (${this.request.locks.size}), skipping chat room creation`,
              );
              return { messages: [], end: '' };
            }
          }
        }

        // Set the lock
        this.request.locks.set(lockKey, new Date());

        try {
          // Only create if we still don't have chat rooms
          if (!chatRooms || chatRooms.length === 0) {
            const chatRoom = await this.ensureEntityChatRoom(
              entityType,
              entityId,
              userId,
            );

            // Get updated chat rooms list
            chatRooms =
              entityType === 'event'
                ? await this.chatRoomService.getEventChatRooms(entityId)
                : await this.chatRoomService.getGroupChatRooms(entityId);

            if (!chatRooms || chatRooms.length === 0) {
              return { messages: [], end: '' };
            }

            roomCreated = true;

            // Cache the chat room
            const chatRoomCacheKey = `${entityType}:${entityId}:chatRoom`;
            cache.chatRooms.set(chatRoomCacheKey, chatRoom);
          }
        } finally {
          // Release the lock regardless of outcome
          this.request.locks.delete(lockKey);
        }
      } catch (error) {
        this.logger.error(
          `Error creating chat room for ${entityType} ${slug}: ${error.message}`,
          error.stack,
        );

        // For groups, return a temporary roomId for the frontend
        if (entityType === 'group') {
          const tempRoomId = `temp-${entityType}-${entityId}-${Date.now()}`;
          return {
            messages: [],
            end: '',
            roomId: tempRoomId,
          };
        }

        return { messages: [], end: '' };
      }
    }

    // Check if membership verification is needed
    const membershipVerified = cache.membershipVerified.get(membershipCacheKey);
    const chatRoomMembershipInProgress =
      this.request.chatRoomMembershipCache?.[membershipCacheKey] ===
      'in-progress';

    // For events we use throttling, for groups we only check if not already verified
    let shouldCheckMembership = false;

    if (entityType === 'event') {
      // Set up throttling to reduce frequent checks for events
      const lastCheckKey = `${membershipCacheKey}:lastCheck`;
      const lastCheckTime = cache.membershipVerified.get(lastCheckKey) || 0;
      const now = Date.now();
      const minimumCheckInterval = 30000; // 30 seconds

      // Only proceed with membership check if conditions are met
      shouldCheckMembership =
        !membershipVerified &&
        !chatRoomMembershipInProgress &&
        (lastCheckTime === 0 || now - lastCheckTime > minimumCheckInterval);

      if (shouldCheckMembership) {
        // Update last check time
        cache.membershipVerified.set(lastCheckKey, now);
      }
    } else {
      // For groups, simpler check
      shouldCheckMembership =
        !membershipVerified && !roomCreated && !chatRoomMembershipInProgress;
    }

    if (shouldCheckMembership) {
      // Mark as in-progress in our cache
      cache.membershipVerified.set(membershipCacheKey, 'in-progress');

      try {
        // Add user to chat room based on entity type
        if (entityType === 'event') {
          this.logger.log(
            `Ensuring user ${userId} is a member of event chat room ${chatRooms[0].matrixRoomId}`,
          );
          await this.chatRoomService.addUserToEventChatRoom(entityId, userId);
        } else {
          await this.chatRoomService.addUserToGroupChatRoom(entityId, userId);
        }

        // Mark membership as verified for this request cycle
        cache.membershipVerified.set(membershipCacheKey, true);
      } catch (error) {
        // Special handling for groups - must be a member to access group chat
        if (
          entityType === 'group' &&
          error.message.includes('not a member of this group')
        ) {
          this.logger.warn(
            `User ${userId} is not a member of group ${slug}, cannot access chat`,
          );
          throw new Error(
            `You must be a member of this group to access discussions`,
          );
        }

        this.logger.error(
          `Error adding user ${userId} to ${entityType} chat room: ${error.message}`,
          error.stack,
        );
        // Continue anyway for events - we'll still try to get messages
      }
    } else if (membershipVerified) {
      this.logger.debug(
        `User ${userId} already verified as member of ${entityType} ${entityId} chat room in this request`,
      );
    } else {
      this.logger.debug(
        `Skipping room membership check for user ${userId} (checked recently or in progress)`,
      );
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

    // Return the Matrix room ID along with messages
    const roomId = chatRooms[0].matrixRoomId;

    if (!roomId) {
      this.logger.warn(
        `No Matrix room ID found for chat room of ${entityType} ${slug}`,
      );
    } else {
      this.logger.debug(
        `Using Matrix room ID for ${entityType} ${slug}: ${roomId}`,
      );
    }

    return {
      messages: enhancedMessages,
      end: messageData.end,
      roomId: roomId,
    };
  }

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
   * Ensure a chat room exists for an entity (event or group)
   *
   * @param entityType 'event' or 'group'
   * @param entityId ID of the event or group
   * @param creatorId ID of the user creating the room
   * @returns The chat room entity
   */
  @Trace('discussion.ensureEntityChatRoom')
  private async ensureEntityChatRoom(
    entityType: 'event' | 'group',
    entityId: number,
    creatorId: number,
  ) {
    try {
      // Try to get existing chat rooms based on entity type
      const chatRooms =
        entityType === 'event'
          ? await this.chatRoomService.getEventChatRooms(entityId)
          : await this.chatRoomService.getGroupChatRooms(entityId);

      // If no chat rooms exist, create one
      if (!chatRooms || chatRooms.length === 0) {
        return entityType === 'event'
          ? await this.chatRoomService.createEventChatRoom(entityId, creatorId)
          : await this.chatRoomService.createGroupChatRoom(entityId, creatorId);
      }

      // Return the first chat room (main entity chat room)
      return chatRooms[0];
    } catch (error) {
      this.logger.error(
        `Error ensuring chat room for ${entityType} ${entityId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to ensure chat room for ${entityType}: ${error.message}`,
      );
    }
  }

  /**
   * Ensure a chat room exists for an event
   * @deprecated Use ensureEntityChatRoom with entityType='event' instead
   */
  @Trace('discussion.ensureEventChatRoom')
  private async ensureEventChatRoom(eventId: number, creatorId: number) {
    return this.ensureEntityChatRoom('event', eventId, creatorId);
  }

  /**
   * Ensure a chat room exists for a group
   * @deprecated Use ensureEntityChatRoom with entityType='group' instead
   */
  @Trace('discussion.ensureGroupChatRoom')
  private async ensureGroupChatRoom(groupId: number, creatorId: number) {
    return this.ensureEntityChatRoom('group', groupId, creatorId);
  }

  @Trace('discussion.sendEventDiscussionMessage')
  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string },
  ): Promise<{ id: string }> {
    return this.sendEntityDiscussionMessage('event', slug, userId, body);
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
    roomId?: string;
  }> {
    return this.getEntityDiscussionMessages('event', slug, userId, limit, from);
  }

  /**
   * Legacy method - prefer using slug-based methods instead
   */
  @Trace('discussion.addMemberToEventDiscussion')
  async addMemberToEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    // Get the tenant ID from the request context
    const tenantId = this.request.tenantId;

    // Check if there's a cycle detection flag in the request to prevent recursive loops
    if (this.request._avoidRecursion) {
      this.logger.debug(
        `Avoiding recursive call to addMemberToEventDiscussionBySlug`,
      );
      // Directly add the user to the chat room using entity ID (break the recursion)

      // First ensure a chat room exists for this event
      await this.ensureEntityChatRoom('event', eventId, userId);

      // Then add the user to the chat room
      await this.chatRoomService.addUserToEventChatRoom(eventId, userId);

      // Cache the membership verification in the request cache
      const cache = this.getRequestCache();
      const membershipCacheKey = `event:${eventId}:user:${userId}`;
      cache.membershipVerified.set(membershipCacheKey, true);

      return;
    }

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

    // Set recursion flag before calling the slug-based method to prevent infinite loops
    this.request._avoidRecursion = true;
    try {
      // Use the slug-based method which is preferred
      await this.addMemberToEventDiscussionBySlug(event.slug, user.slug);
    } finally {
      // Always clear the flag when we're done
      delete this.request._avoidRecursion;
    }
  }

  /**
   * Add a member to either an event or group discussion by slug
   * Generic method that centralizes the logic for both entity types
   */
  @Trace('discussion.addMemberToEntityDiscussionBySlug')
  private async addMemberToEntityDiscussionBySlug(
    entityType: 'event' | 'group',
    entitySlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    const tenantId = explicitTenantId || this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    const cache = this.getRequestCache();

    // Find the entity by slug
    let entity;
    let entityId: number;
    let creatorId: number;
    let cacheKey: string;

    if (entityType === 'event') {
      // Find the event by slug
      entity = await this.eventQueryService.showEventBySlug(entitySlug);
      if (!entity) {
        throw new NotFoundException(`Event with slug ${entitySlug} not found`);
      }

      entityId = entity.id;
      creatorId = entity.user?.id || 0;
      cacheKey = `event:${entityId}:chatRoom`;

      // Cache the event for potential future use
      cache.events.set(entitySlug, entity);
    } else {
      // Find the group by slug
      entity = await this.groupService.getGroupBySlug(entitySlug);
      if (!entity) {
        throw new NotFoundException(`Group with slug ${entitySlug} not found`);
      }

      entityId = entity.id;
      creatorId = entity.createdBy?.id || 0;
      cacheKey = `group:${entityId}:chatRoom`;

      // Cache the group for potential future use
      cache.groups.set(entitySlug, entity);
    }

    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }

    // Check if this user's membership has already been verified in this request
    const membershipCacheKey = `${entityType}:${entityId}:user:${user.id}`;
    const membershipVerified = cache.membershipVerified.get(membershipCacheKey);

    if (membershipVerified) {
      this.logger.debug(
        `User ${user.id} already verified as member of ${entityType} ${entityId} chat room in this request`,
      );
      return; // Skip the rest of the process
    }

    // Get or create chat room
    let chatRoom = cache.chatRooms.get(cacheKey);
    if (!chatRoom) {
      // Use creator ID if available, otherwise use the user being added
      const effectiveCreatorId = creatorId || user.id;
      this.logger.debug(
        `Using creator ID ${effectiveCreatorId} for ${entityType} ${entityId}`,
      );

      chatRoom = await this.ensureEntityChatRoom(
        entityType,
        entityId,
        effectiveCreatorId,
      );

      cache.chatRooms.set(cacheKey, chatRoom);
    }

    // Add the user to the appropriate chat room
    if (entityType === 'event') {
      await this.chatRoomService.addUserToEventChatRoom(entityId, user.id);
    } else {
      await this.chatRoomService.addUserToGroupChatRoom(entityId, user.id);
    }

    // Cache the membership verification
    cache.membershipVerified.set(membershipCacheKey, true);
  }

  @Trace('discussion.addMemberToEventDiscussionBySlug')
  async addMemberToEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Add a debug log to help trace potential recursion issues
    this.logger.debug(
      `Adding user ${userSlug} to event ${eventSlug} chat room`,
    );

    // Check if there's a cycle detection flag in the request to prevent recursive loops
    if (this.request._avoidRecursion) {
      this.logger.debug(
        `Avoiding recursive call in addMemberToEventDiscussionBySlug`,
      );
      // Directly use the entity discussion method to break the cycle
      return this.addMemberToEntityDiscussionBySlug(
        'event',
        eventSlug,
        userSlug,
        tenantId,
      );
    }

    // Get event and user IDs from slugs
    const { eventId, userId } = await this.getIdsFromSlugsWithTenant(
      eventSlug,
      userSlug,
      tenantId,
    );

    if (!eventId || !userId) {
      this.logger.error(
        `Could not find event or user with slugs: event=${eventSlug}, user=${userSlug}`,
      );
      return;
    }

    // Verify event exists before proceeding
    const eventExists = await this.checkEventExists(eventId, tenantId);
    if (!eventExists) {
      this.logger.warn(
        `Event ${eventSlug} does not exist in tenant ${tenantId}, skipping chat room creation`,
      );
      return;
    }

    // Set recursion flag before calling the ID-based method to prevent infinite loops
    this.request._avoidRecursion = true;
    try {
      // Add member to event discussion
      await this.addMemberToEventDiscussion(eventId, userId);
    } finally {
      // Always clear the flag when we're done
      delete this.request._avoidRecursion;
    }
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

  /**
   * Remove a member from either an event or group discussion by slug
   * Generic method that centralizes the logic for both entity types
   */
  @Trace('discussion.removeMemberFromEntityDiscussionBySlug')
  private async removeMemberFromEntityDiscussionBySlug(
    entityType: 'event' | 'group',
    entitySlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    const tenantId = explicitTenantId || this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Find the entity by slug
    let entityId: number;

    if (entityType === 'event') {
      // Find the event by slug
      const event = await this.eventQueryService.showEventBySlug(entitySlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${entitySlug} not found`);
      }
      entityId = event.id;
    } else {
      // Find the group by slug
      const group = await this.groupService.getGroupBySlug(entitySlug);
      if (!group) {
        throw new NotFoundException(`Group with slug ${entitySlug} not found`);
      }
      entityId = group.id;
    }

    // Find the user by slug
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }

    // Remove the user from the appropriate chat room
    if (entityType === 'event') {
      await this.chatRoomService.removeUserFromEventChatRoom(entityId, user.id);
    } else {
      await this.chatRoomService.removeUserFromGroupChatRoom(entityId, user.id);
    }

    // Clear any cached membership verification for this user/entity
    const cache = this.getRequestCache();
    const membershipCacheKey = `${entityType}:${entityId}:user:${user.id}`;
    cache.membershipVerified.delete(membershipCacheKey);
  }

  @Trace('discussion.removeMemberFromEventDiscussionBySlug')
  async removeMemberFromEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    return this.removeMemberFromEntityDiscussionBySlug(
      'event',
      eventSlug,
      userSlug,
      explicitTenantId,
    );
  }

  /**
   * Request-scoped cache for expensive operations to avoid duplication
   * The cache structure includes:
   * - groups: Map<string, GroupEntity> - Cached group objects by slug
   * - chatRooms: Map<string, ChatRoomEntity> - Cached chat rooms by key (event:{id}:chatRoom or group:{id}:chatRoom)
   * - membershipVerified: Map<string, boolean> - Cached user membership status by key (event:{id}:user:{id} or group:{id}:user:{id})
   * - events: Map<string, EventEntity> - Cached event objects by slug
   * - users: Map<string, UserEntity> - Cached user objects by slug or ID
   */
  /**
   * Gets or creates a request-scoped cache for expensive operations to avoid duplication
   *
   * @returns The request-scoped cache object
   */
  private getRequestCache() {
    // Safe guard against missing request object (events, background jobs)
    if (!this.request) {
      this.logger.warn(
        'No request object available, possibly called from event handler',
      );
      // Return a temporary cache for this function call that won't be persisted
      return {
        groups: new Map(),
        events: new Map(),
        users: new Map(),
        chatRooms: new Map(),
        membershipVerified: new Map(),
      };
    }

    if (!this.request.discussionCache) {
      this.request.discussionCache = {
        groups: new Map(),
        events: new Map(),
        users: new Map(),
        chatRooms: new Map(),
        membershipVerified: new Map(),
      };
    }
    return this.request.discussionCache;
  }

  /**
   * Send a discussion message to either an event or group chat room
   *
   * @param entityType 'event' or 'group'
   * @param slug The slug of the event or group
   * @param userId The user ID sending the message
   * @param body The message body
   * @returns The message ID
   */
  @Trace('discussion.sendEntityDiscussionMessage')
  private async sendEntityDiscussionMessage(
    entityType: 'event' | 'group',
    slug: string,
    userId: number,
    body: { message: string },
  ): Promise<{ id: string }> {
    // We need the tenant ID for future multi-tenant functionality
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tenantId = this.request.tenantId;
    const cache = this.getRequestCache();

    let entityId: number;
    let chatRoom;
    let chatRoomCacheKey: string;
    let membershipCacheKey: string;

    // Get entity and create cache keys
    if (entityType === 'event') {
      // Find the event by slug
      const event = await this.eventQueryService.showEventBySlug(slug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${slug} not found`);
      }
      entityId = event.id;

      // Set cache keys for event
      chatRoomCacheKey = `event:${entityId}:chatRoom`;
      membershipCacheKey = `event:${entityId}:user:${userId}`;

      // Cache the event for future use
      cache.events.set(slug, event);
    } else {
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
      entityId = group.id;

      // Set cache keys for group
      chatRoomCacheKey = `group:${entityId}:chatRoom`;
      membershipCacheKey = `group:${entityId}:user:${userId}`;
    }

    // Get chat room from cache or create it
    chatRoom = cache.chatRooms.get(chatRoomCacheKey);
    if (!chatRoom) {
      chatRoom = await this.ensureEntityChatRoom(entityType, entityId, userId);
      cache.chatRooms.set(chatRoomCacheKey, chatRoom);
    }

    // Check if user membership is already verified in this request
    const membershipVerified = cache.membershipVerified.get(membershipCacheKey);

    if (!membershipVerified) {
      try {
        // Add user to the room based on entity type
        if (entityType === 'event') {
          await this.chatRoomService.addUserToEventChatRoom(entityId, userId);
        } else {
          await this.chatRoomService.addUserToGroupChatRoom(entityId, userId);
        }

        // Mark membership as verified for this request cycle
        cache.membershipVerified.set(membershipCacheKey, true);
      } catch (error) {
        // Special handling for groups where membership is required
        if (
          entityType === 'group' &&
          error.message.includes('not a member of this group')
        ) {
          this.logger.warn(
            `User ${userId} is not a member of group ${slug}, cannot send message`,
          );
          throw new Error(
            `You must be a member of this group to send messages`,
          );
        }

        this.logger.error(
          `Error adding user ${userId} to ${entityType} chat room: ${error.message}`,
          error.stack,
        );

        // For events we continue anyway to try sending the message
        // For groups we rethrow the error
        if (entityType === 'group') {
          throw error;
        }
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

  @Trace('discussion.sendGroupDiscussionMessage')
  async sendGroupDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string },
  ): Promise<{ id: string }> {
    return this.sendEntityDiscussionMessage('group', slug, userId, body);
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
    return this.getEntityDiscussionMessages('group', slug, userId, limit, from);
  }

  @Trace('discussion.addMemberToGroupDiscussion')
  async addMemberToGroupDiscussion(
    groupId: number,
    userId: number,
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
    explicitTenantId?: string,
  ): Promise<void> {
    return this.addMemberToEntityDiscussionBySlug(
      'group',
      groupSlug,
      userSlug,
      explicitTenantId,
    );
  }

  @Trace('discussion.removeMemberFromGroupDiscussion')
  async removeMemberFromGroupDiscussion(
    groupId: number,
    userId: number,
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
    explicitTenantId?: string,
  ): Promise<void> {
    return this.removeMemberFromEntityDiscussionBySlug(
      'group',
      groupSlug,
      userSlug,
      explicitTenantId,
    );
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

    return this.getIdsFromSlugsWithTenant(eventSlug, userSlug, tenantId);
  }

  /**
   * Similar to getIdsFromSlugs but accepts an explicit tenantId parameter
   * This is useful for event handlers where the request context might not be available
   */
  @Trace('discussion.getIdsFromSlugsWithTenant')
  async getIdsFromSlugsWithTenant(
    eventSlug: string,
    userSlug: string,
    tenantId: string | undefined,
  ): Promise<{ eventId: number | null; userId: number | null }> {
    // If tenantId is not provided, try to use the one from the request
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    let eventId: number | null = null;
    let userId: number | null = null;

    // Find the event by slug
    try {
      // Use a version of showEventBySlug that accepts a tenant ID
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        effectiveTenantId,
      );
      if (event) {
        eventId = event.id;
      }
    } catch (error) {
      this.logger.warn(
        `Could not find event with slug ${eventSlug} in tenant ${effectiveTenantId}: ${error.message}`,
      );
    }

    // Find the user by slug
    try {
      // Use a version of getUserBySlug that accepts a tenant ID
      const user = await this.userService.getUserBySlugWithTenant(
        userSlug,
        effectiveTenantId,
      );
      if (user) {
        userId = user.id;
      }
    } catch (error) {
      this.logger.warn(
        `Could not find user with slug ${userSlug} in tenant ${effectiveTenantId}: ${error.message}`,
      );
    }

    return { eventId, userId };
  }

  /**
   * Check if an event exists by ID
   * @param eventId The event ID to check
   * @param tenantId Optional tenant ID
   * @returns Boolean indicating if the event exists
   */
  @Trace('discussion.checkEventExists')
  async checkEventExists(eventId: number, tenantId?: string): Promise<boolean> {
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    try {
      const event = await this.eventQueryService.findById(
        eventId,
        effectiveTenantId,
      );
      return !!event;
    } catch (error) {
      this.logger.error(
        `Error checking if event ${eventId} exists: ${error.message}`,
      );
      return false;
    }
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

  /**
   * Clean up chat rooms associated with an event before it's deleted
   *
   * @param eventId The ID of the event being deleted
   * @param tenantId Optional tenant ID for multi-tenant environments
   */
  // Use a static logger for methods that might be called from contexts where 'this' is not properly bound
  private static staticLogger = new Logger(DiscussionService.name);

  @Trace('discussion.cleanupEventChatRooms')
  async cleanupEventChatRooms(
    eventId: number,
    tenantId?: string,
  ): Promise<void> {
    // Use either the instance logger or the static logger as fallback
    const logger = this.logger || DiscussionService.staticLogger;

    // Check if chatRoomService is available
    if (!this.chatRoomService) {
      logger.error(
        'chatRoomService is not available. This could be due to a circular dependency or initialization issue.',
      );
      // Return early instead of throwing to avoid blocking event deletion
      logger.warn(
        `Skipping chat room cleanup for event ${eventId} due to missing chatRoomService`,
      );
      return;
    }

    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    logger.log(
      `Cleaning up chat rooms for event ${eventId} in tenant ${effectiveTenantId}`,
    );

    try {
      // Get chat rooms for this event
      const chatRooms = await this.chatRoomService.getEventChatRooms(eventId);

      if (chatRooms && chatRooms.length > 0) {
        logger.log(
          `Found ${chatRooms.length} chat rooms to clean up for event ${eventId}`,
        );

        // Process each chat room
        for (const room of chatRooms) {
          try {
            // Find all members of the room
            const members = await this.chatRoomService.getChatRoomMembers(
              room.id,
            );

            // Remove each member from the room first to ensure clean disconnection
            for (const member of members) {
              try {
                await this.chatRoomService.removeUserFromEventChatRoom(
                  eventId,
                  member.id,
                );
                logger.log(`Removed user ${member.id} from event chat room`);
              } catch (removeError) {
                logger.warn(
                  `Error removing user ${member.id} from room: ${removeError.message}`,
                );
                // Continue with other members
              }
            }
          } catch (roomError) {
            logger.error(
              `Error processing members for chat room ${room.id}: ${roomError.message}`,
            );
            // Continue with other rooms
          }
        }

        // After removing all members, delete the chat rooms
        try {
          await this.chatRoomService.deleteEventChatRooms(eventId);
          logger.log(
            `Successfully deleted all chat rooms for event ${eventId}`,
          );
        } catch (deleteError) {
          logger.error(
            `Error deleting chat rooms for event ${eventId}: ${deleteError.message}`,
          );
          throw deleteError;
        }
      } else {
        logger.log(`No chat rooms found for event ${eventId}`);
      }
    } catch (error) {
      logger.error(
        `Error cleaning up chat rooms for event ${eventId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Clean up chat rooms associated with a group before it's deleted
   *
   * @param groupId The ID of the group being deleted
   * @param tenantId Optional tenant ID for multi-tenant environments
   */
  @Trace('discussion.cleanupGroupChatRooms')
  async cleanupGroupChatRooms(
    groupId: number,
    tenantId?: string,
  ): Promise<void> {
    // Use either the instance logger or the static logger as fallback
    const logger = this.logger || DiscussionService.staticLogger;

    // Check if chatRoomService is available
    if (!this.chatRoomService) {
      logger.error(
        'chatRoomService is not available. This could be due to a circular dependency or initialization issue.',
      );
      // Return early instead of throwing to avoid blocking group deletion
      logger.warn(
        `Skipping chat room cleanup for group ${groupId} due to missing chatRoomService`,
      );
      return;
    }

    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    logger.log(
      `Cleaning up chat rooms for group ${groupId} in tenant ${effectiveTenantId}`,
    );

    try {
      // Get chat rooms for this group
      const chatRooms = await this.chatRoomService.getGroupChatRooms(groupId);

      if (chatRooms && chatRooms.length > 0) {
        logger.log(
          `Found ${chatRooms.length} chat rooms to clean up for group ${groupId}`,
        );

        // Process each chat room
        for (const room of chatRooms) {
          try {
            // Find all members of the room
            const members = await this.chatRoomService.getChatRoomMembers(
              room.id,
            );

            // Remove each member from the room first to ensure clean disconnection
            for (const member of members) {
              try {
                await this.chatRoomService.removeUserFromGroupChatRoom(
                  groupId,
                  member.id,
                );
                logger.log(`Removed user ${member.id} from group chat room`);
              } catch (removeError) {
                logger.warn(
                  `Error removing user ${member.id} from room: ${removeError.message}`,
                );
                // Continue with other members
              }
            }
          } catch (roomError) {
            logger.error(
              `Error processing members for chat room ${room.id}: ${roomError.message}`,
            );
            // Continue with other rooms
          }
        }

        // After removing all members, delete the chat rooms
        try {
          await this.chatRoomService.deleteGroupChatRooms(groupId);
          logger.log(
            `Successfully deleted all chat rooms for group ${groupId}`,
          );
        } catch (deleteError) {
          logger.error(
            `Error deleting chat rooms for group ${groupId}: ${deleteError.message}`,
          );
          throw deleteError;
        }
      } else {
        logger.log(`No chat rooms found for group ${groupId}`);
      }
    } catch (error) {
      logger.error(
        `Error cleaning up chat rooms for group ${groupId}: ${error.message}`,
      );
      throw error;
    }
  }
}
