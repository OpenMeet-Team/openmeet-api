import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChatRoomManagerInterface } from '../interfaces/chat-room-manager.interface';
import { ChatRoomEntity } from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { MatrixCoreService } from '../../matrix/services/matrix-core.service';
import { MatrixBotService } from '../../matrix/services/matrix-bot.service';
import { UserService } from '../../user/user.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { Trace } from '../../utils/trace.decorator';
import { GlobalMatrixValidationService } from '../../matrix/services/global-matrix-validation.service';
import { trace } from '@opentelemetry/api';
import {
  ChatRoomType,
  ChatRoomVisibility,
} from '../infrastructure/persistence/relational/entities/chat-room.entity';
import {
  EventAttendeePermission,
  EventAttendeeRole,
  GroupRole,
} from '../../core/constants/constant';

/**
 * Matrix-specific implementation of the ChatRoomManagerInterface.
 * This service is designed to be independent of REQUEST scope, making it suitable for
 * use in event handlers and background operations.
 */
@Injectable()
export class MatrixChatRoomManagerAdapter implements ChatRoomManagerInterface {
  private readonly logger = new Logger(MatrixChatRoomManagerAdapter.name);
  private readonly tracer = trace.getTracer('matrix-chat-room-manager');

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly matrixMessageService: MatrixMessageService,
    private readonly matrixCoreService: MatrixCoreService,
    private readonly matrixBotService: MatrixBotService,
    private readonly userService: UserService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
  ) {
    this.logger.log(
      'MatrixChatRoomManagerAdapter constructor: All dependencies injected successfully',
    );
  }

  /**
   * Helper method to get a group by slug using tenant database connection
   * Bypasses REQUEST-scoped GroupService to avoid context issues
   */
  private async getGroupBySlugWithTenant(
    groupSlug: string,
    tenantId: string,
  ): Promise<GroupEntity | null> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const groupRepository = dataSource.getRepository(GroupEntity);
    return await groupRepository.findOne({
      where: { slug: groupSlug },
    });
  }

  /**
   * Generates a standardized room name based on entity type and tenant
   */
  private generateRoomName(
    entityType: 'event' | 'group' | 'direct',
    entitySlug: string,
    tenantId: string,
  ): string {
    return `${entityType}-${entitySlug}-${tenantId}`;
  }

  /**
   * Generates Matrix user ID for a given user (MAS-compatible)
   */
  private async generateMatrixUserIdForUser(
    userId: number,
    tenantId: string,
  ): Promise<{ user: UserEntity; matrixUserId: string }> {
    this.logger.log(
      `generateMatrixUserIdForUser: Looking up user ${userId} in tenant ${tenantId}`,
    );

    const user = await this.userService.findById(userId, tenantId);

    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    this.logger.log(
      `generateMatrixUserIdForUser: Found user ${user.slug} (ID: ${user.id})`,
    );

    const serverName = process.env.MATRIX_SERVER_NAME;
    if (!serverName) {
      throw new Error('MATRIX_SERVER_NAME environment variable is required');
    }

    // Check if user has Matrix credentials via registry first
    let matrixUserId: string | null = null;

    if (this.globalMatrixValidationService) {
      try {
        this.logger.log(
          `generateMatrixUserIdForUser: Checking Matrix registry for user ${user.id}`,
        );
        const registryEntry =
          await this.globalMatrixValidationService.getMatrixHandleForUser(
            user.id,
            tenantId,
          );
        if (registryEntry && registryEntry.handle && registryEntry.handle !== 'undefined') {
          matrixUserId = `@${registryEntry.handle}:${serverName}`;
          this.logger.log(
            `generateMatrixUserIdForUser: Found Matrix user ID ${matrixUserId} for user ${user.id}`,
          );
        } else {
          this.logger.warn(
            `generateMatrixUserIdForUser: No valid registry entry found for user ${user.id} (entry: ${registryEntry ? `exists but handle is ${registryEntry.handle}` : 'does not exist'})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `generateMatrixUserIdForUser: Error checking Matrix registry for user ${user.id}: ${error.message}`,
          error.stack,
        );
      }
    }

    // If no Matrix user ID found, the user hasn't authenticated with Matrix yet
    if (!matrixUserId) {
      const errorMsg = `User ${user.slug} (ID: ${user.id}) has not authenticated with Matrix yet. User must complete Matrix authentication before accessing chat rooms.`;
      this.logger.error(`generateMatrixUserIdForUser: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    this.logger.log(
      `generateMatrixUserIdForUser: Successfully generated Matrix user ID ${matrixUserId} for user ${user.slug}`,
    );
    return { user, matrixUserId };
  }

  /**
   * Helper method to add a user to a Matrix room and return whether they joined
   */
  @Trace('matrix-chat-room-manager.addUserToMatrixRoom')
  private async addUserToMatrixRoom(
    matrixRoomId: string,
    user: UserEntity,
    matrixUserId: string,
    tenantId: string,
    options: {
      skipInvite?: boolean;
    } = {},
  ): Promise<boolean> {
    const { skipInvite = false } = options;

    // First check if user and matrixUserId are provided
    if (!user || !matrixUserId) {
      this.logger.warn(
        `User ${user?.id || 'unknown'} or Matrix user ID not provided, cannot join room`,
      );
      return false;
    }

    let isAlreadyJoined = false;

    // Step 1: Invite user to the room if needed using bot
    if (!skipInvite && matrixUserId) {
      try {
        // Ensure bot is authenticated before inviting user
        if (!this.matrixBotService.isBotAuthenticated()) {
          await this.matrixBotService.authenticateBot(tenantId);
        }

        // Ensure bot has admin rights in the room (fixes legacy rooms)
        try {
          await this.matrixBotService.ensureBotHasAdminRights(matrixRoomId, tenantId);
        } catch (adminError) {
          this.logger.warn(
            `Could not ensure bot admin rights in room ${matrixRoomId}: ${adminError.message}`,
          );
          // Continue anyway - try the invitation
        }

        await this.matrixBotService.inviteUser(
          matrixRoomId,
          matrixUserId,
          tenantId,
        );
        this.logger.debug(
          `Successfully invited user ${user.id} to room ${matrixRoomId}`,
        );
      } catch (inviteError) {
        // If the error is because they're already in the room, mark as already joined
        if (
          inviteError.message &&
          inviteError.message.includes('already in the room')
        ) {
          this.logger.log(
            `User ${user.id} is already in room ${matrixRoomId}, skipping invite`,
          );
          isAlreadyJoined = true;
        } else if (
          inviteError.message &&
          inviteError.message.includes('Unknown room')
        ) {
          // Room doesn't exist - this is a critical error that requires room recreation
          this.logger.error(
            `Room ${matrixRoomId} does not exist on Matrix server. Room recreation required.`,
          );
          throw new Error(
            `Room ${matrixRoomId} does not exist on Matrix server. The room needs to be recreated before users can be invited.`,
          );
        } else {
          this.logger.error(
            `Failed to invite user ${user.id} to room ${matrixRoomId}: ${inviteError.message}`,
          );
          // Re-throw the error since invitation is critical for room access
          throw new Error(`Matrix invitation failed: ${inviteError.message}`);
        }
      }
    }

    // Step 2: With MAS, users don't need to join manually - they authenticate via OIDC
    // The bot invitation is sufficient, users will access the room when they authenticate
    let isJoined = isAlreadyJoined;

    // For MAS, the invitation is sufficient - users authenticate via OIDC when accessing Matrix
    if (!isAlreadyJoined) {
      this.logger.debug(
        `User ${user.id} invited to room ${matrixRoomId}. With MAS, they will authenticate via OIDC when accessing Matrix.`,
      );
      isJoined = true; // Consider invitation successful
    }

    return isJoined;
  }

  /**
   * Helper method to handle moderator permissions for both event and group chat rooms
   */
  @Trace('matrix-chat-room-manager.handleModeratorPermissions')
  private async handleModeratorPermissions(
    entityId: number,
    userId: number,
    matrixUserId: string,
    matrixRoomId: string,
    entityType: 'event' | 'group',
    _tenantId: string,
  ): Promise<void> {
    try {
      let isModeratorRole = false;
      let hasManagePermission = false;
      let roleName = '';

      if (entityType === 'event') {
        // For events, check event attendee permissions
        const attendee =
          await this.eventAttendeeService.findEventAttendeeByUserId(
            entityId,
            userId,
          );

        if (attendee && attendee.role) {
          roleName = attendee.role.name;
          // Only assign moderator privileges to users with appropriate roles: host, moderator
          isModeratorRole =
            attendee.role.name === EventAttendeeRole.Host ||
            attendee.role.name === EventAttendeeRole.Moderator;

          hasManagePermission =
            attendee.role.permissions &&
            attendee.role.permissions.some(
              (p) => p.name === EventAttendeePermission.ManageEvent,
            );
        }
      } else if (entityType === 'group') {
        // For groups, check group member permissions
        const groupMember =
          await this.groupMemberService.findGroupMemberByUserId(
            entityId,
            userId,
          );

        if (groupMember && groupMember.groupRole) {
          roleName = groupMember.groupRole.name;
          // Only give moderator privileges to admins, owners, and moderators
          isModeratorRole =
            groupMember.groupRole.name === GroupRole.Admin ||
            groupMember.groupRole.name === GroupRole.Owner ||
            groupMember.groupRole.name === GroupRole.Moderator;

          // Since we can't directly check permissions, we'll rely on the role names
          hasManagePermission = isModeratorRole; // Simplification based on current code
        }
      }

      // Apply moderator permissions if needed
      if (isModeratorRole && hasManagePermission) {
        this.logger.log(
          `User ${userId} has ${entityType} role ${roleName} with management permissions, setting as moderator in room ${matrixRoomId}`,
        );

        // Set user as moderator in Matrix room using bot
        // Ensure bot is authenticated before setting permissions
        if (!this.matrixBotService.isBotAuthenticated()) {
          await this.matrixBotService.authenticateBot(_tenantId);
        }

        await this.matrixBotService.syncPermissions(
          matrixRoomId,
          { [matrixUserId]: 50 }, // 50 is moderator level
          _tenantId,
        );

        this.logger.log(
          `Successfully set ${matrixUserId} as moderator for ${entityType} room ${matrixRoomId}`,
        );
      } else if (roleName) {
        this.logger.log(
          `User ${userId} with ${entityType} role ${roleName} does not qualify for moderator privileges`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Error checking/setting moderator privileges for user ${userId} in ${entityType} ${entityId}: ${error.message}`,
      );
      // Continue anyway - basic join functionality is more important than moderator privileges
    }
  }

  /**
   * Helper method to add a user to a room in the database
   */
  @Trace('matrix-chat-room-manager.addUserToRoomInDatabase')
  private async addUserToRoomInDatabase(
    roomId: number,
    userId: number,
    tenantId: string,
  ): Promise<void> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    const roomWithMembers = await chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['members'],
    });

    if (!roomWithMembers) {
      this.logger.warn(
        `Could not find chat room with id ${roomId} to add user ${userId}`,
      );
      return;
    }

    // Get the user using UserService (tenant-aware through DI)
    const user = await this.userService.findById(userId, tenantId);

    if (!user) {
      this.logger.warn(
        `Could not find user with id ${userId} to add to room ${roomId}`,
      );
      return;
    }

    // Check if user is already a member
    const isAlreadyMember = roomWithMembers.members.some(
      (member) => member.id === userId,
    );

    if (!isAlreadyMember) {
      roomWithMembers.members.push(user);
      await chatRoomRepository.save(roomWithMembers);
      this.logger.debug(
        `Added user ${userId} to chat room ${roomId} in database`,
      );
    } else {
      this.logger.debug(
        `User ${userId} is already a member of chat room ${roomId} in database`,
      );
    }
  }

  /**
   * Internal helper to get a chat room for an event
   */
  @Trace('matrix-chat-room-manager.getChatRoomForEvent')
  private async getChatRoomForEvent(
    eventId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    const chatRoom = await chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (!chatRoom) {
      throw new Error(`Chat room for event with id ${eventId} not found`);
    }

    return chatRoom;
  }

  /**
   * Ensure a chat room exists for an event using slugs
   * @param eventSlug The event slug
   * @param creatorSlug The slug of the user creating the room
   * @param tenantId The tenant ID
   * @returns The chat room entity
   */
  @Trace('matrix-chat-room-manager.ensureEventChatRoom')
  async ensureEventChatRoom(
    eventSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity> {
    // Get the event by slug
    const event = await this.eventQueryService.showEventBySlug(eventSlug);
    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    // Get the creator user by slug
    const creator = await this.userService.getUserBySlug(creatorSlug);
    if (!creator) {
      throw new NotFoundException(
        `Creator user with slug ${creatorSlug} not found`,
      );
    }

    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
    const eventRepository = dataSource.getRepository(EventEntity);

    // Check if a chat room already exists for this event
    const existingRoom = await chatRoomRepository.findOne({
      where: { event: { id: event.id } },
    });

    if (existingRoom) {
      // Verify the Matrix room actually exists and recreate if needed
      const verifiedRoomId = await this.verifyAndEnsureMatrixRoom(
        existingRoom,
        'event',
        eventSlug,
        creatorSlug,
        tenantId,
      );

      if (verifiedRoomId) {
        // Update the existing room with the verified/recreated room ID
        existingRoom.matrixRoomId = verifiedRoomId;
        await chatRoomRepository.save(existingRoom);
        return existingRoom;
      } else {
        // If verification failed, fall through to create a new room
        this.logger.warn(
          `Matrix room verification failed for event ${eventSlug}, creating new room`,
        );
      }
    }

    // Ensure bot is authenticated before creating room
    if (!this.matrixBotService.isBotAuthenticated()) {
      await this.matrixBotService.authenticateBot(tenantId);
    }

    // Create a chat room in Matrix using bot
    const roomName = this.generateRoomName('event', eventSlug, tenantId);
    const roomInfo = await this.matrixBotService.createRoom(
      {
        name: roomName,
        topic: `Discussion for ${event.name}`,
        isPublic: event.visibility === 'public',
        isDirect: false,
        encrypted: false, // Disable encryption for event chat rooms
        // Add the event creator as the first member
        inviteUserIds: creator.matrixUserId ? [creator.matrixUserId] : [],
        // Set bot as admin and creator as moderator
        powerLevelContentOverride: (() => {
          const botUserId = this.matrixBotService.getBotUserId(tenantId);
          // The bot user ID is now the Application Service sender, so only set it once
          const powerLevels = {
            users: {
              // Application Service sender (authenticated bot) needs admin permissions
              [botUserId]: 100, // Admin level
              // Set creator as moderator if they have Matrix ID
              ...(creator.matrixUserId ? { [creator.matrixUserId]: 50 } : {}),
            },
          };
          this.logger.log(
            `Setting EVENT room power levels - Bot: ${botUserId}=100, Creator: ${creator.matrixUserId || 'none'}=${creator.matrixUserId ? 50 : 'none'}`,
          );
          return powerLevels;
        })(),
      },
      tenantId,
    );

    // Create a chat room entity
    const chatRoom = chatRoomRepository.create({
      name: roomName,
      topic: `Discussion for ${event.name}`,
      matrixRoomId: roomInfo.roomId,
      type: ChatRoomType.EVENT,
      visibility:
        event.visibility === 'public'
          ? ChatRoomVisibility.PUBLIC
          : ChatRoomVisibility.PRIVATE,
      creator: creator, // Explicit to avoid type errors
      event: event, // Explicit to avoid type errors
      settings: {
        historyVisibility: 'shared',
        guestAccess: false,
        requireInvitation: event.visibility !== 'public',
        encrypted: false,
      },
    });

    // Save the chat room
    await chatRoomRepository.save(chatRoom);

    // Update the event with Matrix room ID
    await eventRepository.update(
      { id: event.id },
      { matrixRoomId: roomInfo.roomId },
    );

    this.logger.log(
      `Created chat room for event ${eventSlug} in tenant ${tenantId}`,
    );
    return chatRoom;
  }

  /**
   * Add a user to an event chat room using slugs
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to add
   * @param tenantId The tenant ID
   */
  @Trace('matrix-chat-room-manager.addUserToEventChatRoom')
  async addUserToEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get event by slug
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Get user by slug
      const user = await this.userService.getUserBySlug(userSlug);
      if (!user) {
        throw new NotFoundException(`User with slug ${userSlug} not found`);
      }

      // First ensure the event has a chat room
      let chatRoom;
      try {
        // Get database connection for the tenant
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(tenantId);
        const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

        // Check if a chat room already exists for this event
        chatRoom = await chatRoomRepository.findOne({
          where: { event: { id: event.id } },
        });

        // If no chat room exists, create one
        if (!chatRoom) {
          // This will call our slug-based ensureEventChatRoom
          chatRoom = await this.ensureEventChatRoom(
            eventSlug,
            user.slug, // Use the current user as creator if no chat room exists
            tenantId,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error ensuring chat room for event ${eventSlug}: ${error.message}`,
        );
        throw error;
      }

      // Check if the user is already a member in the database
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      const roomWithMembers = await chatRoomRepository.findOne({
        where: { id: chatRoom.id },
        relations: ['members'],
      });

      // Check database membership but don't skip Matrix operations
      const isInDatabase =
        roomWithMembers &&
        roomWithMembers.members.some((member) => member.id === user.id);

      if (isInDatabase) {
        this.logger.debug(
          `User ${userSlug} is already a database member of room ${chatRoom.id}, but still ensuring Matrix membership`,
        );
      }

      // Generate Matrix user ID for bot invitation
      const { user: userEntity, matrixUserId } =
        await this.generateMatrixUserIdForUser(user.id, tenantId);

      // Always attempt Matrix room operations with room verification
      let currentRoomId = chatRoom.matrixRoomId;
      let isJoined = false;
      
      try {
        isJoined = await this.addUserToMatrixRoom(
          currentRoomId,
          userEntity,
          matrixUserId,
          tenantId,
        );
      } catch (error) {
        // If the room doesn't exist, try to recreate it
        if (error.message && error.message.includes('does not exist on Matrix server')) {
          this.logger.warn(
            `Room ${currentRoomId} doesn't exist, attempting to recreate for event ${eventSlug}`,
          );
          
          // Verify and recreate the room
          const verifiedRoomId = await this.verifyAndEnsureMatrixRoom(
            chatRoom,
            'event',
            eventSlug,
            user.slug,
            tenantId,
          );
          
          if (verifiedRoomId) {
            // Update the chat room record with the new room ID
            const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);
            const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
            chatRoom.matrixRoomId = verifiedRoomId;
            await chatRoomRepository.save(chatRoom);
            
            // Retry the invitation with the new room
            isJoined = await this.addUserToMatrixRoom(
              verifiedRoomId,
              userEntity,
              matrixUserId,
              tenantId,
            );
            currentRoomId = verifiedRoomId;
          } else {
            throw new Error(`Failed to recreate room for event ${eventSlug}`);
          }
        } else {
          throw error;
        }
      }

      // Set appropriate permissions based on role
      if (isJoined && matrixUserId) {
        await this.handleModeratorPermissions(
          event.id,
          user.id,
          matrixUserId,
          currentRoomId,
          'event',
          tenantId,
        );
      }

      // Update database relationship only if not already there
      if (!isInDatabase) {
        await this.addUserToRoomInDatabase(chatRoom.id, user.id, tenantId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userSlug} to event ${eventSlug} chat room: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Remove a user from an event chat room
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to remove
   * @param tenantId The tenant ID
   */
  @Trace('matrix-chat-room-manager.removeUserFromEventChatRoom')
  async removeUserFromEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get event by slug
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Get user by slug
      const user = await this.userService.getUserBySlug(userSlug);
      if (!user) {
        throw new NotFoundException(`User with slug ${userSlug} not found`);
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      // Get the chat room
      const chatRoom = await chatRoomRepository.findOne({
        where: { event: { id: event.id } },
        relations: ['members'],
      });

      if (!chatRoom) {
        throw new Error(`Chat room for event with slug ${eventSlug} not found`);
      }

      // Get Matrix user ID from registry (no fallback generation)
      const { matrixUserId } = await this.generateMatrixUserIdForUser(
        user.id,
        tenantId,
      );

      // Remove the user from the room using bot
      // Ensure bot is authenticated before removing user
      if (!this.matrixBotService.isBotAuthenticated()) {
        await this.matrixBotService.authenticateBot(tenantId);
      }

      await this.matrixBotService.removeUser(
        chatRoom.matrixRoomId,
        matrixUserId,
        tenantId,
      );

      // Remove the user from the chat room members
      chatRoom.members = chatRoom.members.filter(
        (member) => member.id !== user.id,
      );
      await chatRoomRepository.save(chatRoom);

      this.logger.log(
        `Removed user ${userSlug} from event ${eventSlug} chat room in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userSlug} from event ${eventSlug} chat room: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a user is a member of an event chat room
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user
   * @param tenantId The tenant ID
   * @returns boolean indicating if the user is a member
   */
  @Trace('matrix-chat-room-manager.isUserInEventChatRoom')
  async isUserInEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      // Get event by slug
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (!event) {
        this.logger.warn(`Event with slug ${eventSlug} not found`);
        return false;
      }

      // Get user by slug
      const user = await this.userService.getUserBySlug(userSlug);
      if (!user) {
        this.logger.warn(`User with slug ${userSlug} not found`);
        return false;
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      // Get the chat room with members
      const chatRoom = await chatRoomRepository.findOne({
        where: { event: { id: event.id } },
        relations: ['members'],
      });

      if (!chatRoom) {
        return false;
      }

      // Check if the user is a member
      return chatRoom.members.some((member) => member.id === user.id);
    } catch (error) {
      this.logger.error(
        `Error checking if user ${userSlug} is in event ${eventSlug} chat room: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get all chat rooms for an event
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   * @returns Array of chat room entities
   */
  @Trace('matrix-chat-room-manager.getEventChatRooms')
  async getEventChatRooms(
    eventSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity[]> {
    try {
      // Get event by slug
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      return chatRoomRepository.find({
        where: { event: { id: event.id } },
        relations: ['creator', 'event'],
      });
    } catch (error) {
      this.logger.error(
        `Error getting chat rooms for event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      // Return empty array instead of throwing to be more forgiving
      return [];
    }
  }

  /**
   * Delete all chat rooms for an event
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   */
  @Trace('matrix-chat-room-manager.deleteEventChatRooms')
  async deleteEventChatRooms(
    eventSlug: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get event by slug
      const event = await this.eventQueryService.showEventBySlug(eventSlug);
      if (!event) {
        this.logger.warn(
          `Event with slug ${eventSlug} not found, skipping chat room deletion`,
        );
        return;
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
      const eventRepository = dataSource.getRepository(EventEntity);

      // Find all chat rooms for this event
      const chatRooms = await chatRoomRepository.find({
        where: { event: { id: event.id } },
        relations: ['members'],
      });

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for event ${eventSlug}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for event ${eventSlug}`,
      );

      // Process each chat room
      for (const room of chatRooms) {
        try {
          // First, attempt to delete the Matrix room
          if (room.matrixRoomId) {
            try {
              // Use the Matrix bot service's room deletion method
              // Ensure bot is authenticated before deleting room
              if (!this.matrixBotService.isBotAuthenticated()) {
                await this.matrixBotService.authenticateBot(tenantId);
              }

              await this.matrixBotService.deleteRoom(
                room.matrixRoomId,
                tenantId,
              );
              this.logger.log(
                `Successfully deleted Matrix room ${room.matrixRoomId} using bot service`,
              );
            } catch (matrixError) {
              this.logger.error(
                `Error deleting Matrix room ${room.matrixRoomId}: ${matrixError.message}`,
                matrixError.stack,
              );
              // Continue with database cleanup even if Matrix room deletion fails
            }
          }

          // Then remove the members association
          if (room.members && room.members.length > 0) {
            room.members = [];
            await chatRoomRepository.save(room);
          }

          // Then delete the chat room entity
          await chatRoomRepository.delete(room.id);
          this.logger.log(`Successfully deleted chat room with id ${room.id}`);
        } catch (error) {
          this.logger.error(
            `Error deleting chat room with id ${room.id}: ${error.message}`,
            error.stack,
          );
          // Continue with other rooms
        }
      }

      // Update the event to clear the matrixRoomId reference
      if (event.matrixRoomId) {
        await eventRepository.update({ id: event.id }, { matrixRoomId: '' });
      }

      this.logger.log(
        `Successfully deleted all chat rooms for event ${eventSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  // NOTE: Message sending and retrieval methods removed in Matrix architecture refactor
  // Frontend Matrix clients now handle all user-facing messaging operations directly

  /**
   * Enhance messages with user display names
   */
  @Trace('matrix-chat-room-manager.enhanceMessagesWithUserInfo')
  private async enhanceMessagesWithUserInfo(
    messages: any[],
    tenantId: string,
  ): Promise<any[]> {
    return Promise.all(
      messages.map(async (message) => {
        try {
          // Get user info from our database based on Matrix ID
          const userMatrixId = message.sender;

          // Find the OpenMeet user with this Matrix ID
          const userWithMatrixId = await this.userService.findByMatrixUserId(
            userMatrixId,
            tenantId,
          );

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
   * Get chat room members
   */
  @Trace('matrix-chat-room-manager.getChatRoomMembers')
  async getChatRoomMembers(
    roomId: number,
    tenantId: string,
  ): Promise<UserEntity[]> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    // Get the chat room with members
    const chatRoom = await chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    return chatRoom.members;
  }

  /**
   * Check if an event exists
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   * @returns Boolean indicating if the event exists
   */
  @Trace('matrix-chat-room-manager.checkEventExists')
  async checkEventExists(
    eventSlug: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      // Make sure we're using a method that's tenant-aware
      const event = await this.eventQueryService.showEventBySlugWithTenant(
        eventSlug,
        tenantId,
      );
      return !!event;
    } catch (error) {
      this.logger.error(
        `Error checking if event ${eventSlug} exists: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  //
  // Group-related methods implementations
  //

  /**
   * Internal helper to get a chat room for a group
   */
  @Trace('matrix-chat-room-manager.getChatRoomForGroup')
  private async getChatRoomForGroup(
    groupId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    const chatRoom = await chatRoomRepository.findOne({
      where: { group: { id: groupId } },
    });

    if (!chatRoom) {
      throw new Error(`Chat room for group with id ${groupId} not found`);
    }

    return chatRoom;
  }

  /**
   * Ensure a chat room exists for a group
   * @param groupSlug The slug of the group
   * @param creatorSlug The slug of the user creating the room
   * @param tenantId The tenant ID
   * @returns The chat room entity
   */
  @Trace('matrix-chat-room-manager.ensureGroupChatRoom')
  async ensureGroupChatRoom(
    groupSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity> {
    try {
      // Get the group by slug using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        throw new NotFoundException(`Group with slug ${groupSlug} not found`);
      }

      // Get the creator user by slug
      const creator = await this.userService.getUserBySlugWithTenant(
        creatorSlug,
        tenantId,
      );
      if (!creator) {
        throw new NotFoundException(
          `Creator user with slug ${creatorSlug} not found in tenant ${tenantId}`,
        );
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
      const groupRepository = dataSource.getRepository(GroupEntity);

      // Check if a chat room already exists for this group
      const existingRoom = await chatRoomRepository.findOne({
        where: { group: { id: group.id } },
      });

      if (existingRoom) {
        // Verify the Matrix room actually exists and recreate if needed
        const verifiedRoomId = await this.verifyAndEnsureMatrixRoom(
          existingRoom,
          'group',
          groupSlug,
          creatorSlug,
          tenantId,
        );

        if (verifiedRoomId) {
          // Update the existing room with the verified/recreated room ID
          existingRoom.matrixRoomId = verifiedRoomId;
          await chatRoomRepository.save(existingRoom);
          return existingRoom;
        } else {
          // If verification failed, fall through to create a new room
          this.logger.warn(
            `Matrix room verification failed for group ${groupSlug}, creating new room`,
          );
        }
      }

      // Ensure bot is authenticated before creating room
      if (!this.matrixBotService.isBotAuthenticated()) {
        await this.matrixBotService.authenticateBot(tenantId);
      }

      // Create a chat room in Matrix using bot
      const roomName = this.generateRoomName('group', groupSlug, tenantId);
      const roomInfo = await this.matrixBotService.createRoom(
        {
          name: roomName,
          topic: `Discussion for ${group.name}`,
          isPublic: group.visibility === 'public',
          isDirect: false,
          encrypted: false, // Disable encryption for group chat rooms
          // Add the group creator as the first member
          inviteUserIds: creator.matrixUserId ? [creator.matrixUserId] : [],
          // Set bot as admin and creator as moderator
          powerLevelContentOverride: (() => {
            const botUserId = this.matrixBotService.getBotUserId(tenantId);
            const serverName =
              process.env.MATRIX_SERVER_NAME || 'matrix.openmeet.net';
            const appServiceSender = `@openmeet-bot:${serverName}`;

            const powerLevels = {
              users: {
                // AppService sender bot needs admin permissions (required by Matrix)
                [appServiceSender]: 100,
                // Tenant bot needs admin permissions to manage room (kick, ban, etc.)
                [botUserId]: 100, // Admin level
                // Set creator as moderator if they have Matrix ID
                ...(creator.matrixUserId ? { [creator.matrixUserId]: 50 } : {}),
              },
            };
            this.logger.log(
              `Setting GROUP room power levels - AppService: ${appServiceSender}=100, Bot: ${botUserId}=100, Creator: ${creator.matrixUserId || 'none'}=${creator.matrixUserId ? 50 : 'none'}`,
            );
            return powerLevels;
          })(),
        },
        tenantId,
      );

      // Create a chat room entity
      const chatRoom = chatRoomRepository.create({
        name: roomName,
        topic: `Discussion for ${group.name}`,
        matrixRoomId: roomInfo.roomId,
        type: ChatRoomType.GROUP,
        visibility:
          group.visibility === 'public'
            ? ChatRoomVisibility.PUBLIC
            : ChatRoomVisibility.PRIVATE,
        creator: creator,
        group: group,
        settings: {
          historyVisibility: 'shared',
          guestAccess: false,
          requireInvitation: group.visibility !== 'public',
          encrypted: false,
        },
      });

      // Save the chat room
      await chatRoomRepository.save(chatRoom);

      // Update the group with Matrix room ID
      await groupRepository.update(
        { id: group.id },
        { matrixRoomId: roomInfo.roomId },
      );

      this.logger.log(
        `Created chat room for group ${groupSlug} in tenant ${tenantId}`,
      );
      return chatRoom;
    } catch (error) {
      this.logger.error(
        `Error ensuring chat room for group ${groupSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Add a user to a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user to add
   * @param tenantId The tenant ID
   * @returns void
   */
  @Trace('matrix-chat-room-manager.addUserToGroupChatRoom')
  async addUserToGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get group by slug using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        throw new NotFoundException(`Group with slug ${groupSlug} not found`);
      }

      // Get user by slug with tenant context
      const user = await this.userService.getUserBySlugWithTenant(
        userSlug,
        tenantId,
      );
      if (!user) {
        throw new NotFoundException(
          `User with slug ${userSlug} not found in tenant ${tenantId}`,
        );
      }

      // First ensure the group has a chat room
      let chatRoom;
      try {
        // Get database connection for the tenant
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(tenantId);
        const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

        // Check if a chat room already exists for this group
        chatRoom = await chatRoomRepository.findOne({
          where: { group: { id: group.id } },
        });

        // If no chat room exists, create one
        if (!chatRoom) {
          // This will call our slug-based ensureGroupChatRoom
          chatRoom = await this.ensureGroupChatRoom(
            groupSlug,
            user.slug, // Use the current user as creator if no chat room exists
            tenantId,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error ensuring chat room for group ${groupSlug}: ${error.message}`,
        );
        throw error;
      }

      // Check if the user is already a member in the database
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      const roomWithMembers = await chatRoomRepository.findOne({
        where: { id: chatRoom.id },
        relations: ['members'],
      });

      // Check database membership but don't skip Matrix operations
      const isInDatabase =
        roomWithMembers &&
        roomWithMembers.members.some((member) => member.id === user.id);

      if (isInDatabase) {
        this.logger.debug(
          `User ${userSlug} is already a database member of room ${chatRoom.id}, but still ensuring Matrix membership`,
        );
      }

      // Generate Matrix user ID for bot invitation
      const { user: userEntity, matrixUserId } =
        await this.generateMatrixUserIdForUser(user.id, tenantId);

      // Always attempt Matrix room operations with room verification
      let currentRoomId = chatRoom.matrixRoomId;
      let isJoined = false;
      
      try {
        isJoined = await this.addUserToMatrixRoom(
          currentRoomId,
          userEntity,
          matrixUserId,
          tenantId,
        );
      } catch (error) {
        // If the room doesn't exist, try to recreate it
        if (error.message && error.message.includes('does not exist on Matrix server')) {
          this.logger.warn(
            `Room ${currentRoomId} doesn't exist, attempting to recreate for group ${groupSlug}`,
          );
          
          // Verify and recreate the room
          const verifiedRoomId = await this.verifyAndEnsureMatrixRoom(
            chatRoom,
            'group',
            groupSlug,
            user.slug,
            tenantId,
          );
          
          if (verifiedRoomId) {
            // Update the chat room record with the new room ID
            const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);
            const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
            chatRoom.matrixRoomId = verifiedRoomId;
            await chatRoomRepository.save(chatRoom);
            
            // Retry the invitation with the new room
            isJoined = await this.addUserToMatrixRoom(
              verifiedRoomId,
              userEntity,
              matrixUserId,
              tenantId,
            );
            currentRoomId = verifiedRoomId;
          } else {
            throw new Error(`Failed to recreate room for group ${groupSlug}`);
          }
        } else {
          throw error;
        }
      }

      // Set appropriate permissions based on role
      if (isJoined && matrixUserId) {
        await this.handleModeratorPermissions(
          group.id,
          user.id,
          matrixUserId,
          currentRoomId,
          'group',
          tenantId,
        );
      }

      // Update database relationship only if not already there
      if (!isInDatabase) {
        await this.addUserToRoomInDatabase(chatRoom.id, user.id, tenantId);
      }

      this.logger.log(
        `Added user ${userSlug} to group ${groupSlug} chat room in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userSlug} to group ${groupSlug} chat room: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Remove a user from a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user to remove
   * @param tenantId The tenant ID
   * @returns void
   */
  @Trace('matrix-chat-room-manager.removeUserFromGroupChatRoom')
  async removeUserFromGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void> {
    this.logger.log(
      `removeUserFromGroupChatRoom: START - Removing user ${userSlug} from group ${groupSlug} in tenant ${tenantId}`,
    );

    try {
      // Get group by slug using tenant database connection directly
      // (bypassing REQUEST-scoped GroupService to avoid context issues)
      this.logger.log(
        `removeUserFromGroupChatRoom: Getting group by slug ${groupSlug}`,
      );
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        throw new NotFoundException(`Group with slug ${groupSlug} not found`);
      }

      // Get user by slug with tenant context
      const user = await this.userService.getUserBySlugWithTenant(
        userSlug,
        tenantId,
      );
      if (!user) {
        throw new NotFoundException(
          `User with slug ${userSlug} not found in tenant ${tenantId}`,
        );
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      // Get the chat room
      const chatRoom = await chatRoomRepository.findOne({
        where: { group: { id: group.id } },
        relations: ['members'],
      });

      if (!chatRoom) {
        throw new Error(`Chat room for group with slug ${groupSlug} not found`);
      }

      // Get Matrix user ID from registry (no fallback generation)
      // If user doesn't have Matrix ID, they're not in the Matrix room anyway
      let matrixUserId: string;
      try {
        const result = await this.generateMatrixUserIdForUser(user.id, tenantId);
        matrixUserId = result.matrixUserId;
      } catch (error) {
        this.logger.warn(
          `User ${userSlug} doesn't have Matrix user ID, skipping Matrix room removal: ${error.message}`,
        );
        // User isn't in Matrix room, so we can just remove them from the database
        // and consider the removal successful
        
        // Remove the user from the chat room members
        chatRoom.members = chatRoom.members.filter(
          (member) => member.id !== user.id,
        );
        await chatRoomRepository.save(chatRoom);
        
        this.logger.log(
          `Removed user ${userSlug} from group ${groupSlug} chat room (database only, no Matrix removal needed)`,
        );
        return;
      }

      // Remove the user from the room using bot
      // Ensure bot is authenticated before removing user
      if (!this.matrixBotService.isBotAuthenticated()) {
        await this.matrixBotService.authenticateBot(tenantId);
      }

      this.logger.log(
        `About to call matrixBotService.removeUser for room ${chatRoom.matrixRoomId}, user ${matrixUserId}`,
      );
      this.logger.log(
        `Bot user ID during removal: ${this.matrixBotService.getBotUserId(tenantId)}`,
      );

      try {
        await this.matrixBotService.removeUser(
          chatRoom.matrixRoomId,
          matrixUserId,
          tenantId,
        );
        this.logger.log(
          `Successfully called matrixBotService.removeUser for room ${chatRoom.matrixRoomId}, user ${matrixUserId}`,
        );
      } catch (botError) {
        this.logger.error(
          `Matrix bot removeUser failed: ${botError.message}`,
          botError.stack,
        );
        throw botError;
      }

      // Remove the user from the chat room members
      chatRoom.members = chatRoom.members.filter(
        (member) => member.id !== user.id,
      );
      await chatRoomRepository.save(chatRoom);

      this.logger.log(
        `Removed user ${userSlug} from group ${groupSlug} chat room in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userSlug} from group ${groupSlug} chat room: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a user is a member of a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user
   * @param tenantId The tenant ID
   * @returns boolean indicating if the user is a member
   */
  @Trace('matrix-chat-room-manager.isUserInGroupChatRoom')
  async isUserInGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      // Get group by slug using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        this.logger.warn(`Group with slug ${groupSlug} not found`);
        return false;
      }

      // Get user by slug with tenant context
      const user = await this.userService.getUserBySlugWithTenant(
        userSlug,
        tenantId,
      );
      if (!user) {
        this.logger.warn(
          `User with slug ${userSlug} not found in tenant ${tenantId}`,
        );
        return false;
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      // Get the chat room with members
      const chatRoom = await chatRoomRepository.findOne({
        where: { group: { id: group.id } },
        relations: ['members'],
      });

      if (!chatRoom) {
        return false;
      }

      // Check if the user is a member
      return chatRoom.members.some((member) => member.id === user.id);
    } catch (error) {
      this.logger.error(
        `Error checking if user ${userSlug} is in group ${groupSlug} chat room: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Get chat rooms for a group
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   * @returns Array of chat room entities
   */
  @Trace('matrix-chat-room-manager.getGroupChatRooms')
  async getGroupChatRooms(
    groupSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity[]> {
    try {
      // Get group by slug using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        throw new NotFoundException(`Group with slug ${groupSlug} not found`);
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      return chatRoomRepository.find({
        where: { group: { id: group.id } },
        relations: ['creator', 'group'],
      });
    } catch (error) {
      this.logger.error(
        `Error getting chat rooms for group ${groupSlug}: ${error.message}`,
        error.stack,
      );
      // Return empty array instead of throwing to be more forgiving
      return [];
    }
  }

  /**
   * Delete all chat rooms for a group
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   */
  @Trace('matrix-chat-room-manager.deleteGroupChatRooms')
  async deleteGroupChatRooms(
    groupSlug: string,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get group by slug using tenant connection
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      if (!group) {
        this.logger.warn(
          `Group with slug ${groupSlug} not found, skipping chat room deletion`,
        );
        return;
      }

      // Get database connection for the tenant
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
      const groupRepository = dataSource.getRepository(GroupEntity);

      // Find all chat rooms for this group
      const chatRooms = await chatRoomRepository.find({
        where: { group: { id: group.id } },
        relations: ['members'],
      });

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(
          `No chat rooms found for group ${groupSlug} in tenant ${tenantId}`,
        );
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for group ${groupSlug} in tenant ${tenantId}`,
      );

      // Process each chat room
      for (const room of chatRooms) {
        try {
          // First, attempt to delete the Matrix room
          if (room.matrixRoomId) {
            try {
              // Use the Matrix bot service's room deletion method
              // Ensure bot is authenticated before deleting room
              if (!this.matrixBotService.isBotAuthenticated()) {
                await this.matrixBotService.authenticateBot(tenantId);
              }

              await this.matrixBotService.deleteRoom(
                room.matrixRoomId,
                tenantId,
              );
              this.logger.log(
                `Successfully deleted Matrix room ${room.matrixRoomId} using bot service`,
              );
            } catch (matrixError) {
              this.logger.error(
                `Error deleting Matrix room ${room.matrixRoomId}: ${matrixError.message}`,
                matrixError.stack,
              );
              // Continue with database cleanup even if Matrix room deletion fails
            }
          }

          // Then remove the members association
          if (room.members && room.members.length > 0) {
            room.members = [];
            await chatRoomRepository.save(room);
          }

          // Then delete the chat room entity
          await chatRoomRepository.delete(room.id);
          this.logger.log(`Successfully deleted chat room with id ${room.id}`);
        } catch (error) {
          this.logger.error(
            `Error deleting chat room with id ${room.id}: ${error.message}`,
            error.stack,
          );
          // Continue with other rooms
        }
      }

      // Update the group to clear the matrixRoomId reference
      if (group.matrixRoomId) {
        await groupRepository.update({ id: group.id }, { matrixRoomId: '' });
      }

      this.logger.log(
        `Successfully deleted all chat rooms for group ${groupSlug} in tenant ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for group ${groupSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if a group exists
   * @param groupSlug The slug of the group
   * @param _tenantId The tenant ID
   * @returns Boolean indicating if the group exists
   */
  @Trace('matrix-chat-room-manager.checkGroupExists')
  async checkGroupExists(
    groupSlug: string,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const group = await this.getGroupBySlugWithTenant(groupSlug, tenantId);
      return !!group;
    } catch (error) {
      this.logger.error(
        `Error checking if group ${groupSlug} exists: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Verify that a Matrix room exists and handle graceful recreation if needed
   * @param chatRoom The chat room entity to verify
   * @param entityType The type of entity ('event' or 'group')
   * @param entitySlug The slug of the entity
   * @param creatorSlug The slug of the user to use for recreation (if needed)
   * @param tenantId The tenant ID
   * @returns The verified or recreated room ID, or null if verification failed
   */
  @Trace('matrix-chat-room-manager.verifyAndEnsureMatrixRoom')
  async verifyAndEnsureMatrixRoom(
    chatRoom: ChatRoomEntity,
    entityType: 'event' | 'group',
    entitySlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<string | null> {
    try {
      const matrixRoomId = chatRoom.matrixRoomId;

      if (!matrixRoomId) {
        this.logger.warn(
          `No Matrix room ID found for ${entityType} ${entitySlug}, recreation needed`,
        );
        return await this.recreateRoomAndUpdateEntity(
          chatRoom,
          entityType,
          entitySlug,
          creatorSlug,
          tenantId,
        );
      }

      // Verify the Matrix room actually exists
      // Ensure bot is authenticated before verifying room
      if (!this.matrixBotService.isBotAuthenticated()) {
        await this.matrixBotService.authenticateBot(tenantId);
      }
      const roomExists = await this.matrixBotService.verifyRoomExists(
        matrixRoomId,
        tenantId,
      );

      if (roomExists) {
        this.logger.debug(
          `Matrix room ${matrixRoomId} verified for ${entityType} ${entitySlug}`,
        );
        return matrixRoomId;
      }

      this.logger.warn(
        `Matrix room ${matrixRoomId} does not exist for ${entityType} ${entitySlug}, recreation needed`,
      );

      return await this.recreateRoomAndUpdateEntity(
        chatRoom,
        entityType,
        entitySlug,
        creatorSlug,
        tenantId,
      );
    } catch (error) {
      this.logger.error(
        `Error verifying Matrix room for ${entityType} ${entitySlug}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Recreate a Matrix room and update the entity with the new room ID
   */
  private async recreateRoomAndUpdateEntity(
    chatRoom: ChatRoomEntity,
    entityType: 'event' | 'group',
    entitySlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<string | null> {
    try {
      this.logger.log(`Recreating Matrix room for ${entityType} ${entitySlug}`);

      // Get database connection
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);

      // Clear the old Matrix room ID from the entity first
      if (entityType === 'event') {
        const eventRepository = dataSource.getRepository('EventEntity');
        const event = await this.eventQueryService.showEventBySlug(entitySlug);
        if (event) {
          await eventRepository.update({ id: event.id }, { matrixRoomId: '' });
          this.logger.debug(`Cleared Matrix room ID for event ${entitySlug}`);
        }
      } else if (entityType === 'group') {
        const groupRepository = dataSource.getRepository(GroupEntity);
        const group = await groupRepository.findOne({ where: { slug: entitySlug } });
        if (group) {
          await groupRepository.update({ id: group.id }, { matrixRoomId: '' });
          this.logger.debug(`Cleared Matrix room ID for group ${entitySlug}`);
        }
      }

      // Delete the old chat room record to force recreation
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
      await chatRoomRepository.delete({ id: chatRoom.id });
      this.logger.debug(
        `Deleted old chat room record for ${entityType} ${entitySlug}`,
      );

      // Recreate the chat room using the existing ensure methods
      let newChatRoom: ChatRoomEntity;
      if (entityType === 'event') {
        newChatRoom = await this.ensureEventChatRoom(
          entitySlug,
          creatorSlug,
          tenantId,
        );
      } else {
        newChatRoom = await this.ensureGroupChatRoom(
          entitySlug,
          creatorSlug,
          tenantId,
        );
      }

      this.logger.log(
        `Successfully recreated Matrix room for ${entityType} ${entitySlug}: ${newChatRoom.matrixRoomId}`,
      );

      return newChatRoom.matrixRoomId;
    } catch (error) {
      this.logger.error(
        `Failed to recreate Matrix room for ${entityType} ${entitySlug}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
}
