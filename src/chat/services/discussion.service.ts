import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  forwardRef,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserService } from '../../user/user.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { ChatRoomService } from '../rooms/chat-room.service';
import { ChatProviderInterface } from '../interfaces/chat-provider.interface';
import { ChatRoomManagerInterface } from '../interfaces/chat-room-manager.interface';
import { DiscussionServiceInterface } from '../interfaces/discussion-service.interface';
import { Message } from '../../matrix/types/matrix.types';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { DiscussionMessagesResponseDto } from '../dto/discussion-message.dto';
import {
  EventAttendeePermission,
  GroupPermission,
} from '../../core/constants/constant';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupMemberService } from '../../group-member/group-member.service';

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
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject('CHAT_PROVIDER')
    private readonly chatProvider: ChatProviderInterface,
    @Inject('ChatRoomManagerInterface')
    private readonly chatRoomManager: ChatRoomManagerInterface,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
  ) {}

  /**
   * Get messages from either an event or group discussion
   * Generic method that centralizes the logic for both entity types
   */
  @Trace('discussion.getEntityDiscussionMessages')
  private async getEntityDiscussionMessages(
    entityType: 'event' | 'group',
    slug: string,
    userId: number | null,
    limit = 50,
    from?: string,
    explicitTenantId?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
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

      // Handle cache key for events (events still require authentication for now)
      if (userId === null) {
        throw new ForbiddenException(
          'Authentication required to access event discussions',
        );
      }
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

      // Handle unauthenticated users for groups
      if (userId === null) {
        // Check group visibility for unauthenticated users
        if (group.visibility === 'private') {
          throw new ForbiddenException(
            'Authentication required to access private group discussions',
          );
        }
        // For public groups, allow read-only access without membership checks
        membershipCacheKey = `group:${entityId}:public:${Date.now()}`;
      } else {
        membershipCacheKey = `group:${entityId}:user:${userId}`;
      }

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
              return { messages: [], end: '', roomId: undefined };
            }
          }
        }

        // Set the lock
        this.request.locks.set(lockKey, new Date());

        try {
          // Only create if we still don't have chat rooms
          if (!chatRooms || chatRooms.length === 0) {
            // Only create chat room if we have a valid user ID
            if (userId !== null) {
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
                return { messages: [], end: '', roomId: undefined };
              }

              roomCreated = true;

              // Cache the chat room
              const chatRoomCacheKey = `${entityType}:${entityId}:chatRoom`;
              cache.chatRooms.set(chatRoomCacheKey, chatRoom);
            } else {
              this.logger.debug(
                'Cannot create chat room for unauthenticated user',
              );
              return { messages: [], end: '', roomId: undefined };
            }
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
      // For groups, simpler check - but skip for unauthenticated users (read-only access)
      shouldCheckMembership =
        userId !== null &&
        !membershipVerified &&
        !roomCreated &&
        !chatRoomMembershipInProgress;
    }

    if (shouldCheckMembership && userId !== null) {
      // Mark as in-progress in our cache
      cache.membershipVerified.set(membershipCacheKey, 'in-progress');

      try {
        // Add user to chat room based on entity type
        if (entityType === 'event') {
          this.logger.log(
            `Ensuring user ${userId} is a member of event chat room ${chatRooms[0].matrixRoomId}`,
          );
          await this.chatRoomService.addUserToEventChatRoomById(
            entityId,
            userId,
          );
        } else {
          await this.chatRoomService.addUserToGroupChatRoomById(
            entityId,
            userId,
          );
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

        // Check if the room not found error occurred
        if (error.message && error.message.includes('Room not found (404)')) {
          this.logger.warn(
            `Matrix room for ${entityType} ${slug} not found (404). Attempting to recreate it.`,
          );

          // Delete the existing chat room record to force recreation
          try {
            if (chatRooms.length > 0) {
              // First clear the Matrix room ID in the database
              if (entityType === 'event') {
                // Get the event entity and clear its Matrix room ID
                const dataSource =
                  await this.tenantConnectionService.getTenantConnection(
                    this.request.tenantId,
                  );
                const eventRepo = dataSource.getRepository(EventEntity);
                await eventRepo.update({ id: entityId }, { matrixRoomId: '' });
                this.logger.log(
                  `Cleared Matrix room ID for event ${slug} (${entityId})`,
                );
              } else if (entityType === 'group') {
                // Update the group's Matrix room ID
                await this.groupService.update(slug, { matrixRoomId: '' });
                this.logger.log(
                  `Cleared Matrix room ID for group ${slug} (${entityId})`,
                );
              }

              // Delete the chat room record
              await this.chatRoomService.deleteChatRoom(chatRooms[0].id);
              this.logger.log(
                `Deleted chat room record for ${entityType} ${slug}`,
              );
            }

            // Recreate the chat room
            const newChatRoom = await this.ensureEntityChatRoom(
              entityType,
              entityId,
              userId,
            );
            this.logger.log(
              `Recreated chat room for ${entityType} ${slug} with new Matrix room ID: ${newChatRoom.matrixRoomId}`,
            );

            // Update our local reference to use the new room
            chatRooms = [newChatRoom];

            // Make sure the user is added to the new room
            // Only add user to room if we have a valid user ID
            if (userId !== null) {
              if (entityType === 'event') {
                await this.chatRoomService.addUserToEventChatRoomById(
                  entityId,
                  userId,
                );
              } else {
                await this.chatRoomService.addUserToGroupChatRoomById(
                  entityId,
                  userId,
                );
              }
            }

            // Mark membership as verified
            cache.membershipVerified.set(membershipCacheKey, true);
          } catch (recreateError) {
            this.logger.error(
              `Failed to recreate Matrix room for ${entityType} ${slug}: ${recreateError.message}`,
              recreateError.stack,
            );
            // Continue anyway - we will return an empty message list below
          }
        } else {
          this.logger.error(
            `Error adding user ${userId} to ${entityType} chat room: ${error.message}`,
            error.stack,
          );
        }
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
    try {
      if (!chatRooms || chatRooms.length === 0) {
        this.logger.warn(`No chat rooms found for ${entityType} ${slug}`);
        return { messages: [], end: '', roomId: undefined };
      }

      // For unauthenticated users, we need to handle the null userId case
      let messageData;
      if (userId !== null) {
        messageData = await this.chatRoomService.getMessages(
          chatRooms[0].id,
          userId,
          limit,
          from,
        );
      } else {
        // For unauthenticated users, try to get messages without user context
        // We'll use a default approach - this might need adjustment based on your chat system
        this.logger.debug(
          'Getting messages for unauthenticated user, using read-only access',
        );
        messageData = { messages: [], end: '' }; // For now, return empty until we implement read-only Matrix access
      }

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
        roomId: chatRooms[0].matrixRoomId, // Always include roomId in the response
      };
    } catch (error) {
      // Check for room not found errors and trigger recreation
      if (error.message && error.message.includes('Room not found (404)')) {
        this.logger.warn(
          `Matrix room for ${entityType} ${slug} not found (404) when getting messages. Attempting to recreate it.`,
        );

        try {
          // First clear the Matrix room ID in the database
          if (entityType === 'event') {
            // Get the event entity and clear its Matrix room ID
            const dataSource =
              await this.tenantConnectionService.getTenantConnection(
                this.request.tenantId,
              );
            const eventRepo = dataSource.getRepository(EventEntity);
            await eventRepo.update({ id: entityId }, { matrixRoomId: '' });
            this.logger.log(
              `Cleared Matrix room ID for event ${slug} (${entityId})`,
            );
          } else if (entityType === 'group') {
            // Update the group's Matrix room ID
            await this.groupService.update(slug, { matrixRoomId: '' });
            this.logger.log(
              `Cleared Matrix room ID for group ${slug} (${entityId})`,
            );
          }

          // Delete the chat room record
          if (chatRooms && chatRooms.length > 0) {
            await this.chatRoomService.deleteChatRoom(chatRooms[0].id);
            this.logger.log(
              `Deleted chat room record for ${entityType} ${slug}`,
            );
          }

          // Recreate the chat room
          // Only recreate if we have a valid user ID
          if (userId !== null) {
            const newChatRoom = await this.ensureEntityChatRoom(
              entityType,
              entityId,
              userId,
            );

            this.logger.log(
              `Recreated chat room for ${entityType} ${slug} with new Matrix room ID: ${newChatRoom.matrixRoomId}`,
            );

            // Try to add the user to the new room (only if authenticated)
            if (entityType === 'event') {
              await this.chatRoomService.addUserToEventChatRoomById(
                entityId,
                userId,
              );
            } else {
              await this.chatRoomService.addUserToGroupChatRoomById(
                entityId,
                userId,
              );
            }

            // Return empty messages for now - user will need to refresh
            return { messages: [], end: '', roomId: newChatRoom.matrixRoomId };
          } else {
            this.logger.debug(
              'Cannot recreate chat room for unauthenticated user',
            );
            return { messages: [], end: '', roomId: undefined };
          }
        } catch (recreateError) {
          this.logger.error(
            `Failed to recreate Matrix room for ${entityType} ${slug}: ${recreateError.message}`,
            recreateError.stack,
          );
          // Return empty messages
          return { messages: [], end: '', roomId: undefined };
        }
      }

      // For other errors, just log and return empty messages
      this.logger.error(
        `Error fetching messages for ${entityType} ${slug}: ${error.message}`,
        error.stack,
      );
      return { messages: [], end: '', roomId: undefined };
    }
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
        tenantId, // Explicitly pass tenant ID to the Matrix client
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
   * Will verify the Matrix room still exists and recreate it if needed
   *
   * @param entityType 'event' or 'group'
   * @param entityId ID of the event or group
   * @param creatorId ID of the user creating the room
   * @param forceRecreate Whether to force recreation of the room
   * @returns The chat room entity
   */
  @Trace('discussion.ensureEntityChatRoom')
  private async ensureEntityChatRoom(
    entityType: 'event' | 'group',
    entityId: number,
    creatorId: number,
    forceRecreate = false,
  ) {
    try {
      // Try to get existing chat rooms based on entity type
      const chatRooms =
        entityType === 'event'
          ? await this.chatRoomService.getEventChatRooms(entityId)
          : await this.chatRoomService.getGroupChatRooms(entityId);

      // If a room exists but we're forcing recreation, handle clearing the old room first
      if (chatRooms && chatRooms.length > 0 && forceRecreate) {
        this.logger.log(
          `Force recreating ${entityType} chat room for ID ${entityId}`,
        );

        // Clear the room ID in the entity
        try {
          if (entityType === 'event') {
            // Get the event entity and clear its Matrix room ID
            const dataSource =
              await this.tenantConnectionService.getTenantConnection(
                this.request.tenantId,
              );
            const eventRepo = dataSource.getRepository(EventEntity);
            await eventRepo.update({ id: entityId }, { matrixRoomId: '' });
          } else if (entityType === 'group') {
            // Get the group by ID through the service
            const group = await this.groupService.findOne(entityId);
            if (group) {
              // Update the group's Matrix room ID
              await this.groupService.update(group.slug, { matrixRoomId: '' });
            }
          }

          // Delete the chat room record
          await this.chatRoomService.deleteChatRoom(chatRooms[0].id);
        } catch (error) {
          this.logger.error(
            `Error clearing entity data for forced recreation: ${error.message}`,
            error.stack,
          );
          // Continue with recreation anyway - this is a best effort
        }
      }

      // Check if rooms exist after potential deletion
      const updatedChatRooms = forceRecreate
        ? []
        : entityType === 'event'
          ? await this.chatRoomService.getEventChatRooms(entityId)
          : await this.chatRoomService.getGroupChatRooms(entityId);

      // If no chat rooms exist, create one
      if (!updatedChatRooms || updatedChatRooms.length === 0) {
        this.logger.log(
          `Creating new ${entityType} chat room for ID ${entityId}`,
        );
        return entityType === 'event'
          ? await this.chatRoomService.createEventChatRoom(entityId, creatorId)
          : await this.chatRoomService.createGroupChatRoom(entityId, creatorId);
      }

      // At this point we have a chat room, but let's verify the Matrix room still exists
      // For now, we'll just check that there's a Matrix room ID - we'll improve this later
      if (!updatedChatRooms[0].matrixRoomId) {
        this.logger.warn(
          `Chat room for ${entityType} ${entityId} exists but has no Matrix room ID. Recreating...`,
        );

        // Delete the existing chat room and recreate it
        await this.chatRoomService.deleteChatRoom(updatedChatRooms[0].id);

        return entityType === 'event'
          ? await this.chatRoomService.createEventChatRoom(entityId, creatorId)
          : await this.chatRoomService.createGroupChatRoom(entityId, creatorId);
      }

      // Return the first chat room (main entity chat room)
      return updatedChatRooms[0];
    } catch (error) {
      // If we get a room not found error, try to recreate the room
      if (
        error.message &&
        error.message.includes('Room not found (404)') &&
        !forceRecreate
      ) {
        this.logger.warn(
          `Matrix room for ${entityType} ${entityId} not found (404). Attempting to recreate with forced flag.`,
        );

        // Call this same method with the force flag
        return this.ensureEntityChatRoom(entityType, entityId, creatorId, true);
      }

      this.logger.error(
        `Error ensuring chat room for ${entityType} ${entityId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to ensure chat room for ${entityType}: ${error.message}`,
      );
    }
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
  ): Promise<DiscussionMessagesResponseDto> {
    return this.getEntityDiscussionMessages('event', slug, userId, limit, from);
  }

  /**
   * @deprecated Use slug-based methods instead
   * Legacy method maintained for backward compatibility
   */
  @Trace('discussion.addMemberToEventDiscussion')
  async addMemberToEventDiscussion(
    eventId: number,
    userId: number,
    explicitTenantId?: string,
  ): Promise<void> {
    // Get tenant ID either from explicit parameter or request context
    let tenantId = explicitTenantId;

    // If no explicit tenantId, try to get it from request context
    if (!tenantId) {
      // Check if this.request exists - might be undefined when called from event handlers
      if (!this.request) {
        this.logger.warn(
          `Request object not available in addMemberToEventDiscussion, likely called from event handler`,
        );
        // We can't proceed without a tenant ID
        throw new Error(
          'Tenant ID is required - either pass it explicitly or call from request context',
        );
      }

      // Try to get tenantId from request
      tenantId = this.request.tenantId;
    }

    // Final check that we have a tenantId one way or another
    if (!tenantId) {
      this.logger.error(
        'Tenant ID is required but not available from any source',
      );
      throw new Error('Tenant ID is required');
    }

    // Check if there's a cycle detection flag in the request to prevent recursive loops
    if (this.request._avoidRecursion) {
      this.logger.debug(
        `Avoiding recursive call to addMemberToEventDiscussionBySlug`,
      );
      // Directly add the user to the chat room using entity ID (break the recursion)

      // First ensure a chat room exists for this event
      await this.ensureEntityChatRoom('event', eventId, userId);

      // Then add the user to the chat room
      await this.chatRoomService.addUserToEventChatRoomById(eventId, userId);

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
      await this.addMemberToEventDiscussionBySlug(
        event.slug,
        user.slug,
        tenantId,
      );
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
    // When called from event handlers, this.request might be undefined
    // Always rely on explicit tenantId being passed
    const tenantId = explicitTenantId;
    if (!tenantId) {
      throw new Error('Explicit Tenant ID is required for event handlers');
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

    // Add the user to the appropriate chat room, using slugs directly
    if (entityType === 'event') {
      await this.chatRoomService.addUserToEventChatRoom(entitySlug, userSlug);
    } else {
      await this.chatRoomService.addUserToGroupChatRoom(entitySlug, userSlug);
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
    // Call the new method that returns roomId info but discard the return value
    await this.addMemberToEventDiscussionBySlugAndGetRoomId(
      eventSlug,
      userSlug,
      explicitTenantId,
    );
  }

  /**
   * Similar to addMemberToEventDiscussionBySlug but returns room information including the roomId
   */
  @Trace('discussion.addMemberToEventDiscussionBySlugAndGetRoomId')
  async addMemberToEventDiscussionBySlugAndGetRoomId(
    eventSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<{ roomId?: string }> {
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
    // First check if this.request exists to avoid "Cannot read properties of undefined"
    if (this.request && this.request._avoidRecursion) {
      this.logger.debug(
        `Avoiding recursive call in addMemberToEventDiscussionBySlugAndGetRoomId`,
      );
      // Directly use the entity discussion method to break the cycle
      await this.addMemberToEntityDiscussionBySlug(
        'event',
        eventSlug,
        userSlug,
        tenantId,
      );

      // After adding the member, try to get the room ID from the event
      try {
        const event = await this.eventQueryService.showEventBySlug(eventSlug);
        return { roomId: event?.matrixRoomId };
      } catch (error) {
        this.logger.error(
          `Error getting event after adding member: ${error.message}`,
        );
        return { roomId: undefined };
      }
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
      return { roomId: undefined };
    }

    // Verify event exists before proceeding
    const eventExists = await this.checkEventExists(eventId, tenantId);
    if (!eventExists) {
      this.logger.warn(
        `Event ${eventSlug} does not exist in tenant ${tenantId}, skipping chat room creation`,
      );
      return { roomId: undefined };
    }

    // Set recursion flag before calling the ID-based method to prevent infinite loops
    if (this.request) {
      this.request._avoidRecursion = true;
    }

    try {
      // Add member to event discussion - pass the tenant ID explicitly
      await this.addMemberToEventDiscussion(eventId, userId, tenantId);

      // After successfully adding the member, fetch the event to get its room ID
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const eventRepository = dataSource.getRepository(EventEntity);

      // Get the event with up-to-date matrixRoomId
      const event = await eventRepository.findOne({
        where: { id: eventId },
      });

      // Find the chat room for this event
      try {
        const chatRooms = await this.chatRoomService.getEventChatRooms(eventId);
        if (chatRooms && chatRooms.length > 0) {
          return { roomId: chatRooms[0].matrixRoomId };
        }
      } catch (error) {
        this.logger.warn(
          `Error getting chat rooms for event ${eventId}: ${error.message}`,
        );
      }

      // Fall back to the event's matrixRoomId if available
      return {
        roomId: event?.matrixRoomId,
      };
    } finally {
      // Always clear the flag when we're done
      if (this.request) {
        delete this.request._avoidRecursion;
      }
    }
  }

  /**
   * @deprecated Use slug-based methods instead
   * Legacy method maintained for backward compatibility
   */
  @Trace('discussion.removeMemberFromEventDiscussion')
  async removeMemberFromEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void> {
    // Delegate to the unified entity-based implementation
    await this.removeMemberFromEntityDiscussion('event', eventId, userId);
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
    // When called from event handlers, this.request might be undefined
    // Always rely on explicit tenantId being passed
    const tenantId = explicitTenantId;
    if (!tenantId) {
      throw new Error('Explicit Tenant ID is required for event handlers');
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

    // Use the ID-based method to avoid duplication
    await this.removeMemberFromEntityDiscussion(
      entityType,
      entityId,
      user.id,
      tenantId,
    );
  }

  /**
   * Remove a member from either an event or group discussion by ID
   * Generic method that centralizes the logic for both entity types
   */
  @Trace('discussion.removeMemberFromEntityDiscussion')
  private async removeMemberFromEntityDiscussion(
    entityType: 'event' | 'group',
    entityId: number,
    userId: number,
    explicitTenantId?: string,
  ): Promise<void> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Remove the user from the appropriate chat room
    if (entityType === 'event') {
      await this.chatRoomService.removeUserFromEventChatRoomById(
        entityId,
        userId,
      );
    } else {
      await this.chatRoomService.removeUserFromGroupChatRoomById(
        entityId,
        userId,
      );
    }

    // Clear any cached membership verification for this user/entity
    const cache = this.getRequestCache();
    const membershipCacheKey = `${entityType}:${entityId}:user:${userId}`;
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
    explicitTenantId?: string,
  ): Promise<{ id: string }> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

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
          await this.chatRoomService.addUserToEventChatRoomById(
            entityId,
            userId,
          );
        } else {
          await this.chatRoomService.addUserToGroupChatRoomById(
            entityId,
            userId,
          );
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
    explicitTenantId?: string,
  ): Promise<{ id: string }> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Pass the tenant context to the entity discussion method
    return this.sendEntityDiscussionMessage(
      'group',
      slug,
      userId,
      body,
      tenantId,
    );
  }

  @Trace('discussion.getGroupDiscussionMessages')
  async getGroupDiscussionMessages(
    slug: string,
    userId: number | null,
    limit = 50,
    from?: string,
    explicitTenantId?: string,
  ): Promise<DiscussionMessagesResponseDto> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Pass the tenant context to the entity discussion method
    return this.getEntityDiscussionMessages(
      'group',
      slug,
      userId,
      limit,
      from,
      tenantId,
    );
  }

  @Trace('discussion.addMemberToGroupDiscussion')
  async addMemberToGroupDiscussion(
    groupId: number,
    userId: number,
    explicitTenantId?: string,
  ): Promise<void> {
    // Get tenant ID from explicit parameter or request context
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Check if the group and user exist
    const group = await this.groupService.findOne(groupId);
    if (!group) {
      throw new NotFoundException(`Group with id ${groupId} not found`);
    }

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    // Use the tenant-aware ChatRoomManagerInterface implementation with slugs
    await this.chatRoomManager.addUserToGroupChatRoom(
      group.slug,
      user.slug,
      tenantId,
    );

    this.logger.log(
      `Added user ${user.slug} to group ${group.slug} chat room in tenant ${tenantId}`,
    );
  }

  @Trace('discussion.addMemberToGroupDiscussionBySlug')
  async addMemberToGroupDiscussionBySlug(
    groupSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    // If tenantId is provided, use it directly. Otherwise try to use the one from the request
    // In event listener context, explicitTenantId MUST be provided
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error(
        'Explicit tenantId is required when called from event listeners',
      );
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

    // Use the tenant-aware ChatRoomManagerInterface implementation
    await this.chatRoomManager.addUserToGroupChatRoom(
      group.slug,
      user.slug,
      tenantId,
    );

    this.logger.log(
      `Added user ${userSlug} to group ${groupSlug} chat room in tenant ${tenantId}`,
    );
  }

  /**
   * @deprecated Use slug-based methods instead
   * Legacy method maintained for backward compatibility
   */
  @Trace('discussion.removeMemberFromGroupDiscussion')
  async removeMemberFromGroupDiscussion(
    groupId: number,
    userId: number,
    explicitTenantId?: string,
  ): Promise<void> {
    // Delegate to the unified entity-based implementation
    await this.removeMemberFromEntityDiscussion(
      'group',
      groupId,
      userId,
      explicitTenantId,
    );
  }

  @Trace('discussion.removeMemberFromGroupDiscussionBySlug')
  async removeMemberFromGroupDiscussionBySlug(
    groupSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<void> {
    // If tenantId is provided, use it directly. Otherwise try to use the one from the request
    // In event listener context, explicitTenantId MUST be provided
    const tenantId = explicitTenantId || this.request?.tenantId;

    if (!tenantId) {
      this.logger.error(
        'Explicit tenantId is required when called from event listeners',
      );
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

    // Use the tenant-aware ChatRoomManagerInterface implementation
    await this.chatRoomManager.removeUserFromGroupChatRoom(
      group.slug,
      user.slug,
      tenantId,
    );

    this.logger.log(
      `Removed user ${userSlug} from group ${groupSlug} chat room in tenant ${tenantId}`,
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
    // If tenantId is provided, use it directly. Otherwise try to use the one from the request
    // In event listener context, explicitTenantId MUST be provided
    const effectiveTenantId = tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Explicit tenantId is required when called from event listeners',
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
   * Get group and user IDs from their slugs with tenant context
   * This is used by event handlers where tenant context is required
   */
  @Trace('discussion.getGroupAndUserIdsFromSlugsWithTenant')
  async getGroupAndUserIdsFromSlugsWithTenant(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<{ groupId: number; userId: number }> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Get the group ID
    const groupId = await this.getGroupIdFromSlugWithTenant(
      groupSlug,
      tenantId,
    );

    // Get the user ID
    const userId = await this.getUserIdFromSlugWithTenant(userSlug, tenantId);

    return { groupId, userId };
  }

  /**
   * Get a group ID from its slug with tenant context
   */
  @Trace('discussion.getGroupIdFromSlugWithTenant')
  async getGroupIdFromSlugWithTenant(
    groupSlug: string,
    tenantId: string,
  ): Promise<number> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    try {
      const group = await this.groupService.getGroupBySlug(groupSlug);
      if (!group) {
        throw new Error(`Group with slug ${groupSlug} not found`);
      }
      return group.id;
    } catch (error) {
      this.logger.warn(
        `Could not find group with slug ${groupSlug} in tenant ${tenantId}: ${error.message}`,
      );
      throw new Error(`Group with slug ${groupSlug} not found`);
    }
  }

  /**
   * Get a user ID from its slug with tenant context
   */
  @Trace('discussion.getUserIdFromSlugWithTenant')
  async getUserIdFromSlugWithTenant(
    userSlug: string,
    tenantId: string,
  ): Promise<number> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    try {
      const user = await this.userService.getUserBySlugWithTenant(
        userSlug,
        tenantId,
      );
      if (!user) {
        throw new Error(`User with slug ${userSlug} not found`);
      }
      return user.id;
    } catch (error) {
      this.logger.warn(
        `Could not find user with slug ${userSlug} in tenant ${tenantId}: ${error.message}`,
      );
      throw new Error(`User with slug ${userSlug} not found`);
    }
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

  /**
   * Check if a group exists by slug
   * @param groupSlug The group slug to check
   * @param tenantId Optional tenant ID
   * @returns The group if it exists, null otherwise
   */
  @Trace('discussion.groupExists')
  async groupExists(groupSlug: string, tenantId?: string): Promise<any> {
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    try {
      return await this.groupService.getGroupBySlug(groupSlug);
    } catch (error) {
      this.logger.error(
        `Error checking if group ${groupSlug} exists: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get chat rooms for a group by slug
   * @param groupSlug The group slug
   * @param tenantId Optional tenant ID
   * @returns Array of chat room entities
   */
  @Trace('discussion.getGroupChatRooms')
  async getGroupChatRooms(
    groupSlug: string,
    tenantId?: string,
  ): Promise<any[]> {
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    try {
      return await this.chatRoomManager.getGroupChatRooms(
        groupSlug,
        effectiveTenantId,
      );
    } catch (error) {
      this.logger.error(
        `Error getting chat rooms for group ${groupSlug}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * @todo Not implemented yet - placeholder for interface compatibility
   */
  @Trace('discussion.sendDirectMessage')
  async sendDirectMessage(
    _recipientId: number,
    _senderId: number,
    _body: { message: string },
  ): Promise<{ id: string }> {
    await Promise.resolve(); // Add await to fix require-await error
    throw new Error('Direct messaging functionality not implemented yet');
  }

  /**
   * @todo Not implemented yet - placeholder for interface compatibility
   */
  @Trace('discussion.getDirectMessages')
  async getDirectMessages(
    _userId1: number,
    _userId2: number,
    _limit?: number,
    _from?: string,
  ): Promise<DiscussionMessagesResponseDto> {
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
                await this.chatRoomService.removeUserFromEventChatRoomById(
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
      // Get the group to find its slug
      const group = await this.groupService.findOne(groupId);
      if (!group) {
        logger.warn(
          `Group with ID ${groupId} not found, skipping chat room cleanup`,
        );
        return;
      }

      // Check if group exists using the ChatRoomManagerInterface with slug
      const groupExists = await this.chatRoomManager.checkGroupExists(
        group.slug,
        effectiveTenantId,
      );

      if (!groupExists) {
        logger.warn(
          `Group ${group.slug} does not exist in tenant ${effectiveTenantId}, skipping chat room cleanup`,
        );
        return;
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation to delete chat rooms with slug
      await this.chatRoomManager.deleteGroupChatRooms(
        group.slug,
        effectiveTenantId,
      );

      logger.log(
        `Successfully deleted all chat rooms for group ${group.slug} in tenant ${effectiveTenantId}`,
      );
    } catch (error) {
      logger.error(
        `Error cleaning up chat rooms for group ${groupId}: ${error.message}`,
        error.stack,
      );
      // Don't rethrow the error to avoid blocking the group deletion operation
      // The group deletion should proceed even if chat room cleanup fails
    }
  }

  /**
   * Delete an event chat room
   *
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   */
  @Trace('discussion.deleteEventChatRoom')
  async deleteEventChatRoom(
    eventSlug: string,
    tenantId: string,
  ): Promise<void> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(eventSlug);
    if (!event) {
      throw new Error(`Event with slug ${eventSlug} not found`);
    }

    try {
      // First clear the Matrix room ID in the database
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const eventRepo = dataSource.getRepository(EventEntity);
      await eventRepo.update({ id: event.id }, { matrixRoomId: '' });
      this.logger.log(`Cleared Matrix room ID for event ${eventSlug}`);

      // Get all chat rooms for this event
      const chatRooms = await this.chatRoomService.getEventChatRooms(event.id);
      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for event ${eventSlug}`);
        return;
      }

      // Process each chat room
      for (const room of chatRooms) {
        try {
          // Delete the chat room record and Matrix room
          await this.chatRoomService.deleteChatRoom(room.id);
          this.logger.log(
            `Deleted chat room ${room.id} for event ${eventSlug}`,
          );
        } catch (roomError) {
          this.logger.error(
            `Error deleting chat room ${room.id}: ${roomError.message}`,
            roomError.stack,
          );
          // Continue with other rooms
        }
      }
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create a new event chat room
   *
   * @param eventSlug The slug of the event
   * @param creatorSlug The slug of the creator
   * @param tenantId The tenant ID
   * @returns Information about the new room including roomId
   */
  @Trace('discussion.createEventChatRoom')
  async createEventChatRoom(
    eventSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<{ roomId?: string }> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Find the event by slug
    const event = await this.eventQueryService.showEventBySlug(eventSlug);
    if (!event) {
      throw new Error(`Event with slug ${eventSlug} not found`);
    }

    // Check if there's already a chat room for this event
    const existingRooms = await this.chatRoomService.getEventChatRooms(
      event.id,
    );
    if (existingRooms && existingRooms.length > 0) {
      this.logger.warn(
        `Chat room already exists for event ${eventSlug}, returning existing room ID`,
      );
      return { roomId: existingRooms[0].matrixRoomId };
    }

    // Find the creator user by slug
    const creator = await this.userService.getUserBySlug(creatorSlug);
    if (!creator) {
      throw new Error(`Creator user with slug ${creatorSlug} not found`);
    }

    // Create a new chat room
    try {
      const newRoom = await this.ensureEntityChatRoom(
        'event',
        event.id,
        creator.id,
      );
      this.logger.log(
        `Created new chat room for event ${eventSlug} with Matrix room ID: ${newRoom.matrixRoomId}`,
      );
      return { roomId: newRoom.matrixRoomId };
    } catch (error) {
      this.logger.error(
        `Error creating chat room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create chat room: ${error.message}`);
    }
  }

  /**
   * Delete a group chat room
   *
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   */
  @Trace('discussion.deleteGroupChatRoom')
  async deleteGroupChatRoom(
    groupSlug: string,
    tenantId: string,
  ): Promise<void> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Find the group by slug
    const group = await this.groupService.getGroupBySlug(groupSlug);
    if (!group) {
      throw new Error(`Group with slug ${groupSlug} not found`);
    }

    try {
      // First update the group to clear the Matrix room ID
      await this.groupService.update(group.slug, { matrixRoomId: '' });
      this.logger.log(`Cleared Matrix room ID for group ${groupSlug}`);

      // Get all chat rooms for this group
      const chatRooms = await this.chatRoomService.getGroupChatRooms(group.id);
      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for group ${groupSlug}`);
        return;
      }

      // Process each chat room
      for (const room of chatRooms) {
        try {
          // Delete the chat room record and Matrix room
          await this.chatRoomService.deleteChatRoom(room.id);
          this.logger.log(
            `Deleted chat room ${room.id} for group ${groupSlug}`,
          );
        } catch (roomError) {
          this.logger.error(
            `Error deleting chat room ${room.id}: ${roomError.message}`,
            roomError.stack,
          );
          // Continue with other rooms
        }
      }
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for group ${groupSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create a new group chat room
   *
   * @param groupSlug The slug of the group
   * @param creatorSlug The slug of the creator
   * @param tenantId The tenant ID
   * @returns Information about the new room including roomId
   */
  @Trace('discussion.createGroupChatRoom')
  async createGroupChatRoom(
    groupSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<{ roomId?: string }> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    // Find the group by slug
    const group = await this.groupService.getGroupBySlug(groupSlug);
    if (!group) {
      throw new Error(`Group with slug ${groupSlug} not found`);
    }

    // Check if there's already a chat room for this group
    const existingRooms = await this.chatRoomService.getGroupChatRooms(
      group.id,
    );
    if (existingRooms && existingRooms.length > 0) {
      this.logger.warn(
        `Chat room already exists for group ${groupSlug}, returning existing room ID`,
      );
      return { roomId: existingRooms[0].matrixRoomId };
    }

    // Find the creator user by slug
    const creator = await this.userService.getUserBySlug(creatorSlug);
    if (!creator) {
      throw new Error(`Creator user with slug ${creatorSlug} not found`);
    }

    // Create a new chat room
    try {
      const newRoom = await this.ensureEntityChatRoom(
        'group',
        group.id,
        creator.id,
      );
      this.logger.log(
        `Created new chat room for group ${groupSlug} with Matrix room ID: ${newRoom.matrixRoomId}`,
      );
      return { roomId: newRoom.matrixRoomId };
    } catch (error) {
      this.logger.error(
        `Error creating chat room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create chat room: ${error.message}`);
    }
  }

  /**
   * Redact a message from an event discussion
   */
  @Trace('discussion.redactEventDiscussionMessage')
  async redactEventDiscussionMessage(
    eventSlug: string,
    messageEventId: string,
    userSlug: string,
    tenantId: string,
    reason?: string,
  ): Promise<string> {
    return this.redactEntityDiscussionMessage(
      'event',
      eventSlug,
      messageEventId,
      userSlug,
      tenantId,
      reason,
    );
  }

  /**
   * Redact a message from a group discussion
   */
  @Trace('discussion.redactGroupDiscussionMessage')
  async redactGroupDiscussionMessage(
    groupSlug: string,
    messageEventId: string,
    userSlug: string,
    tenantId: string,
    reason?: string,
  ): Promise<string> {
    return this.redactEntityDiscussionMessage(
      'group',
      groupSlug,
      messageEventId,
      userSlug,
      tenantId,
      reason,
    );
  }

  /**
   * Generic method to redact messages from either event or group discussions
   * Permission logic:
   * - Users can always redact their own messages (no special permission needed)
   * - Users with ManageDiscussions permission can redact any message
   */
  @Trace('discussion.redactEntityDiscussionMessage')
  private async redactEntityDiscussionMessage(
    entityType: 'event' | 'group',
    entitySlug: string,
    messageEventId: string,
    userSlug: string,
    tenantId: string,
    reason?: string,
  ): Promise<string> {
    if (!tenantId) {
      this.logger.error('Tenant ID is required');
      throw new Error('Tenant ID is required');
    }

    let entity;
    let chatRooms;

    // Get the user making the redaction request
    const user = await this.userService.getUserBySlug(userSlug);
    if (!user) {
      throw new NotFoundException(`User with slug ${userSlug} not found`);
    }

    // Get entity and chat rooms
    if (entityType === 'event') {
      entity = await this.eventQueryService.showEventBySlug(entitySlug);
      if (!entity) {
        throw new NotFoundException(`Event with slug ${entitySlug} not found`);
      }

      chatRooms = await this.chatRoomService.getEventChatRooms(entity.id);
    } else {
      entity = await this.groupService.getGroupBySlug(entitySlug);
      if (!entity) {
        throw new NotFoundException(`Group with slug ${entitySlug} not found`);
      }

      chatRooms = await this.chatRoomService.getGroupChatRooms(entity.id);
    }

    if (!chatRooms || chatRooms.length === 0) {
      throw new NotFoundException(
        `No chat room found for ${entityType} ${entitySlug}`,
      );
    }

    const chatRoom = chatRooms[0];

    // Debug logging for redaction attempt
    this.logger.log(
      `Redaction attempt: User ${userSlug} trying to redact message ${messageEventId} in ${entityType} ${entitySlug}`,
    );

    // Check if user should have moderator permissions and sync if needed
    const shouldHaveModeratorPermissions =
      await this.shouldUserHaveModeratorPermissions(user, entity, entityType);

    if (shouldHaveModeratorPermissions && user.matrixUserId) {
      await this.syncUserMatrixPermissions(
        user.matrixUserId,
        chatRoom.matrixRoomId,
        50, // Moderator level
        `User ${user.slug} requires moderator permissions in ${entityType} ${entitySlug}`,
      );
    }

    // Use the chat provider to redact the message
    try {
      const redactionEventId = await this.chatProvider.redactMessage({
        roomId: chatRoom.matrixRoomId,
        eventId: messageEventId,
        reason,
        userSlug,
        tenantId,
      });

      this.logger.log(
        `Successfully redacted message ${messageEventId} in ${entityType} ${entitySlug} by user ${userSlug}`,
      );

      return redactionEventId;
    } catch (error) {
      this.logger.error(
        `Failed to redact message ${messageEventId} in ${entityType} ${entitySlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a user has a specific permission for an entity (event or group)
   */
  private async checkEntityPermission(
    userId: number,
    entityId: number,
    entityType: 'event' | 'group',
    permission: EventAttendeePermission | GroupPermission,
  ): Promise<void> {
    const tenantId = this.request?.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    if (entityType === 'event') {
      // Check event attendee permissions
      try {
        const attendee = await this.eventAttendeeService.findEventAttendeeByUserId(
          entityId,
          userId,
        );

        if (!attendee) {
          throw new ForbiddenException(
            `User ${userId} is not an attendee of event ${entityId}`,
          );
        }

        // Check if the attendee's role has the required permission
        if (attendee.role && attendee.role.permissions) {
          const hasPermission = attendee.role.permissions.some(
            (p: any) => p.name === permission,
          );

          if (!hasPermission) {
            throw new ForbiddenException(
              `User ${userId} does not have permission ${permission} for event ${entityId}`,
            );
          }
        } else {
          throw new ForbiddenException(
            `User ${userId} has no role or permissions for event ${entityId}`,
          );
        }
      } catch (error) {
        this.logger.error(`Error checking event permission: ${error.message}`);
        throw error;
      }
    } else if (entityType === 'group') {
      // Check group member permissions
      try {
        const member = await this.groupMemberService.findGroupMemberByUserId(
          entityId,
          userId,
        );

        if (!member) {
          throw new ForbiddenException(
            `User ${userId} is not a member of group ${entityId}`,
          );
        }

        // Check if the member's role has the required permission
        if (member.groupRole && member.groupRole.groupPermissions) {
          const hasPermission = member.groupRole.groupPermissions.some(
            (p: any) => p.name === permission,
          );

          if (!hasPermission) {
            throw new ForbiddenException(
              `User ${userId} does not have permission ${permission} for group ${entityId}`,
            );
          }
        } else {
          throw new ForbiddenException(
            `User ${userId} has no role or permissions for group ${entityId}`,
          );
        }
      } catch (error) {
        this.logger.error(`Error checking group permission: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Determine if a user should have moderator permissions based on their role
   */
  private async shouldUserHaveModeratorPermissions(
    user: any,
    entity: any,
    entityType: 'event' | 'group',
  ): Promise<boolean> {
    if (entityType === 'event') {
      // Event owners always have moderator permissions
      if (entity.userId === user.id) {
        this.logger.log(
          `User ${user.slug} is the owner of event ${entity.slug}`,
        );
        return true;
      }

      // Check if user has ManageDiscussions permission via their role
      try {
        await this.checkEntityPermission(
          user.id,
          entity.id,
          'event',
          EventAttendeePermission.ManageDiscussions,
        );
        this.logger.log(
          `User ${user.slug} has ManageDiscussions permission in event ${entity.slug}`,
        );
        return true;
      } catch {
        // User doesn't have ManageDiscussions permission
        return false;
      }
    } else if (entityType === 'group') {
      // Check if user has ManageDiscussions permission via their group role
      try {
        await this.checkEntityPermission(
          user.id,
          entity.id,
          'group',
          GroupPermission.ManageDiscussions,
        );
        this.logger.log(
          `User ${user.slug} has ManageDiscussions permission in group ${entity.slug}`,
        );
        return true;
      } catch {
        // User doesn't have ManageDiscussions permission
        return false;
      }
    }

    return false;
  }

  /**
   * Sync Matrix power level for a user in a room
   */
  private async syncUserMatrixPermissions(
    matrixUserId: string,
    matrixRoomId: string,
    powerLevel: number,
    reason: string,
  ): Promise<void> {
    try {
      this.logger.log(`Syncing Matrix permissions: ${reason}`);

      await this.chatRoomService.updateUserPowerLevel(
        matrixRoomId,
        matrixUserId,
        powerLevel,
      );

      this.logger.log(
        `Successfully synced Matrix power level ${powerLevel} for user ${matrixUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync Matrix permissions for user ${matrixUserId}: ${error.message}`,
        error.stack,
      );
      // Don't throw - permission sync failures shouldn't block redaction attempts
    }
  }
}
