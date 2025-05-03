import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ChatRoomManagerInterface } from '../interfaces/chat-room-manager.interface';
import { ChatRoomEntity } from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
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
import { ChatRoomType, ChatRoomVisibility } from '../infrastructure/persistence/relational/entities/chat-room.entity';
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
          throw new Error(`User with id ${userId} not found after provisioning`);
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
    tenantId: string,
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
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
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
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
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
   * Ensure a chat room exists for an event
   */
  @Trace('matrix-chat-room-manager.ensureEventChatRoom')
  async ensureEventChatRoom(
    eventId: number,
    creatorId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity> {
    // Get database connection for the tenant
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
    const eventRepository = dataSource.getRepository(EventEntity);

    // Check if a chat room already exists for this event
    const existingRoom = await chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // If no chat room exists, create one
    const event = await this.eventQueryService.findById(eventId, tenantId);
    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    // Get the creator user
    const creator = await this.userService.findById(creatorId, tenantId);
    if (!creator) {
      throw new Error(`Creator user with id ${creatorId} not found`);
    }

    // Create a chat room in Matrix
    const roomName = this.generateRoomName('event', event.slug, tenantId);
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
    await eventRepository.update({ id: eventId }, { matrixRoomId: roomInfo.roomId });

    this.logger.log(
      `Created chat room for event ${event.slug} in tenant ${tenantId}`,
    );
    return chatRoom;
  }

  /**
   * Add a user to an event chat room
   */
  @Trace('matrix-chat-room-manager.addUserToEventChatRoom')
  async addUserToEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<void> {
    try {
      // Get event through service layer
      const event = await this.eventQueryService.findById(eventId, tenantId);
      if (!event) {
        throw new Error(`Event with id ${eventId} not found`);
      }

      // Get chat room
      const chatRoom = await this.getChatRoomForEvent(eventId, tenantId);

      // First check if the user is already a member in the database
      // Get database connection for the tenant
      const dataSource = await this.tenantConnectionService.getTenantConnection(
        tenantId,
      );
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      const roomWithMembers = await chatRoomRepository.findOne({
        where: { id: chatRoom.id },
        relations: ['members'],
      });

      // Check database membership but don't skip Matrix operations
      const isInDatabase =
        roomWithMembers &&
        roomWithMembers.members.some((member) => member.id === userId);

      if (isInDatabase) {
        this.logger.debug(
          `User ${userId} is already a database member of room ${chatRoom.id}, but still ensuring Matrix membership`,
        );
      }

      // Always ensure user has Matrix credentials and joins the room
      const user = await this.ensureUserHasMatrixCredentials(userId, tenantId);

      // Always attempt Matrix room operations
      const isJoined = await this.addUserToMatrixRoom(
        chatRoom.matrixRoomId,
        user,
      );

      // Set appropriate permissions based on role
      if (isJoined && user.matrixUserId) {
        await this.handleModeratorPermissions(
          eventId,
          userId,
          user.matrixUserId,
          chatRoom.matrixRoomId,
          'event',
          tenantId,
        );
      }

      // Update database relationship only if not already there
      if (!isInDatabase) {
        await this.addUserToRoomInDatabase(chatRoom.id, userId, tenantId);
      }
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userId} to event ${eventId} chat room: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Remove a user from an event chat room
   */
  @Trace('matrix-chat-room-manager.removeUserFromEventChatRoom')
  async removeUserFromEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<void> {
    // Get database connection for the tenant
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
    const eventRepository = dataSource.getRepository(EventEntity);

    // Get the event
    const event = await eventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    // Get the chat room
    const chatRoom = await chatRoomRepository.findOne({
      where: { event: { id: eventId } },
      relations: ['members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room for event with id ${eventId} not found`);
    }

    // Get the user
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }

    if (!user.matrixUserId) {
      throw new Error(`User with id ${userId} does not have a Matrix user ID`);
    }

    // Remove the user from the room
    await this.matrixRoomService.removeUserFromRoom(
      chatRoom.matrixRoomId,
      user.matrixUserId,
    );

    // Remove the user from the chat room members
    chatRoom.members = chatRoom.members.filter(
      (member) => member.id !== userId,
    );
    await chatRoomRepository.save(chatRoom);
  }

  /**
   * Check if a user is a member of an event chat room
   */
  @Trace('matrix-chat-room-manager.isUserInEventChatRoom')
  async isUserInEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<boolean> {
    try {
      // Get database connection for the tenant
      const dataSource = await this.tenantConnectionService.getTenantConnection(
        tenantId,
      );
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

      // Get the chat room with members
      const chatRoom = await chatRoomRepository.findOne({
        where: { event: { id: eventId } },
        relations: ['members'],
      });

      if (!chatRoom) {
        return false;
      }

      // Check if the user is a member
      return chatRoom.members.some((member) => member.id === userId);
    } catch (error) {
      this.logger.error(
        `Error checking if user ${userId} is in event ${eventId} chat room: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Get all chat rooms for an event
   */
  @Trace('matrix-chat-room-manager.getEventChatRooms')
  async getEventChatRooms(
    eventId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity[]> {
    // Get database connection for the tenant
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
    const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);

    return chatRoomRepository.find({
      where: { event: { id: eventId } },
      relations: ['creator', 'event'],
    });
  }

  /**
   * Delete all chat rooms for an event
   */
  @Trace('matrix-chat-room-manager.deleteEventChatRooms')
  async deleteEventChatRooms(eventId: number, tenantId: string): Promise<void> {
    try {
      // Get database connection for the tenant
      const dataSource = await this.tenantConnectionService.getTenantConnection(
        tenantId,
      );
      const chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
      const eventRepository = dataSource.getRepository(EventEntity);

      // Find all chat rooms for this event
      const chatRooms = await chatRoomRepository.find({
        where: { event: { id: eventId } },
        relations: ['members'],
      });

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for event ${eventId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for event ${eventId}`,
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
          );
          // Continue with other rooms
        }
      }

      // Update the event to clear the matrixRoomId reference
      const event = await eventRepository.findOne({
        where: { id: eventId },
      });

      if (event && event.matrixRoomId) {
        event.matrixRoomId = '';
        await eventRepository.save(event);
      }

      this.logger.log(
        `Successfully deleted all chat rooms for event ${eventId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for event ${eventId}: ${error.message}`,
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
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
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
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
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
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      tenantId,
    );
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
   */
  @Trace('matrix-chat-room-manager.checkEventExists')
  async checkEventExists(eventId: number, tenantId: string): Promise<boolean> {
    try {
      const event = await this.eventQueryService.findById(eventId, tenantId);
      return !!event;
    } catch (error) {
      this.logger.error(
        `Error checking if event ${eventId} exists: ${error.message}`,
      );
      return false;
    }
  }
}
