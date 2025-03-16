import { Injectable, Scope, Inject, Logger, forwardRef } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { MatrixService } from '../matrix/matrix.service';
import { UserService } from '../user/user.service';
import { GroupMemberService } from '../group-member/group-member.service';
import {
  ChatRoomEntity,
  ChatRoomType,
  ChatRoomVisibility,
} from './infrastructure/persistence/relational/entities/chat-room.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { Trace } from '../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);
  private readonly tracer = trace.getTracer('chat-room-service');
  private chatRoomRepository: Repository<ChatRoomEntity>;
  private eventRepository: Repository<EventEntity>;
  private groupRepository: Repository<GroupEntity>;

  /**
   * Ensures a user has Matrix credentials, provisioning them if needed
   * @param userId The user ID to ensure has Matrix credentials
   * @returns The user with Matrix credentials
   * @throws Error if Matrix credentials could not be provisioned
   */
  private async ensureUserHasMatrixCredentials(
    userId: number,
  ): Promise<UserEntity> {
    // Get the user
    let user = await this.userService.getUserById(userId);

    // If user doesn't have Matrix credentials, try to provision them
    if (!user.matrixUserId || !user.matrixAccessToken || !user.matrixDeviceId) {
      this.logger.log(
        `User ${userId} is missing Matrix credentials, attempting to provision...`,
      );
      try {
        // Get user's name for Matrix registration
        const displayName = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(' ');
        const username = `om_${user.ulid.toLowerCase()}`;
        const password =
          Math.random().toString(36).slice(2) +
          Math.random().toString(36).slice(2);

        // Call the Matrix service to create a user
        const matrixUserInfo = await this.matrixService.createUser({
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

        // Get the updated user record
        user = await this.userService.getUserById(userId);
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

    // Start the client for this user
    try {
      // Add non-null assertions since we've checked these values above
      await this.matrixService.startClient({
        userId: user.matrixUserId!, // Non-null assertion
        accessToken: user.matrixAccessToken!, // Non-null assertion
        deviceId: user.matrixDeviceId || undefined,
      });
    } catch (startError) {
      this.logger.error(
        `Failed to start Matrix client for user ${userId}: ${startError.message}`,
      );
      throw new Error(
        `Could not connect to Matrix chat service. Please try again later.`,
      );
    }

    return user;
  }

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly matrixService: MatrixService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
  ) {
    void this.initializeRepositories();
  }

  @Trace('chat-room.initializeRepositories')
  private async initializeRepositories() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.chatRoomRepository = dataSource.getRepository(ChatRoomEntity);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.groupRepository = dataSource.getRepository(GroupEntity);
  }

  /**
   * Create a chat room for an event
   */
  @Trace('chat-room.createEventChatRoom')
  async createEventChatRoom(
    eventId: number,
    creatorId: number,
  ): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Get the event
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ['user'],
    });

    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    // Check if a chat room already exists for this event
    const existingRoom = await this.chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Get the creator user
    const creator = await this.userService.getUserById(creatorId);

    // Create a chat room in Matrix
    const roomInfo = await this.matrixService.createRoom({
      name: `Event: ${event.name}`,
      topic: `Discussion for ${event.name}`,
      isPublic: event.visibility === 'public',
      isDirect: false,
      // Add the event creator as the first member
      inviteUserIds: [creator.matrixUserId].filter((id) => !!id) as string[],
      // Set creator as moderator - MatrixService will handle admin user
      powerLevelContentOverride: creator.matrixUserId
        ? {
            users: {
              [creator.matrixUserId]: 50, // Moderator level
            },
          }
        : undefined,
    });

    // Create a chat room entity
    const chatRoom = this.chatRoomRepository.create({
      name: `Event: ${event.name}`,
      topic: `Discussion for ${event.name}`,
      matrixRoomId: roomInfo.roomId,
      type: ChatRoomType.EVENT,
      visibility:
        event.visibility === 'public'
          ? ChatRoomVisibility.PUBLIC
          : ChatRoomVisibility.PRIVATE,
      creator,
      event,
      settings: {
        historyVisibility: 'shared',
        guestAccess: false,
        requireInvitation: event.visibility !== 'public',
        encrypted: false,
      },
    });

    // Save the chat room
    await this.chatRoomRepository.save(chatRoom);

    // Update the event with the Matrix room ID
    event.matrixRoomId = roomInfo.roomId;
    await this.eventRepository.save(event);

    return chatRoom;
  }

  /**
   * Add a user to an event chat room
   */
  @Trace('chat-room.addUserToEventChatRoom')
  async addUserToEventChatRoom(eventId: number, userId: number): Promise<void> {
    await this.initializeRepositories();

    // Get the event
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    // Get the chat room
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (!chatRoom) {
      throw new Error(`Chat room for event with id ${eventId} not found`);
    }

    // Get the user
    const user = await this.userService.getUserById(userId);

    if (!user.matrixUserId) {
      throw new Error(`User with id ${userId} does not have a Matrix user ID`);
    }

    // First, invite the user to the room
    await this.matrixService.inviteUser({
      roomId: chatRoom.matrixRoomId,
      userId: user.matrixUserId,
    });

    // Next, have the user join the room if they have credentials
    if (user.matrixAccessToken) {
      try {
        await this.matrixService.joinRoom(
          chatRoom.matrixRoomId,
          user.matrixUserId,
          user.matrixAccessToken,
          user.matrixDeviceId,
        );
        this.logger.log(`User ${userId} joined room ${chatRoom.matrixRoomId}`);
      } catch (joinError) {
        this.logger.warn(
          `User ${userId} failed to join room: ${joinError.message}`,
        );
        // Continue anyway - they can join later
      }
    }

    // Add the user to the chat room members in our database
    const roomWithMembers = await this.chatRoomRepository.findOne({
      where: { id: chatRoom.id },
      relations: ['members'],
    });

    if (roomWithMembers) {
      // Check if user is already a member
      const isAlreadyMember = roomWithMembers.members.some(
        (member) => member.id === userId,
      );

      if (!isAlreadyMember) {
        roomWithMembers.members.push(user);
        await this.chatRoomRepository.save(roomWithMembers);
      }
    }
  }

  /**
   * Remove a user from an event chat room
   */
  @Trace('chat-room.removeUserFromEventChatRoom')
  async removeUserFromEventChatRoom(
    eventId: number,
    userId: number,
  ): Promise<void> {
    await this.initializeRepositories();

    // Get the event
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    // Get the chat room
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { event: { id: eventId } },
      relations: ['members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room for event with id ${eventId} not found`);
    }

    // Get the user
    const user = await this.userService.getUserById(userId);

    if (!user.matrixUserId) {
      throw new Error(`User with id ${userId} does not have a Matrix user ID`);
    }

    // Remove the user from the room
    await this.matrixService.removeUserFromRoom(
      chatRoom.matrixRoomId,
      user.matrixUserId,
    );

    // Remove the user from the chat room members
    chatRoom.members = chatRoom.members.filter(
      (member) => member.id !== userId,
    );
    await this.chatRoomRepository.save(chatRoom);
  }

  /**
   * Get all chat rooms for an event
   */
  @Trace('chat-room.getEventChatRooms')
  async getEventChatRooms(eventId: number): Promise<ChatRoomEntity[]> {
    await this.initializeRepositories();

    return this.chatRoomRepository.find({
      where: { event: { id: eventId } },
      relations: ['creator', 'event'],
    });
  }
  
  /**
   * Create a chat room for a group
   */
  @Trace('chat-room.createGroupChatRoom')
  async createGroupChatRoom(
    groupId: number,
    creatorId: number,
  ): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Get the group
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['createdBy'],
    });

    if (!group) {
      throw new Error(`Group with id ${groupId} not found`);
    }

    // Check if a chat room already exists for this group
    const existingRoom = await this.chatRoomRepository.findOne({
      where: { group: { id: groupId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Get the creator user
    const creator = await this.userService.getUserById(creatorId);

    // Create a chat room in Matrix
    // Using the group slug for a unique, stable identifier
    const roomInfo = await this.matrixService.createRoom({
      name: `group-${group.slug}`,
      topic: `Discussion for group: ${group.slug}`,
      isPublic: group.visibility === 'public',
      isDirect: false,
      // Add the group creator as the first member
      inviteUserIds: [creator.matrixUserId].filter((id) => !!id) as string[],
      // Set creator as moderator - MatrixService will handle admin user
      powerLevelContentOverride: creator.matrixUserId
        ? {
            users: {
              [creator.matrixUserId]: 50, // Moderator level
            },
          }
        : undefined,
    });

    // Create a chat room entity
    const chatRoom = this.chatRoomRepository.create({
      name: `group-${group.slug}`,
      topic: `Discussion for group: ${group.slug}`,
      matrixRoomId: roomInfo.roomId,
      type: ChatRoomType.GROUP,
      visibility:
        group.visibility === 'public'
          ? ChatRoomVisibility.PUBLIC
          : ChatRoomVisibility.PRIVATE,
      creator,
      group,
      settings: {
        historyVisibility: 'shared',
        guestAccess: false,
        requireInvitation: group.visibility !== 'public',
        encrypted: false,
      },
    });

    // Save the chat room
    await this.chatRoomRepository.save(chatRoom);

    // Update the group with the Matrix room ID
    group.matrixRoomId = roomInfo.roomId;
    await this.groupRepository.save(group);

    return chatRoom;
  }

  /**
   * Get all chat rooms for a group
   */
  @Trace('chat-room.getGroupChatRooms')
  async getGroupChatRooms(groupId: number): Promise<ChatRoomEntity[]> {
    await this.initializeRepositories();

    return this.chatRoomRepository.find({
      where: { group: { id: groupId } },
      relations: ['creator', 'group'],
    });
  }

  /**
   * Add a user to a group chat room, but only if they're a member of the group
   * 
   * Uses a cache mechanism to reduce redundant operations
   */
  @Trace('chat-room.addUserToGroupChatRoom')
  async addUserToGroupChatRoom(groupId: number, userId: number): Promise<void> {
    await this.initializeRepositories();

    // Prepare cache key to prevent redundant operations within the same request cycle
    const cacheKey = `group:${groupId}:user:${userId}`;
    
    // If we already verified and added this user to this chat room in this request, skip
    if (this.request.chatRoomMembershipCache?.[cacheKey]) {
      this.logger.debug(`User ${userId} is already verified as member of group ${groupId} chat room in this request`);
      return;
    }
    
    // Initialize cache if needed
    if (!this.request.chatRoomMembershipCache) {
      this.request.chatRoomMembershipCache = {};
    }

    // Check if the user is a member of the group using the proper service
    try {
      // This will throw an error if the tenantId isn't available
      const groupMember = await this.groupMemberService.findGroupMemberByUserId(groupId, userId);
      
      if (!groupMember) {
        this.logger.warn(`User ${userId} is not a member of group ${groupId}, cannot add to chat room`);
        throw new Error(`User is not a member of this group`);
      }
      
      this.logger.log(`Verified user ${userId} is a member of group ${groupId} with role ${groupMember.groupRole?.name}`);
    } catch (error) {
      // If there was an error checking membership, throw it
      if (error.message !== 'User is not a member of this group') {
        this.logger.error(`Error checking group membership: ${error.message}`, error.stack);
        throw new Error(`Could not verify group membership: ${error.message}`);
      }
      throw error;
    }

    // Get the chat room and group in one query, avoiding multiple DB lookups
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { group: { id: groupId } },
      relations: ['group', 'members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room for group with id ${groupId} not found`);
    }

    // Check if user is already a chat room member in our database
    const isAlreadyMember = chatRoom.members?.some(member => member.id === userId);
    
    if (isAlreadyMember) {
      // User is already in our DB as room member, mark cache and skip Matrix operations
      this.request.chatRoomMembershipCache[cacheKey] = true;
      this.logger.debug(`User ${userId} is already in database as member of chat room for group ${groupId}`);
      return;
    }

    // Get the user with matrix credentials in one query
    const user = await this.userService.getUserById(userId);

    if (!user.matrixUserId || !user.matrixAccessToken) {
      throw new Error(`User with id ${userId} does not have valid Matrix credentials`);
    }

    // First try joining directly (most efficient if the user is already invited)
    let joinSuccess = false;
    
    try {
      await this.matrixService.joinRoom(
        chatRoom.matrixRoomId,
        user.matrixUserId,
        user.matrixAccessToken,
        user.matrixDeviceId,
      );
      joinSuccess = true;
      this.logger.debug(`User ${userId} joined group room ${chatRoom.matrixRoomId} directly`);
    } catch (joinError) {
      // If join fails with "already in room", that's actually success
      if (joinError.message && (
          joinError.message.includes('already in the room') || 
          joinError.message.includes('already a member') ||
          joinError.message.includes('already joined'))) {
        joinSuccess = true;
        this.logger.debug(`User ${userId} is already a member of room ${chatRoom.matrixRoomId}`);
      } else {
        // Only if direct join failed and it's not because they're already in the room, try invite+join
        this.logger.debug(`Direct join failed, trying invite+join flow: ${joinError.message}`);
        
        try {
          await this.matrixService.inviteUser({
            roomId: chatRoom.matrixRoomId,
            userId: user.matrixUserId,
          });
          
          // Try joining again after invite
          await this.matrixService.joinRoom(
            chatRoom.matrixRoomId,
            user.matrixUserId,
            user.matrixAccessToken,
            user.matrixDeviceId,
          );
          joinSuccess = true;
          this.logger.debug(`User ${userId} joined group room ${chatRoom.matrixRoomId} after invitation`);
        } catch (error) {
          // Log but continue - they might already be in the room despite errors
          this.logger.warn(`Error in invite+join flow for user ${userId} to room ${chatRoom.matrixRoomId}: ${error.message}`);
        }
      }
    }

    // If join was successful or we think they're already in the room, update our DB
    if (joinSuccess) {
      // Add the user to the chat room members in our database
      if (!chatRoom.members) {
        chatRoom.members = [];
      }
      
      chatRoom.members.push(user);
      await this.chatRoomRepository.save(chatRoom);
      
      // Cache the result for this request
      this.request.chatRoomMembershipCache[cacheKey] = true;
    }
  }

  /**
   * Remove a user from a group chat room
   */
  @Trace('chat-room.removeUserFromGroupChatRoom')
  async removeUserFromGroupChatRoom(
    groupId: number,
    userId: number,
  ): Promise<void> {
    await this.initializeRepositories();

    // Get the group
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new Error(`Group with id ${groupId} not found`);
    }

    // Get the chat room
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { group: { id: groupId } },
      relations: ['members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room for group with id ${groupId} not found`);
    }

    // Get the user
    const user = await this.userService.getUserById(userId);

    if (!user.matrixUserId) {
      throw new Error(`User with id ${userId} does not have a Matrix user ID`);
    }

    // Remove the user from the room
    await this.matrixService.removeUserFromRoom(
      chatRoom.matrixRoomId,
      user.matrixUserId,
    );

    // Remove the user from the chat room members
    chatRoom.members = chatRoom.members.filter(
      (member) => member.id !== userId,
    );
    await this.chatRoomRepository.save(chatRoom);
  }

  /**
   * Get members of a chat room
   */
  @Trace('chat-room.getChatRoomMembers')
  async getChatRoomMembers(roomId: number): Promise<UserEntity[]> {
    await this.initializeRepositories();

    const chatRoom = await this.chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['members'],
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    return chatRoom.members;
  }

  /**
   * Send a message to a chat room
   */
  @Trace('chat-room.sendMessage')
  async sendMessage(
    roomId: number,
    userId: number,
    message: string,
    formattedMessage?: string,
  ): Promise<string> {
    await this.initializeRepositories();

    // Get the chat room
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { id: roomId },
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    // Ensure user has Matrix credentials (will provision them if needed)
    const user = await this.ensureUserHasMatrixCredentials(userId);

    // Make sure user is in the room
    try {
      // Check if user is already a member of the room in the database
      const roomWithMembers = await this.chatRoomRepository.findOne({
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
        await this.matrixService.inviteUser({
          roomId: chatRoom.matrixRoomId,
          userId: user.matrixUserId!, // Non-null assertion
        });

        // Then have the user join the room
        await this.matrixService.joinRoom(
          chatRoom.matrixRoomId,
          user.matrixUserId!, // Non-null assertion
          user.matrixAccessToken!, // Non-null assertion
          user.matrixDeviceId,
        );

        // Add user to the room's members in the database
        if (roomWithMembers) {
          roomWithMembers.members.push(user);
          await this.chatRoomRepository.save(roomWithMembers);
        }
      }
    } catch (error) {
      this.logger.warn(
        `Error ensuring user ${userId} is in room ${chatRoom.id}: ${error.message}`,
      );
      // Continue anyway - the message send will confirm if they're really in the room
    }

    // Create a proper display name
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email?.split('@')[0] ||
      'OpenMeet User';

    // Set the display name if needed
    try {
      this.logger.log(
        `Setting Matrix display name for user ${userId} to "${displayName}"`,
      );

      await this.matrixService.setUserDisplayName(
        user.matrixUserId!, // Non-null assertion
        user.matrixAccessToken!, // Non-null assertion
        displayName,
        user.matrixDeviceId,
      );

      // Verify display name was set
      const displayNameCheck = await this.matrixService.getUserDisplayName(
        user.matrixUserId!, // Non-null assertion
      );
      this.logger.log(
        `Current Matrix display name for user ${userId}: "${displayNameCheck || 'Not set'}"`,
      );

      // If display name wasn't set properly, try again with a direct API call
      if (!displayNameCheck || displayNameCheck !== displayName) {
        this.logger.warn(
          `Display name not set correctly, trying direct API method`,
        );
        await this.matrixService.setUserDisplayNameDirect(
          user.matrixUserId!, // Non-null assertion
          user.matrixAccessToken!, // Non-null assertion
          displayName,
        );
      }
    } catch (err) {
      this.logger.warn(`Failed to set user display name: ${err.message}`);
      // Continue anyway - display name is not critical
    }

    // Send the message using the user's Matrix credentials
    return this.matrixService.sendMessage({
      roomId: chatRoom.matrixRoomId,
      content: message,
      userId: user.matrixUserId!, // Non-null assertion
      accessToken: user.matrixAccessToken!, // Non-null assertion
      deviceId: user.matrixDeviceId,
      // Legacy/alternate field support
      body: message,
      formatted_body: formattedMessage,
      format: formattedMessage ? 'org.matrix.custom.html' : undefined,
      senderUserId: user.matrixUserId!, // Non-null assertion
      senderAccessToken: user.matrixAccessToken!, // Non-null assertion
      senderDeviceId: user.matrixDeviceId,
    });
  }

  /**
   * Get messages from a chat room
   */
  @Trace('chat-room.getMessages')
  async getMessages(roomId: number, userId: number, limit = 50, from?: string) {
    await this.initializeRepositories();

    // Get the chat room
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { id: roomId },
    });

    if (!chatRoom) {
      throw new Error(`Chat room with id ${roomId} not found`);
    }

    // Ensure user has Matrix credentials (will provision them if needed)
    const user = await this.ensureUserHasMatrixCredentials(userId);

    // Get the messages
    return this.matrixService.getRoomMessages(
      chatRoom.matrixRoomId,
      limit,
      from,
      user.matrixUserId!, // Non-null assertion
    );
  }
}
