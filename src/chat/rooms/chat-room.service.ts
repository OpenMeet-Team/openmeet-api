import { Injectable, Scope, Inject, Logger, forwardRef } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { UserService } from '../../user/user.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import {
  EventAttendeePermission,
  EventAttendeeRole,
  GroupRole,
} from '../../core/constants/constant';
import {
  ChatRoomEntity,
  ChatRoomType,
  ChatRoomVisibility,
} from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupService } from '../../group/group.service';

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
        // Use the centralized provisioning method
        const matrixUserInfo = await this.matrixUserService.provisionMatrixUser(
          user,
          this.request.tenantId,
        );

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

    // Get a client for this user
    try {
      // Add non-null assertions since we've checked these values above
      // Use getClientForUser from MatrixUserService
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

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly matrixMessageService: MatrixMessageService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
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
   * Find or create a chat room for an event
   * This method is used by both tests and production code
   */
  @Trace('chat-room.getOrCreateEventChatRoom')
  async getOrCreateEventChatRoom(eventId: number): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Check if a chat room already exists for this event
    const existingRoom = await this.chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Get the event info using the EventQueryService
    const tenantId = this.request.tenantId;
    const event = await this.eventQueryService.findById(eventId, tenantId);

    if (!event) {
      throw new Error(`Event with id ${eventId} not found`);
    }

    if (!event.user || !event.user.id) {
      throw new Error(`Event with id ${eventId} has no creator`);
    }

    // Create a new chat room using the existing service method
    // We'll use the event creator as the chat room creator
    return this.createEventChatRoom(eventId, event.user.id);
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
    const tenantId = this.request.tenantId;

    // Use the tenant-aware version with the current tenant ID
    return this.createEventChatRoomWithTenant(eventId, creatorId, tenantId);
  }

  /**
   * Tenant-aware version of createEventChatRoom that doesn't rely on the request context
   * This is useful for event handlers where the request context is not available
   */
  @Trace('chat-room.createEventChatRoomWithTenant')
  async createEventChatRoomWithTenant(
    eventId: number,
    creatorId: number,
    tenantId?: string,
  ): Promise<ChatRoomEntity> {
    // If tenantId is not provided, try to use the one from the request
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    // Get a connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    const chatRoomRepo = dataSource.getRepository(ChatRoomEntity);
    const eventRepo = dataSource.getRepository(EventEntity);

    // Get the event
    const event = await eventRepo.findOne({
      where: { id: eventId },
      relations: ['user'],
    });

    if (!event) {
      throw new Error(
        `Event with id ${eventId} not found in tenant ${tenantId}`,
      );
    }

    // Check if a chat room already exists for this event
    const existingRoom = await chatRoomRepo.findOne({
      where: { event: { id: eventId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Get the creator user
    const creator = await this.userService.getUserById(creatorId, tenantId);

    // Create a chat room in Matrix
    // Using the event slug for a unique, stable identifier
    const roomInfo = await this.matrixRoomService.createRoom({
      name: `event-${event.slug}`,
      topic: `Discussion for ${event.name}`,
      isPublic: event.visibility === 'public',
      isDirect: false,
      // Add the event creator as the first member
      inviteUserIds: [creator.matrixUserId].filter((id) => !!id) as string[],
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
    const chatRoom = chatRoomRepo.create({
      name: `event-${event.slug}`,
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
    await chatRoomRepo.save(chatRoom);

    // Update the event with the Matrix room ID
    event.matrixRoomId = roomInfo.roomId;
    await eventRepo.save(event);

    this.logger.log(
      `Created chat room for event ${event.slug} in tenant ${tenantId}`,
    );
    return chatRoom;
  }

  /**
   * Add a user to an event chat room
   *
   * Uses a cache mechanism to reduce redundant operations
   * Also sets appropriate permissions if user is an admin/host/moderator
   */
  @Trace('chat-room.addUserToEventChatRoom')
  async addUserToEventChatRoom(eventId: number, userId: number): Promise<void> {
    await this.initializeRepositories();

    // Prepare cache key to prevent redundant operations within the same request cycle
    const cacheKey = `event:${eventId}:user:${userId}`;

    // If we already verified and added this user to this chat room in this request, skip
    if (this.request.chatRoomMembershipCache?.[cacheKey]) {
      this.logger.debug(
        `User ${userId} is already verified as member of event ${eventId} chat room in this request`,
      );
      return;
    }

    // Initialize cache if needed
    if (!this.request.chatRoomMembershipCache) {
      this.request.chatRoomMembershipCache = {};
    }

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

    // Ensure user has Matrix credentials
    if (!user.matrixUserId) {
      try {
        // Use the ensureUserHasMatrixCredentials method to provision Matrix credentials
        const userWithCredentials =
          await this.ensureUserHasMatrixCredentials(userId);
        // Update our user instance with the credentials
        user.matrixUserId = userWithCredentials.matrixUserId;
        user.matrixAccessToken = userWithCredentials.matrixAccessToken;
        user.matrixDeviceId = userWithCredentials.matrixDeviceId;
      } catch (error) {
        this.logger.error(
          `Failed to ensure Matrix credentials for user ${userId}: ${error.message}`,
        );
        throw new Error(
          `User with id ${userId} could not be provisioned with Matrix credentials`,
        );
      }
    }

    // Try to invite user to the room - may fail if they're already a member
    if (user.matrixUserId) {
      try {
        await this.matrixRoomService.inviteUser(
          chatRoom.matrixRoomId,
          user.matrixUserId,
        );
      } catch (inviteError) {
        // If the error is because they're already in the room, log and continue
        if (
          inviteError.message &&
          inviteError.message.includes('already in the room')
        ) {
          this.logger.log(
            `User ${userId} is already in room ${chatRoom.matrixRoomId}, skipping invite`,
          );
        } else {
          this.logger.warn(
            `Error inviting user ${userId} to room: ${inviteError.message}`,
          );
          // Continue anyway - they may still be able to join
        }
      }
    }

    // Next, have the user join the room if they have credentials
    let isJoined = false;
    if (user.matrixAccessToken && user.matrixUserId) {
      try {
        await this.matrixRoomService.joinRoom(
          chatRoom.matrixRoomId,
          user.matrixUserId,
          user.matrixAccessToken,
          user.matrixDeviceId,
        );
        isJoined = true;
        this.logger.log(`User ${userId} joined room ${chatRoom.matrixRoomId}`);
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
            `User ${userId} is already a member of room ${chatRoom.matrixRoomId}`,
          );
        } else {
          this.logger.warn(
            `User ${userId} failed to join room: ${joinError.message}`,
          );
          // Continue anyway - they can join later
        }
      }
    }

    // Check if the user should have moderator privileges, but only if they have Matrix credentials
    if (user.matrixUserId && isJoined) {
      try {
        const attendee =
          await this.eventAttendeeService.findEventAttendeeByUserId(
            eventId,
            userId,
          );

        if (attendee && attendee.role) {
          // Only assign moderator privileges to users with appropriate roles: host, moderator
          // This is the fix to prevent the first attendee from becoming a moderator
          const isModeratorRole =
            attendee.role.name === EventAttendeeRole.Host ||
            attendee.role.name === EventAttendeeRole.Moderator;

          const hasManageEventPermission =
            attendee.role.permissions &&
            attendee.role.permissions.some(
              (p) => p.name === EventAttendeePermission.ManageEvent,
            );

          if (isModeratorRole && hasManageEventPermission) {
            this.logger.log(
              `User ${userId} has role ${attendee.role.name} with ManageEvent permission, setting as moderator in room ${chatRoom.matrixRoomId}`,
            );

            // Set user as moderator in Matrix room
            await this.matrixRoomService.setRoomPowerLevels(
              chatRoom.matrixRoomId,
              { [user.matrixUserId]: 50 }, // 50 is moderator level
            );

            this.logger.log(
              `Successfully set ${user.matrixUserId} as moderator for room ${chatRoom.matrixRoomId}`,
            );
          } else {
            this.logger.log(
              `User ${userId} with role ${attendee.role.name} does not qualify for moderator privileges`,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `Error checking/setting moderator privileges for user ${userId}: ${error.message}`,
        );
        // Continue anyway - basic join functionality is more important than moderator privileges
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

      // Mark that we've handled this user's membership for this event in this request
      this.request.chatRoomMembershipCache[cacheKey] = true;
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
    await this.matrixRoomService.removeUserFromRoom(
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
   * Get a chat room for an event by its slug
   * Uses the EventQueryService to look up the event by slug first
   */
  @Trace('chat-room.getEventChatRoomBySlug')
  async getEventChatRoomBySlug(
    eventSlug: string,
  ): Promise<ChatRoomEntity | null> {
    await this.initializeRepositories();

    try {
      // Use the EventQueryService to get the event by slug
      const event = await this.eventQueryService.findEventBySlug(eventSlug);

      if (!event) {
        this.logger.debug(`Event with slug ${eventSlug} not found`);
        return null;
      }

      // Find the chat room for this event
      const chatRoom = await this.chatRoomRepository.findOne({
        where: { event: { id: event.id } },
        relations: ['creator', 'event'],
      });

      return chatRoom;
    } catch (error) {
      this.logger.warn(
        `Error finding event by slug ${eventSlug}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Find or create a chat room for a group
   * This method is used by both tests and production code
   */
  @Trace('chat-room.getOrCreateGroupChatRoom')
  async getOrCreateGroupChatRoom(groupId: number): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Check if a chat room already exists for this group
    const existingRoom = await this.chatRoomRepository.findOne({
      where: { group: { id: groupId } },
    });

    if (existingRoom) {
      return existingRoom;
    }

    // Get the group info with createdBy relation using the GroupService
    const group = await this.groupService.findOne(groupId);
    if (!group) {
      throw new Error(`Group with id ${groupId} not found`);
    }

    if (!group.createdBy || !group.createdBy.id) {
      throw new Error(`Group with id ${groupId} has no creator`);
    }

    // Create a new chat room using the existing service method
    // We'll use the group creator as the chat room creator
    return this.createGroupChatRoom(groupId, group.createdBy.id);
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
    const roomInfo = await this.matrixRoomService.createRoom({
      name: `group-${group.slug}`,
      topic: `Discussion for group: ${group.slug}`,
      isPublic: group.visibility === 'public',
      isDirect: false,
      // Add the group creator as the first member
      inviteUserIds: [creator.matrixUserId].filter((id) => !!id) as string[],
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
   * Find or create a direct chat room between two users
   * This method is used by both tests and production code
   */
  @Trace('chat-room.getOrCreateDirectChatRoom')
  async getOrCreateDirectChatRoom(
    user1Id: number,
    user2Id: number,
  ): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Check if a chat room already exists between these users (in either order)
    // We need to use the queryBuilder for complex conditions
    const existingRooms = await this.chatRoomRepository
      .createQueryBuilder('chatRoom')
      .where('chatRoom.type = :type', { type: ChatRoomType.DIRECT })
      .andWhere(
        '(chatRoom.user1Id = :user1Id AND chatRoom.user2Id = :user2Id) OR (chatRoom.user1Id = :user2Id AND chatRoom.user2Id = :user1Id)',
        { user1Id, user2Id },
      )
      .getMany();

    if (existingRooms.length > 0) {
      return existingRooms[0];
    }

    // Get both users using the UserService
    const user1 = await this.userService.getUserById(user1Id);
    const user2 = await this.userService.getUserById(user2Id);

    if (!user1 || !user2) {
      throw new Error(`One or both users not found`);
    }

    // Ensure first user has Matrix credentials
    await this.ensureUserHasMatrixCredentials(user1Id);

    // Create a direct room in Matrix
    const roomName = `Direct: ${user1.firstName || ''} ${user1.lastName || ''} and ${user2.firstName || ''} ${user2.lastName || ''}`;

    const roomInfo = await this.matrixRoomService.createRoom({
      name: roomName,
      topic: 'Direct message conversation',
      isPublic: false,
      isDirect: true,
      // Remove preset - we'll handle that through settings
      inviteUserIds: user2.matrixUserId ? [user2.matrixUserId] : [],
    });

    // Create a chat room entity
    const chatRoom = this.chatRoomRepository.create({
      matrixRoomId: roomInfo.roomId,
      name: roomName,
      type: ChatRoomType.DIRECT,
      visibility: ChatRoomVisibility.PRIVATE,
      creator: user1,
      user1Id: user1Id,
      user2Id: user2Id,
      settings: {
        historyVisibility: 'shared',
        guestAccess: false,
        requireInvitation: true,
        encrypted: true,
      },
    });

    // Save the chat room
    const savedRoom = await this.chatRoomRepository.save(chatRoom);
    return savedRoom;
  }

  /**
   * Get a chat room for a group by its slug
   * Uses the GroupService to look up the group by slug first
   */
  @Trace('chat-room.getGroupChatRoomBySlug')
  async getGroupChatRoomBySlug(
    groupSlug: string,
  ): Promise<ChatRoomEntity | null> {
    await this.initializeRepositories();

    try {
      // Use the GroupService to get the group by slug
      const group = await this.groupService.findGroupBySlug(groupSlug);

      if (!group) {
        this.logger.debug(`Group with slug ${groupSlug} not found`);
        return null;
      }

      // Find the chat room for this group
      const chatRoom = await this.chatRoomRepository.findOne({
        where: { group: { id: group.id } },
        relations: ['creator', 'group'],
      });

      return chatRoom;
    } catch (error) {
      this.logger.warn(
        `Error finding group by slug ${groupSlug}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Add a user to an event chat room using event and user slugs
   *
   * This is the preferred method for user-facing APIs over using numeric IDs
   *
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user
   */
  @Trace('chat-room.addUserToEventChatRoomBySlug')
  async addUserToEventChatRoomBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find the event using the EventQueryService
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      if (!event) {
        throw new Error(`Event with slug ${eventSlug} not found`);
      }

      // Find the user by slug using getUserBySlug
      const user = await this.userService.getUserBySlug(userSlug);
      if (!user) {
        throw new Error(`User with slug ${userSlug} not found`);
      }

      // Verify the user is an attendee of the event
      // Note: We would use findBySlugAndUserSlug if it existed, but we'll use what we have
      const attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          user.id,
        );

      if (!attendee) {
        throw new Error(
          `User ${userSlug} is not an attendee of event ${eventSlug}`,
        );
      }

      // Now use the existing method with the numeric IDs
      await this.addUserToEventChatRoom(event.id, user.id);

      this.logger.log(
        `Added user ${userSlug} to event ${eventSlug} chat room by slug`,
      );
    } catch (error) {
      this.logger.error(
        `Error adding user ${userSlug} to event ${eventSlug} chat room: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Add a user to a group chat room using group and user slugs
   *
   * This is the preferred method for user-facing APIs over using numeric IDs
   *
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user
   */
  @Trace('chat-room.addUserToGroupChatRoomBySlug')
  async addUserToGroupChatRoomBySlug(
    groupSlug: string,
    userSlug: string,
  ): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find the group using the GroupService
      const group = await this.groupService.findGroupBySlug(groupSlug);
      if (!group) {
        throw new Error(`Group with slug ${groupSlug} not found`);
      }

      // Find the user by slug using getUserBySlug
      const user = await this.userService.getUserBySlug(userSlug);
      if (!user) {
        throw new Error(`User with slug ${userSlug} not found`);
      }

      // Verify the user is a member of the group
      const member = await this.groupMemberService.findGroupMemberByUserId(
        group.id,
        user.id,
      );

      if (!member) {
        throw new Error(
          `User ${userSlug} is not a member of group ${groupSlug}`,
        );
      }

      // Now use the existing method with the numeric IDs
      await this.addUserToGroupChatRoom(group.id, user.id);

      this.logger.log(
        `Added user ${userSlug} to group ${groupSlug} chat room by slug`,
      );
    } catch (error) {
      this.logger.error(
        `Error adding user ${userSlug} to group ${groupSlug} chat room: ${error.message}`,
      );
      throw error;
    }
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
      this.logger.debug(
        `User ${userId} is already verified as member of group ${groupId} chat room in this request`,
      );
      return;
    }

    // Initialize cache if needed
    if (!this.request.chatRoomMembershipCache) {
      this.request.chatRoomMembershipCache = {};
    }

    // Check if the user is a member of the group using the proper service
    try {
      // This will throw an error if the tenantId isn't available
      const groupMember = await this.groupMemberService.findGroupMemberByUserId(
        groupId,
        userId,
      );

      if (!groupMember) {
        this.logger.warn(
          `User ${userId} is not a member of group ${groupId}, cannot add to chat room`,
        );
        throw new Error(`User is not a member of this group`);
      }

      this.logger.log(
        `Verified user ${userId} is a member of group ${groupId} with role ${groupMember.groupRole?.name}`,
      );
    } catch (error) {
      // If there was an error checking membership, throw it
      if (error.message !== 'User is not a member of this group') {
        this.logger.error(
          `Error checking group membership: ${error.message}`,
          error.stack,
        );
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
    const isAlreadyMember = chatRoom.members?.some(
      (member) => member.id === userId,
    );

    if (isAlreadyMember) {
      // User is already in our DB as room member, mark cache and skip Matrix operations
      this.request.chatRoomMembershipCache[cacheKey] = true;
      this.logger.debug(
        `User ${userId} is already in database as member of chat room for group ${groupId}`,
      );
      return;
    }

    // Get the user with matrix credentials in one query
    const user = await this.userService.getUserById(userId);

    if (!user.matrixUserId || !user.matrixAccessToken) {
      throw new Error(
        `User with id ${userId} does not have valid Matrix credentials`,
      );
    }

    // First try joining directly (most efficient if the user is already invited)
    let joinSuccess = false;

    try {
      await this.matrixRoomService.joinRoom(
        chatRoom.matrixRoomId,
        user.matrixUserId,
        user.matrixAccessToken,
        user.matrixDeviceId,
      );
      joinSuccess = true;
      this.logger.debug(
        `User ${userId} joined group room ${chatRoom.matrixRoomId} directly`,
      );
    } catch (joinError) {
      // If join fails with "already in room", that's actually success
      if (
        joinError.message &&
        (joinError.message.includes('already in the room') ||
          joinError.message.includes('already a member') ||
          joinError.message.includes('already joined'))
      ) {
        joinSuccess = true;
        this.logger.debug(
          `User ${userId} is already a member of room ${chatRoom.matrixRoomId}`,
        );
      } else {
        // Only if direct join failed and it's not because they're already in the room, try invite+join
        this.logger.debug(
          `Direct join failed, trying invite+join flow: ${joinError.message}`,
        );

        try {
          await this.matrixRoomService.inviteUser(
            chatRoom.matrixRoomId,
            user.matrixUserId,
          );

          // Try joining again after invite
          await this.matrixRoomService.joinRoom(
            chatRoom.matrixRoomId,
            user.matrixUserId,
            user.matrixAccessToken,
            user.matrixDeviceId,
          );
          joinSuccess = true;
          this.logger.debug(
            `User ${userId} joined group room ${chatRoom.matrixRoomId} after invitation`,
          );
        } catch (error) {
          // Log but continue - they might already be in the room despite errors
          this.logger.warn(
            `Error in invite+join flow for user ${userId} to room ${chatRoom.matrixRoomId}: ${error.message}`,
          );
        }
      }
    }

    // If join was successful or we think they're already in the room, update our DB
    if (joinSuccess) {
      // Check if the user should have moderator privileges based on their group role
      if (user.matrixUserId) {
        try {
          // We've already checked the group member earlier
          const groupMember =
            await this.groupMemberService.findGroupMemberByUserId(
              groupId,
              userId,
            );

          if (groupMember && groupMember.groupRole) {
            // Only give moderator privileges to admins, owners, and moderators
            const isModeratorRole =
              groupMember.groupRole.name === GroupRole.Admin ||
              groupMember.groupRole.name === GroupRole.Owner ||
              groupMember.groupRole.name === GroupRole.Moderator;

            // Since we can't directly check permissions, we'll rely on the role names
            // Admin, Owner, and Moderator roles should have proper permissions
            const hasManageGroupPermission = isModeratorRole;

            if (isModeratorRole && hasManageGroupPermission) {
              this.logger.log(
                `User ${userId} has group role ${groupMember.groupRole.name} with management permissions, setting as moderator in room ${chatRoom.matrixRoomId}`,
              );

              // Set user as moderator in Matrix room
              await this.matrixRoomService.setRoomPowerLevels(
                chatRoom.matrixRoomId,
                { [user.matrixUserId]: 50 }, // 50 is moderator level
              );

              this.logger.log(
                `Successfully set ${user.matrixUserId} as moderator for group room ${chatRoom.matrixRoomId}`,
              );
            } else {
              this.logger.log(
                `User ${userId} with group role ${groupMember.groupRole.name} does not qualify for moderator privileges`,
              );
            }
          }
        } catch (error) {
          this.logger.warn(
            `Error checking/setting moderator privileges for user ${userId}: ${error.message}`,
          );
          // Continue anyway - basic join functionality is more important than moderator privileges
        }
      }

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
    await this.matrixRoomService.removeUserFromRoom(
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
   * Delete a chat room from the database
   */
  @Trace('chat-room.deleteChatRoom')
  async deleteChatRoom(roomId: number): Promise<void> {
    await this.initializeRepositories();

    const chatRoom = await this.chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['members'],
    });

    if (!chatRoom) {
      this.logger.warn(
        `Chat room with id ${roomId} not found, nothing to delete`,
      );
      return;
    }

    try {
      // First, remove the members association
      if (chatRoom.members && chatRoom.members.length > 0) {
        chatRoom.members = [];
        await this.chatRoomRepository.save(chatRoom);
      }

      // Then delete the chat room entity
      await this.chatRoomRepository.delete(roomId);
      this.logger.log(`Successfully deleted chat room with id ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting chat room with id ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete all chat rooms associated with a group
   */
  @Trace('chat-room.deleteGroupChatRooms')
  async deleteGroupChatRooms(groupId: number): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find all chat rooms for this group
      const chatRooms = await this.getGroupChatRooms(groupId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for group ${groupId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for group ${groupId}`,
      );

      // Delete each chat room
      for (const room of chatRooms) {
        await this.deleteChatRoom(room.id);
      }

      // Update the group to clear the matrixRoomId reference
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
      });

      if (group && group.matrixRoomId) {
        group.matrixRoomId = '';
        await this.groupRepository.save(group);
      }

      this.logger.log(
        `Successfully deleted all chat rooms for group ${groupId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for group ${groupId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete all chat rooms associated with an event
   */
  @Trace('chat-room.deleteEventChatRooms')
  async deleteEventChatRooms(eventId: number): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find all chat rooms for this event
      const chatRooms = await this.getEventChatRooms(eventId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for event ${eventId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for event ${eventId}`,
      );

      // Delete each chat room
      for (const room of chatRooms) {
        await this.deleteChatRoom(room.id);
      }

      // Update the event to clear the matrixRoomId reference
      const event = await this.eventRepository.findOne({
        where: { id: eventId },
      });

      if (event && event.matrixRoomId) {
        event.matrixRoomId = '';
        await this.eventRepository.save(event);
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
   * Delete a chat room from the database
   */
  @Trace('chat-room.deleteChatRoom')
  async deleteChatRoom(roomId: number): Promise<void> {
    await this.initializeRepositories();

    const chatRoom = await this.chatRoomRepository.findOne({
      where: { id: roomId },
      relations: ['members'],
    });

    if (!chatRoom) {
      this.logger.warn(
        `Chat room with id ${roomId} not found, nothing to delete`,
      );
      return;
    }

    try {
      // First, remove the members association
      if (chatRoom.members && chatRoom.members.length > 0) {
        chatRoom.members = [];
        await this.chatRoomRepository.save(chatRoom);
      }

      // Then delete the chat room entity
      await this.chatRoomRepository.delete(roomId);
      this.logger.log(`Successfully deleted chat room with id ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting chat room with id ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete all chat rooms associated with a group
   */
  @Trace('chat-room.deleteGroupChatRooms')
  async deleteGroupChatRooms(groupId: number): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find all chat rooms for this group
      const chatRooms = await this.getGroupChatRooms(groupId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for group ${groupId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for group ${groupId}`,
      );

      // Delete each chat room
      for (const room of chatRooms) {
        await this.deleteChatRoom(room.id);
      }

      // Update the group to clear the matrixRoomId reference
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
      });

      if (group && group.matrixRoomId) {
        group.matrixRoomId = '';
        await this.groupRepository.save(group);
      }

      this.logger.log(
        `Successfully deleted all chat rooms for group ${groupId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for group ${groupId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete all chat rooms associated with an event
   */
  @Trace('chat-room.deleteEventChatRooms')
  async deleteEventChatRooms(eventId: number): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find all chat rooms for this event
      const chatRooms = await this.getEventChatRooms(eventId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for event ${eventId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for event ${eventId}`,
      );

      // Delete each chat room
      for (const room of chatRooms) {
        await this.deleteChatRoom(room.id);
      }

      // Update the event to clear the matrixRoomId reference
      const event = await this.eventRepository.findOne({
        where: { id: eventId },
      });

      if (event && event.matrixRoomId) {
        event.matrixRoomId = '';
        await this.eventRepository.save(event);
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
          await this.chatRoomRepository.save(roomWithMembers);
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

      // Verify display name was set
      const displayNameCheck = await this.matrixUserService.getUserDisplayName(
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
        // Note: The direct API call functionality has been consolidated
        // into the MatrixUserService.setUserDisplayName method
        await this.matrixUserService.setUserDisplayName(
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
    return this.matrixMessageService.sendMessage({
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
    return this.matrixMessageService.getRoomMessages(
      chatRoom.matrixRoomId,
      limit,
      from,
      user.matrixUserId!, // Non-null assertion
    );
  }
}
