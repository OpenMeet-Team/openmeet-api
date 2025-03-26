import { Injectable, Scope, Inject, Logger, forwardRef } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { MatrixCoreService } from '../../matrix/services/matrix-core.service';
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
import { ElastiCacheService } from '../../elasticache/elasticache.service';

@Injectable({ scope: Scope.REQUEST })
export class ChatRoomService {
  private readonly logger = new Logger(ChatRoomService.name);
  private readonly tracer = trace.getTracer('chat-room-service');
  private chatRoomRepository: Repository<ChatRoomEntity>;
  private eventRepository: Repository<EventEntity>;
  private groupRepository: Repository<GroupEntity>;
  private readonly LOCK_TTL = 30000; // 30 seconds lock TTL

  /**
   * Generates a standardized room name based on entity type and tenant
   * @param entityType The type of entity ('event', 'group', or 'direct')
   * @param entitySlug The slug of the entity (event or group slug, or for direct messages, a combination of user slugs)
   * @param tenantId The tenant ID
   * @returns A standardized room name
   */
  private generateRoomName(
    entityType: 'event' | 'group' | 'direct',
    entitySlug: string,
    tenantId: string,
  ): string {
    return `${entityType}-${entitySlug}-${tenantId}`;
  }

  /**
   * Generates a direct message room name using user slugs
   * @param user1Slug First user's slug
   * @param user2Slug Second user's slug
   * @param tenantId The tenant ID
   * @returns A standardized direct message room name
   */
  private generateDirectRoomName(
    user1Slug: string,
    user2Slug: string,
    tenantId: string,
  ): string {
    // Sort slugs to ensure consistent room naming regardless of who initiates the chat
    const slugs = [user1Slug, user2Slug].sort();
    return this.generateRoomName('direct', `${slugs[0]}-${slugs[1]}`, tenantId);
  }

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
    private readonly matrixCoreService: MatrixCoreService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private readonly elastiCacheService: ElastiCacheService,
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
   * Generic method to find or create a chat room for an entity (event or group)
   *
   * @param entityType Type of entity - 'event' or 'group'
   * @param entityId The ID of the entity
   */
  @Trace('chat-room.getOrCreateEntityChatRoom')
  private async getOrCreateEntityChatRoom(
    entityType: 'event' | 'group',
    entityId: number,
  ): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    this.logger.debug(
      `Looking for existing ${entityType} chat room for ID ${entityId}`,
    );

    // Use a transaction to ensure we don't have race conditions when checking/creating
    return await this.chatRoomRepository.manager.transaction(
      async (transactionalManager) => {
        // Check if a chat room already exists for this entity
        const whereCondition =
          entityType === 'event'
            ? { event: { id: entityId } }
            : { group: { id: entityId } };

        // Check within transaction for existing room
        const existingRoom = await transactionalManager.findOne(
          ChatRoomEntity,
          {
            where: whereCondition,
            lock: { mode: 'pessimistic_read' },
          },
        );

        if (existingRoom) {
          this.logger.debug(
            `Found existing ${entityType} chat room: ${existingRoom.id}`,
          );
          return existingRoom;
        }

        // If we need to create a new one, also check if entity already has a Matrix room ID
        if (entityType === 'group') {
          const group = await transactionalManager
            .createQueryBuilder()
            .select('g')
            .from(this.groupRepository.target, 'g')
            .where('g.id = :id', { id: entityId })
            .setLock('pessimistic_read')
            .getOne();

          if (group?.matrixRoomId) {
            this.logger.debug(
              `Group already has Matrix room ID ${group.matrixRoomId} but no chat room record. Creating record.`,
            );

            // Create a chat room entity for existing Matrix room
            const groupChatRoom = this.chatRoomRepository.create({
              name: this.generateRoomName(
                'group',
                group.slug,
                this.request.tenantId,
              ),
              topic: `Discussion for group: ${group.slug}`,
              matrixRoomId: group.matrixRoomId,
              type: ChatRoomType.GROUP,
              visibility:
                group.visibility === 'public'
                  ? ChatRoomVisibility.PUBLIC
                  : ChatRoomVisibility.PRIVATE,
              group: { id: group.id },
              settings: {
                historyVisibility: 'shared',
                guestAccess: false,
                requireInvitation: group.visibility !== 'public',
                encrypted: false,
              },
            });

            await transactionalManager.save(groupChatRoom);
            return groupChatRoom;
          }
        }

        // Get the entity info using the appropriate service
        const tenantId = this.request.tenantId;

        if (entityType === 'event') {
          const event = await this.eventQueryService.findById(
            entityId,
            tenantId,
          );

          if (!event) {
            throw new Error(`Event with id ${entityId} not found`);
          }

          if (!event.user || !event.user.id) {
            throw new Error(`Event with id ${entityId} has no creator`);
          }

          // Create a new chat room in the transaction
          // Helper function defined below
          return await this.createEventChatRoomInTransaction(
            transactionalManager,
            entityId,
            event.user.id,
          );
        } else {
          // For groups, still get full information for creating but use our transaction
          const group = await this.groupService.findOne(entityId);

          if (!group) {
            throw new Error(`Group with id ${entityId} not found`);
          }

          if (!group.createdBy || !group.createdBy.id) {
            throw new Error(`Group with id ${entityId} has no creator`);
          }

          // Create chat room within this transaction
          const creator = await transactionalManager.findOne(UserEntity, {
            where: { id: group.createdBy.id },
          });

          if (!creator) {
            throw new Error(`User with id ${group.createdBy.id} not found`);
          }

          // Generate the Matrix room name
          const roomName = this.generateRoomName('group', group.slug, tenantId);

          // Create the Matrix room
          this.logger.debug(`Creating Matrix room for group ${group.slug}`);
          const roomInfo = await this.matrixRoomService.createRoom({
            name: roomName,
            topic: `Discussion for group: ${group.slug}`,
            isPublic: group.visibility === 'public',
            encrypted: false,
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
            name: roomName,
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
              encrypted: false, // Disable encryption for group chat rooms
            },
          });

          // Save the chat room and update group in transaction
          await transactionalManager.save(chatRoom);

          // Update the group with Matrix room ID (still in same transaction)
          group.matrixRoomId = roomInfo.roomId;
          await transactionalManager.save(group);

          this.logger.log(
            `Created chat room for group ${group.slug} in tenant ${tenantId}`,
          );

          return chatRoom;
        }
      },
    );
  }

  /**
   * Helper method to create event chat room within transaction
   * @private
   */
  private async createEventChatRoomInTransaction(
    transactionalManager: any,
    eventId: number,
    creatorId: number,
  ): Promise<ChatRoomEntity> {
    // For now, this just delegates to the normal method
    // In the future, we could make this properly transactional
    return await this.createEventChatRoom(eventId, creatorId);
  }

  /**
   * Find or create a chat room for an event
   * This method is used by both tests and production code
   */
  @Trace('chat-room.getOrCreateEventChatRoom')
  async getOrCreateEventChatRoom(eventId: number): Promise<ChatRoomEntity> {
    return this.getOrCreateEntityChatRoom('event', eventId);
  }

  /**
   * Create a chat room for an event
   *
   * Future improvements:
   * - Accept event slug instead of ID
   * - This method could be merged with createEventChatRoomWithTenant
   * - Consider splitting room creation into a separate service
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
   *
   * Future improvements:
   * - Accept event slug instead of ID
   * - Share common room creation logic between events and groups
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
    // Using the event slug with tenant ID for a unique, stable identifier
    const roomName = this.generateRoomName(
      'event',
      event.slug,
      effectiveTenantId,
    );
    const roomInfo = await this.matrixRoomService.createRoom({
      name: roomName,
      topic: `Discussion for ${event.name}`,
      isPublic: event.visibility === 'public',
      isDirect: false,
      encrypted: false, // Disable encryption for event chat rooms
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
      name: roomName,
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
        encrypted: false, // Updated to disable encryption for event chat rooms
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
  /**
   * Helper method to check if a user is already verified in the cache
   * Supports both events and groups for future slug-based identification
   */
  private isUserAlreadyVerifiedInCache(
    entityId: number,
    userId: number,
    entityType: 'event' | 'group' = 'event',
  ): boolean {
    const cacheKey = this.getChatMembershipCacheKey(
      entityId,
      userId,
      entityType,
    );
    const isVerified = !!this.request.chatRoomMembershipCache?.[cacheKey];

    if (isVerified) {
      this.logger.debug(
        `User ${userId} is already verified as member of ${entityType} ${entityId} chat room in this request`,
      );
    }

    return isVerified;
  }

  /**
   * Helper method to get the cache key for a chat membership
   * Supports both events and groups for future slug-based identification
   */
  private getChatMembershipCacheKey(
    entityId: number,
    userId: number,
    entityType: 'event' | 'group' = 'event',
  ): string {
    return `${entityType}:${entityId}:user:${userId}`;
  }

  /**
   * Helper method to mark a user as in-progress in the cache
   * Supports both events and groups for future slug-based identification
   */
  private markUserAsInProgress(
    entityId: number,
    userId: number,
    entityType: 'event' | 'group' = 'event',
  ): void {
    // Initialize cache if needed
    if (!this.request.chatRoomMembershipCache) {
      this.request.chatRoomMembershipCache = {};
    }

    const cacheKey = this.getChatMembershipCacheKey(
      entityId,
      userId,
      entityType,
    );
    this.request.chatRoomMembershipCache[cacheKey] = 'in-progress';
  }

  /**
   * Helper method to mark a user as complete in the cache
   * Supports both events and groups for future slug-based identification
   */
  private markUserAsComplete(
    entityId: number,
    userId: number,
    entityType: 'event' | 'group' = 'event',
  ): void {
    const cacheKey = this.getChatMembershipCacheKey(
      entityId,
      userId,
      entityType,
    );
    this.request.chatRoomMembershipCache[cacheKey] = true;
  }

  /**
   * Helper method to get a chat room for an event
   */
  @Trace('chat-room.getChatRoomForEvent')
  private async getChatRoomForEvent(eventId: number): Promise<ChatRoomEntity> {
    const chatRoom = await this.chatRoomRepository.findOne({
      where: { event: { id: eventId } },
    });

    if (!chatRoom) {
      throw new Error(`Chat room for event with id ${eventId} not found`);
    }

    return chatRoom;
  }

  // Removed redundant ensureUserWithMatrixCredentials method - using ensureUserHasMatrixCredentials directly

  /**
   * Helper method to add a user to a Matrix room and return whether they joined
   * Handles both invite and join operations with appropriate error handling
   *
   * @param matrixRoomId The Matrix room ID
   * @param user The user entity with Matrix credentials
   * @param options Optional parameters for customizing the join behavior
   * @returns True if the user joined or is already a member, false otherwise
   */
  @Trace('chat-room.addUserToMatrixRoom')
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
    if (!user.matrixUserId) {
      this.logger.warn(
        `User ${user.id} does not have a Matrix user ID, cannot join room`,
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
   * Future improvement: Accept slugs instead of IDs
   *
   * @param entityId The event or group ID
   * @param userId The user ID
   * @param matrixUserId The Matrix user ID
   * @param matrixRoomId The Matrix room ID
   * @param entityType Whether this is an 'event' or 'group'
   */
  @Trace('chat-room.handleModeratorPermissions')
  private async handleModeratorPermissions(
    entityId: number,
    userId: number,
    matrixUserId: string,
    matrixRoomId: string,
    entityType: 'event' | 'group' = 'event',
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
   * Works for any chat room type (event, group, direct)
   *
   * Future improvements:
   * - Accept user slug instead of ID
   * - Implement batching for adding multiple users at once
   */
  @Trace('chat-room.addUserToRoomInDatabase')
  private async addUserToRoomInDatabase(
    roomId: number,
    userId: number,
  ): Promise<void> {
    await this.initializeRepositories();

    const roomWithMembers = await this.chatRoomRepository.findOne({
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
    const user = await this.userService.getUserById(userId);

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
      await this.chatRoomRepository.save(roomWithMembers);
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
   * Add a user to an event chat room
   */
  @Trace('chat-room.addUserToEventChatRoom')
  async addUserToEventChatRoom(eventId: number, userId: number): Promise<void> {
    await this.initializeRepositories();

    // Check cache to avoid duplicates
    if (this.isUserAlreadyVerifiedInCache(eventId, userId)) {
      return;
    }

    // Mark as in-progress
    this.markUserAsInProgress(eventId, userId);

    try {
      // Get event through service layer
      const event = await this.eventQueryService.findById(
        eventId,
        this.request.tenantId,
      );
      if (!event) {
        throw new Error(`Event with id ${eventId} not found`);
      }

      // Get chat room
      const chatRoom = await this.getChatRoomForEvent(eventId);

      // First check if the user is already a member in the database
      // This helps avoid redundant Matrix API calls across requests
      const roomWithMembers = await this.chatRoomRepository.findOne({
        where: { id: chatRoom.id },
        relations: ['members'],
      });

      if (
        roomWithMembers &&
        roomWithMembers.members.some((member) => member.id === userId)
      ) {
        this.logger.debug(
          `User ${userId} is already a database member of room ${chatRoom.id}, skipping Matrix join`,
        );
        // Mark as verified in request cache
        this.markUserAsComplete(eventId, userId);
        return;
      }

      // User not yet a member, continue with Matrix operations
      const user = await this.ensureUserHasMatrixCredentials(userId);

      // Handle Matrix room operations
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
        );
      }

      // Update database relationship
      await this.addUserToRoomInDatabase(chatRoom.id, userId);

      // Mark as completed
      this.markUserAsComplete(eventId, userId);
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userId} to event ${eventId} chat room: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Internal helper to remove a user from a chat room
   * This will be compatible with future slug-based identification
   * @param chatRoom The chat room entity
   * @param userId The user ID to remove
   */
  @Trace('chat-room.removeUserFromChatRoom')
  private async removeUserFromChatRoom(
    chatRoom: ChatRoomEntity,
    userId: number,
  ): Promise<void> {
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
   * Remove a user from an event chat room
   * Future improvement: Accept event slug instead of ID
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

    // Delegate to shared helper method
    await this.removeUserFromChatRoom(chatRoom, userId);
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
    return this.getOrCreateEntityChatRoom('group', groupId);
  }

  /**
   * Create a chat room for a group
   * Uses tenant ID from request context
   *
   * Future improvements:
   * - Accept group slug instead of ID
   * - Create a consistent pattern for room creation between events and groups
   */
  @Trace('chat-room.createGroupChatRoom')
  async createGroupChatRoom(
    groupId: number,
    creatorId: number,
  ): Promise<ChatRoomEntity> {
    await this.initializeRepositories();

    // Generate a lock key specific to this group and tenant
    const tenantId = this.request.tenantId;
    const lockKey = `matrix:room:create:group:${groupId}:tenant:${tenantId}`;

    // Use the distributed lock pattern for the creation process
    const result = await this.elastiCacheService.withLock<ChatRoomEntity>(
      lockKey,
      async () => {
        // Get the group using the GroupService (tenant-aware through DI)
        const group = await this.groupService.findOne(groupId);

        if (!group) {
          throw new Error(`Group with id ${groupId} not found`);
        }

        // Check if a chat room already exists for this group
        const existingRoom = await this.chatRoomRepository.findOne({
          where: { group: { id: groupId } },
        });

        if (existingRoom) {
          this.logger.log(
            `Using existing chat room for group ${group.slug} (${groupId}) in tenant ${tenantId}`,
          );
          return existingRoom;
        }

        // If the group already has a Matrix room ID but no chat room record,
        // create a chat room record using the existing Matrix room ID
        if (group.matrixRoomId) {
          this.logger.log(
            `Group ${group.slug} already has Matrix room ID ${group.matrixRoomId}, creating chat room record`,
          );

          const chatRoom = this.chatRoomRepository.create({
            name: this.generateRoomName('group', group.slug, tenantId),
            topic: `Discussion for group: ${group.slug}`,
            matrixRoomId: group.matrixRoomId,
            type: ChatRoomType.GROUP,
            visibility:
              group.visibility === 'public'
                ? ChatRoomVisibility.PUBLIC
                : ChatRoomVisibility.PRIVATE,
            group,
            settings: {
              historyVisibility: 'shared',
              guestAccess: false,
              requireInvitation: group.visibility !== 'public',
              encrypted: false,
            },
          });

          // Save the chat room
          return await this.chatRoomRepository.save(chatRoom);
        }

        // Get the creator user using the UserService (tenant-aware through DI)
        const creator = await this.userService.getUserById(creatorId);

        // Create a chat room in Matrix
        // Using the group slug with tenant ID for a unique, stable identifier
        const roomName = this.generateRoomName('group', group.slug, tenantId);
        const roomInfo = await this.matrixRoomService.createRoom({
          name: roomName,
          topic: `Discussion for group: ${group.slug}`,
          isPublic: group.visibility === 'public',
          isDirect: false,
          encrypted: false, // Disable encryption for group chat rooms
          // Add the group creator as the first member
          inviteUserIds: [creator.matrixUserId].filter(
            (id) => !!id,
          ) as string[],
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
          name: roomName,
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
            encrypted: false, // Disable encryption for group chat rooms
          },
        });

        try {
          // Use a transaction to ensure atomicity
          await this.chatRoomRepository.manager.transaction(
            async (transactionalEntityManager) => {
              // Save the chat room
              await transactionalEntityManager.save(chatRoom);

              // Get group again to ensure we have latest version before updating
              // Use createQueryBuilder to avoid issues with FOR UPDATE + outer joins
              const updatedGroup = await transactionalEntityManager
                .createQueryBuilder()
                .select('g')
                .from(this.groupRepository.target, 'g')
                .where('g.id = :id', { id: group.id })
                .setLock('pessimistic_write')
                .getOne();

              if (!updatedGroup) {
                throw new Error(
                  `Group with id ${group.id} not found during transaction`,
                );
              }

              // Check if the Matrix room ID is already set
              if (updatedGroup.matrixRoomId) {
                this.logger.warn(
                  `Group ${group.slug} already has Matrix room ID ${updatedGroup.matrixRoomId}, not overwriting with ${roomInfo.roomId}`,
                );
                return;
              }

              // Update the group with the Matrix room ID
              updatedGroup.matrixRoomId = roomInfo.roomId;
              await transactionalEntityManager.save(updatedGroup);
            },
          );
        } catch (error) {
          this.logger.error(
            `Error saving chat room or updating group: ${error.message}`,
            error.stack,
          );
          throw error;
        }

        this.logger.log(
          `Created chat room for group ${group.slug} in tenant ${tenantId}`,
        );

        return chatRoom;
      },
      60000, // 60-second lock TTL for the room creation process
    );

    // If result is null, we couldn't acquire the lock
    if (result === null) {
      this.logger.warn(
        `Could not acquire lock for creating Matrix room for group ${groupId} in tenant ${tenantId}. Trying to fetch existing room...`,
      );

      // Check if another process has created the room while we were waiting
      const existingRoom = await this.chatRoomRepository.findOne({
        where: { group: { id: groupId } },
      });

      if (existingRoom) {
        return existingRoom;
      }

      // If still no room, throw an error
      throw new Error(
        `Couldn't create Matrix room for group ${groupId} - failed to acquire lock and no existing room found`,
      );
    }

    return result;
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
   * Helper method to find an existing direct chat room between two users
   *
   * @param user1Id First user ID
   * @param user2Id Second user ID
   * @returns The existing chat room or null if none exists
   */
  @Trace('chat-room.findExistingDirectChatRoom')
  private async findExistingDirectChatRoom(
    user1Id: number,
    user2Id: number,
  ): Promise<ChatRoomEntity | null> {
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

    return null;
  }

  /**
   * Find or create a direct chat room between two users
   * This method is used by both tests and production code
   *
   * Future improvements:
   * - Accept user slugs instead of IDs
   * - Implement better error handling for Matrix room creation failures
   */
  @Trace('chat-room.getOrCreateDirectChatRoom')
  async getOrCreateDirectChatRoom(
    user1Id: number,
    user2Id: number,
  ): Promise<ChatRoomEntity> {
    // First try to find an existing room
    const existingRoom = await this.findExistingDirectChatRoom(
      user1Id,
      user2Id,
    );

    if (existingRoom) {
      return existingRoom;
    }

    // Get both users using the UserService (tenant-aware through DI)
    const user1 = await this.userService.getUserById(user1Id);
    const user2 = await this.userService.getUserById(user2Id);

    if (!user1 || !user2) {
      throw new Error(`One or both users not found`);
    }

    // Ensure first user has Matrix credentials
    await this.ensureUserHasMatrixCredentials(user1Id);

    // Create a direct room in Matrix
    const tenantId = this.request.tenantId;
    const roomName = this.generateDirectRoomName(
      user1.slug,
      user2.slug,
      tenantId,
    );

    const roomInfo = await this.matrixRoomService.createRoom({
      name: roomName,
      topic: 'Direct message conversation',
      isPublic: false,
      isDirect: true,
      encrypted: false, // Disable encryption for direct messages
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
        encrypted: false, // Disable encryption for direct messages
      },
    });

    // Save the chat room
    const savedRoom = await this.chatRoomRepository.save(chatRoom);

    this.logger.log(
      `Created direct chat room between users ${user1Id} and ${user2Id} in tenant ${this.request.tenantId}`,
    );

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

    // Check cache to avoid duplicates
    if (this.isUserAlreadyVerifiedInCache(groupId, userId, 'group')) {
      return;
    }

    // Mark as in-progress
    this.markUserAsInProgress(groupId, userId, 'group');

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
      this.markUserAsComplete(groupId, userId, 'group');
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
        // Use shared helper method
        await this.handleModeratorPermissions(
          groupId,
          userId,
          user.matrixUserId,
          chatRoom.matrixRoomId,
          'group',
        );
      }

      // Add the user to the chat room members in our database
      if (!chatRoom.members) {
        chatRoom.members = [];
      }

      chatRoom.members.push(user);
      await this.chatRoomRepository.save(chatRoom);

      // Cache the result for this request
      this.markUserAsComplete(groupId, userId, 'group');
    }
  }

  /**
   * Remove a user from a group chat room
   * Future improvement: Accept group slug instead of ID
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

    // Delegate to shared helper method
    await this.removeUserFromChatRoom(chatRoom, userId);
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
      // First, attempt to delete the Matrix room
      if (chatRoom.matrixRoomId) {
        try {
          // Use the Matrix room service's dedicated room deletion method
          const deleted = await this.matrixRoomService.deleteRoom(
            chatRoom.matrixRoomId,
          );

          if (deleted) {
            this.logger.log(
              `Successfully deleted Matrix room ${chatRoom.matrixRoomId} using the Matrix admin API`,
            );
          } else {
            this.logger.warn(
              `Failed to delete Matrix room ${chatRoom.matrixRoomId}, continuing with database cleanup`,
            );
          }
        } catch (matrixError) {
          this.logger.error(
            `Error deleting Matrix room ${chatRoom.matrixRoomId}: ${matrixError.message}`,
          );
          // Continue with database cleanup even if Matrix room deletion fails
        }
      }

      // Then remove the members association
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
   * Generic method to delete all chat rooms for an entity (event or group)
   *
   * @param entityType Type of entity - 'event' or 'group'
   * @param entityId The ID of the entity
   */
  @Trace('chat-room.deleteEntityChatRooms')
  private async deleteEntityChatRooms(
    entityType: 'event' | 'group',
    entityId: number,
  ): Promise<void> {
    await this.initializeRepositories();

    try {
      // Find all chat rooms for this entity
      const chatRooms =
        entityType === 'event'
          ? await this.getEventChatRooms(entityId)
          : await this.getGroupChatRooms(entityId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.log(`No chat rooms found for ${entityType} ${entityId}`);
        return;
      }

      this.logger.log(
        `Deleting ${chatRooms.length} chat rooms for ${entityType} ${entityId}`,
      );

      // Delete each chat room
      for (const room of chatRooms) {
        await this.deleteChatRoom(room.id);
      }

      // Update the entity to clear the matrixRoomId reference
      if (entityType === 'event') {
        // Use EventQueryService to update the event
        const event = await this.eventQueryService.findById(
          entityId,
          this.request.tenantId,
        );
        if (event && event.matrixRoomId) {
          // Would use an event service update method if available
          const eventEntity = await this.eventRepository.findOne({
            where: { id: entityId },
          });
          if (eventEntity) {
            eventEntity.matrixRoomId = '';
            await this.eventRepository.save(eventEntity);
          }
        }
      } else {
        // Use GroupService to update the group
        const group = await this.groupService.findOne(entityId);
        if (group && group.matrixRoomId) {
          // Use slug instead of ID since GroupService likely expects a slug
          await this.groupService.update(group.slug, { matrixRoomId: '' });
        }
      }

      this.logger.log(
        `Successfully deleted all chat rooms for ${entityType} ${entityId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error deleting chat rooms for ${entityType} ${entityId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Delete all chat rooms associated with a group
   */
  @Trace('chat-room.deleteGroupChatRooms')
  async deleteGroupChatRooms(groupId: number): Promise<void> {
    return this.deleteEntityChatRooms('group', groupId);
  }

  /**
   * Delete all chat rooms associated with an event
   */
  @Trace('chat-room.deleteEventChatRooms')
  async deleteEventChatRooms(eventId: number): Promise<void> {
    return this.deleteEntityChatRooms('event', eventId);
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
