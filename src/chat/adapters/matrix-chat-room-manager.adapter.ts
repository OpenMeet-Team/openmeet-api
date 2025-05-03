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
import { UserService } from '../../user/user.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';
import { Trace } from '../../utils/trace.decorator';
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
    private readonly userService: UserService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventQueryService: EventQueryService,
    private readonly groupService: GroupService,
  ) {}

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
   * Ensures a user has Matrix credentials, provisioning them if needed
   */
  private async ensureUserHasMatrixCredentials(
    userId: number,
    tenantId: string,
  ): Promise<UserEntity> {
    // Get the user
    let user = await this.userService.findById(userId, tenantId);

    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    // If user doesn't have Matrix credentials, try to provision them
    if (!user.matrixUserId || !user.matrixAccessToken || !user.matrixDeviceId) {
      this.logger.log(
        `User ${userId} is missing Matrix credentials, attempting to provision...`,
      );
      try {
        // Use the centralized provisioning method
        const matrixUserInfo = await this.matrixUserService.provisionMatrixUser(
          user,
          tenantId,
        );

        // Update user with Matrix credentials
        await this.userService.update(userId, {
          matrixUserId: matrixUserInfo.userId,
          matrixAccessToken: matrixUserInfo.accessToken,
          matrixDeviceId: matrixUserInfo.deviceId,
        });

        // Get the updated user record
        user = await this.userService.findById(userId, tenantId);
        if (!user) {
          throw new Error(
            `User with id ${userId} not found after provisioning`,
          );
        }

        this.logger.log(
          `Successfully provisioned Matrix user for ${userId}: ${user.matrixUserId}`,
        );
      } catch (provisionError) {
        this.logger.error(
          `Failed to provision Matrix user for ${userId}: ${provisionError.message}`,
        );
        throw new Error(
          `Matrix credentials could not be provisioned. Please try again.`,
        );
      }
    }

    // Check again after provisioning attempt
    if (!user.matrixUserId || !user.matrixAccessToken) {
      throw new Error(
        `User with id ${userId} could not be provisioned with Matrix credentials.`,
      );
    }

    // Get a client for this user
    try {
      // Add non-null assertions since we've checked these values above
      await this.matrixUserService.getClientForUser(
        user.slug,
        this.userService,
      );
    } catch (startError) {
      this.logger.error(
        `Failed to get Matrix client for user ${userId}: ${startError.message}`,
      );
      throw new Error(
        `Could not connect to Matrix chat service. Please try again later.`,
      );
    }

    return user;
  }

  /**
   * Helper method to add a user to a Matrix room and return whether they joined
   */
  @Trace('matrix-chat-room-manager.addUserToMatrixRoom')
  private async addUserToMatrixRoom(
    matrixRoomId: string,
    user: UserEntity,
    options: {
      skipInvite?: boolean;
      forceInvite?: boolean;
    } = {},
  ): Promise<boolean> {
    const { skipInvite = false, forceInvite = false } = options;

    // First check if user has necessary credentials
    if (!user || !user.matrixUserId) {
      this.logger.warn(
        `User ${user?.id || 'unknown'} does not have a Matrix user ID, cannot join room`,
      );
      return false;
    }

    let isAlreadyJoined = false;

    // Step 1: Invite user to the room if needed
    if (!skipInvite && user.matrixUserId) {
      try {
        await this.matrixRoomService.inviteUser(
          matrixRoomId,
          user.matrixUserId,
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
        } else {
          this.logger.warn(
            `Error inviting user ${user.id} to room: ${inviteError.message}`,
          );
          // Continue anyway - they may still be able to join
        }
      }
    }

    // Step 2: Have the user join the room if they have credentials and either need to join or we're forcing a join
    let isJoined = isAlreadyJoined;
    if (
      (user.matrixAccessToken && user.matrixUserId && !isAlreadyJoined) ||
      forceInvite
    ) {
      try {
        await this.matrixRoomService.joinRoom(
          matrixRoomId,
          user.matrixUserId,
          user.matrixAccessToken!, // Add non-null assertion since we've already checked that it exists
          user.matrixDeviceId,
        );
        isJoined = true;
        this.logger.log(`User ${user.id} joined room ${matrixRoomId}`);
      } catch (joinError) {
        // If join fails with "already in room", that's actually success
        if (
          joinError.message &&
          (joinError.message.includes('already in the room') ||
            joinError.message.includes('already a member') ||
            joinError.message.includes('already joined'))
        ) {
          isJoined = true;
          this.logger.debug(
            `User ${user.id} is already a member of room ${matrixRoomId}`,
          );
        } else {
          this.logger.warn(
            `User ${user.id} failed to join room: ${joinError.message}`,
          );
          // Continue anyway - they can join later
        }
      }
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

        // Set user as moderator in Matrix room
        await this.matrixRoomService.setRoomPowerLevels(
          matrixRoomId,
          { [matrixUserId]: 50 }, // 50 is moderator level
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
      return existingRoom;
    }

    // Create a chat room in Matrix
    const roomName = this.generateRoomName('event', eventSlug, tenantId);
    const roomInfo = await this.matrixRoomService.createRoom({
      name: roomName,
      topic: `Discussion for ${event.name}`,
      isPublic: event.visibility === 'public',
      isDirect: false,
      encrypted: false, // Disable encryption for event chat rooms
      // Add the event creator as the first member
      inviteUserIds: creator.matrixUserId ? [creator.matrixUserId] : [],
      // Set creator as moderator - MatrixRoomService will handle admin user
      powerLevelContentOverride: creator.matrixUserId
        ? {
            users: {
              [creator.matrixUserId]: 50, // Moderator level
            },
          }
        : undefined,
    });

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

      // Always ensure user has Matrix credentials and joins the room
      const userWithCredentials = await this.ensureUserHasMatrixCredentials(
        user.id,
        tenantId,
      );

      // Always attempt Matrix room operations
      const isJoined = await this.addUserToMatrixRoom(
        chatRoom.matrixRoomId,
        userWithCredentials,
      );

      // Set appropriate permissions based on role
      if (isJoined && userWithCredentials.matrixUserId) {
        await this.handleModeratorPermissions(
          event.id,
          user.id,
          userWithCredentials.matrixUserId,
          chatRoom.matrixRoomId,
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

      if (!user.matrixUserId) {
        throw new Error(
          `User with slug ${userSlug} does not have a Matrix user ID`,
        );
      }

      // Remove the user from the room
      await this.matrixRoomService.removeUserFromRoom(
        chatRoom.matrixRoomId,
        user.matrixUserId,
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
              // Use the Matrix room service's dedicated room deletion method
              const deleted = await this.matrixRoomService.deleteRoom(
                room.matrixRoomId,
              );

              if (deleted) {
                this.logger.log(
                  `Successfully deleted Matrix room ${room.matrixRoomId} using the Matrix admin API`,
                );
              } else {
                this.logger.warn(
                  `Failed to delete Matrix room ${room.matrixRoomId}, continuing with database cleanup`,
                );
              }
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

  /**
   * Send a message to a chat room
   */
  @Trace('matrix-chat-room-manager.sendMessage')
  async sendMessage(
    roomId: number,
    userId: number,
    message: string,
    tenantId: string,
  ): Promise<string> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    // Get the chat room
    const chatRoom = await chatRoomRepository.findOne({
      where: { id: roomId },
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    // Ensure user has Matrix credentials (will provision them if needed)
    const user = await this.ensureUserHasMatrixCredentials(userId, tenantId);

    // Make sure user is in the room
    try {
      // Check if user is already a member of the room in the database
      const roomWithMembers = await chatRoomRepository.findOne({
        where: { id: chatRoom.id },
        relations: ['members'],
      });

      const isMember = roomWithMembers?.members?.some(
        (member) => member.id === userId,
      );

      // If not a member, invite and join the room
      if (!isMember) {
        this.logger.log(
          `User ${userId} not yet a member of room ${chatRoom.id}, adding them now`,
        );

        // First, invite the user via admin
        await this.matrixRoomService.inviteUser(
          chatRoom.matrixRoomId,
          user.matrixUserId!, // Non-null assertion
        );

        // Then have the user join the room
        await this.matrixRoomService.joinRoom(
          chatRoom.matrixRoomId,
          user.matrixUserId!, // Non-null assertion
          user.matrixAccessToken!, // Non-null assertion
          user.matrixDeviceId,
        );

        // Add user to the room's members in the database
        if (roomWithMembers) {
          roomWithMembers.members.push(user);
          await chatRoomRepository.save(roomWithMembers);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error ensuring user ${userId} is in room ${chatRoom.id}: ${error.message}`,
      );
      // Continue anyway - the message send will confirm if they're really in the room
    }

    // Create a proper display name using the centralized method
    const displayName = MatrixUserService.generateDisplayName(user);

    // Set the display name if needed
    try {
      this.logger.log(
        `Setting Matrix display name for user ${userId} to "${displayName}"`,
      );

      await this.matrixUserService.setUserDisplayName(
        user.matrixUserId!, // Non-null assertion
        user.matrixAccessToken!, // Non-null assertion
        displayName,
        user.matrixDeviceId,
      );
    } catch (err) {
      this.logger.warn(`Failed to set user display name: ${err.message}`);
      // Continue anyway - display name is not critical
    }

    // We've already verified matrixUserId and matrixAccessToken exist in ensureUserHasMatrixCredentials
    // but TypeScript still needs non-null assertions since it doesn't track that logic
    return this.matrixMessageService.sendMessage({
      roomId: chatRoom.matrixRoomId,
      content: message,
      userId: user.matrixUserId!,
      accessToken: user.matrixAccessToken!,
      deviceId: user.matrixDeviceId,
      // Legacy/alternate field support
      body: message,
      senderUserId: user.matrixUserId,
      senderAccessToken: user.matrixAccessToken,
      senderDeviceId: user.matrixDeviceId,
    });
  }

  /**
   * Get messages from a chat room
   */
  @Trace('matrix-chat-room-manager.getMessages')
  async getMessages(
    roomId: number,
    userId: number,
    limit: number,
    from: string | undefined,
    tenantId: string,
  ): Promise<{
    messages: any[];
    end: string;
  }> {
    // Get database connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    // Get the chat room
    const chatRoom = await chatRoomRepository.findOne({
      where: { id: roomId },
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    // Ensure user has Matrix credentials (will provision them if needed)
    const user = await this.ensureUserHasMatrixCredentials(userId, tenantId);

    // We need non-null assertion for TypeScript, even though we've already verified it exists
    const messageData = await this.matrixMessageService.getRoomMessages(
      chatRoom.matrixRoomId,
      limit,
      from,
      user.matrixUserId!,
    );

    // Get all the messages
    const messages = messageData.messages;

    // Enhance messages with user display names
    const enhancedMessages = await this.enhanceMessagesWithUserInfo(
      messages,
      tenantId,
    );

    return {
      messages: enhancedMessages,
      end: messageData.end,
    };
  }

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
      // Get the group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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
        return existingRoom;
      }

      // Create a chat room in Matrix
      const roomName = this.generateRoomName('group', groupSlug, tenantId);
      const roomInfo = await this.matrixRoomService.createRoom({
        name: roomName,
        topic: `Discussion for ${group.name}`,
        isPublic: group.visibility === 'public',
        isDirect: false,
        encrypted: false, // Disable encryption for group chat rooms
        // Add the group creator as the first member
        inviteUserIds: creator.matrixUserId ? [creator.matrixUserId] : [],
        // Set creator as moderator - MatrixRoomService will handle admin user
        powerLevelContentOverride: creator.matrixUserId
          ? {
              users: {
                [creator.matrixUserId]: 50, // Moderator level
              },
            }
          : undefined,
      });

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
      // Get group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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

      // Always ensure user has Matrix credentials and joins the room
      const userWithCredentials = await this.ensureUserHasMatrixCredentials(
        user.id,
        tenantId,
      );

      // Always attempt Matrix room operations
      const isJoined = await this.addUserToMatrixRoom(
        chatRoom.matrixRoomId,
        userWithCredentials,
      );

      // Set appropriate permissions based on role
      if (isJoined && userWithCredentials.matrixUserId) {
        await this.handleModeratorPermissions(
          group.id,
          user.id,
          userWithCredentials.matrixUserId,
          chatRoom.matrixRoomId,
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
    try {
      // Get group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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

      if (!user.matrixUserId) {
        throw new Error(
          `User with slug ${userSlug} does not have a Matrix user ID`,
        );
      }

      // Remove the user from the room
      await this.matrixRoomService.removeUserFromRoom(
        chatRoom.matrixRoomId,
        user.matrixUserId,
      );

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
      // Get group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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
      // Get group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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
      // Get group by slug
      const group = await this.groupService.getGroupBySlug(groupSlug);
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
              // Use the Matrix room service's dedicated room deletion method
              const deleted = await this.matrixRoomService.deleteRoom(
                room.matrixRoomId,
              );

              if (deleted) {
                this.logger.log(
                  `Successfully deleted Matrix room ${room.matrixRoomId} using the Matrix admin API`,
                );
              } else {
                this.logger.warn(
                  `Failed to delete Matrix room ${room.matrixRoomId}, continuing with database cleanup`,
                );
              }
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
    _tenantId: string,
  ): Promise<boolean> {
    try {
      const group = await this.groupService.getGroupBySlug(groupSlug);
      return !!group;
    } catch (error) {
      this.logger.error(
        `Error checking if group ${groupSlug} exists: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }
}
