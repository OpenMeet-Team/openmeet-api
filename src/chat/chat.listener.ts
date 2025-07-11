import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ContextIdFactory } from '@nestjs/core';
import { ChatRoomManagerInterface } from './interfaces/chat-room-manager.interface';
import { UserService } from '../user/user.service';
import { GroupService } from '../group/group.service';

@Injectable()
export class ChatListener {
  private readonly logger = new Logger(ChatListener.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly chatRoomService: ChatRoomService,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject('ChatRoomManagerInterface')
    private readonly chatRoomManager: ChatRoomManagerInterface,
    private readonly userService: UserService,
    private readonly groupService: GroupService,
  ) {}

  @OnEvent('chat.event.member.add')
  async handleChatEventMemberAdd(params: {
    eventSlug: string;
    userSlug: string;
    tenantId?: string;
  }) {
    this.logger.log('chat.event.member.add event received', params);

    try {
      // Tenant ID is required in all environments
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // Create a context for the discussion service (for backward compatibility)
      const contextId = ContextIdFactory.create();

      // Resolve the discussion service with a new context
      const discussionService = await this.moduleRef.resolve(
        DiscussionService,
        contextId,
        { strict: false },
      );

      // Use the IDs from slugs with the tenant ID
      const { eventId, userId } =
        await discussionService.getIdsFromSlugsWithTenant(
          params.eventSlug,
          params.userSlug,
          params.tenantId,
        );

      if (!eventId || !userId) {
        this.logger.error(
          `Could not find event or user with slugs: event=${params.eventSlug}, user=${params.userSlug}`,
        );
        return;
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slug params
      await this.chatRoomManager.addUserToEventChatRoom(
        params.eventSlug,
        params.userSlug,
        params.tenantId,
      );

      this.logger.log(
        `Added user ${params.userSlug} to event ${params.eventSlug} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      // ❌ CRITICAL ERROR: Matrix bot auto-invitation failed
      // This means the user WON'T be able to access historical messages!
      this.logger.error(
        `🚨 MATRIX BOT AUTO-INVITATION FAILED for user ${params.userSlug} in event ${params.eventSlug}`,
        {
          error: error.message,
          stack: error.stack,
          eventSlug: params.eventSlug,
          userSlug: params.userSlug,
          tenantId: params.tenantId,
          impact:
            'User will NOT have access to Matrix room and historical messages',
          action: 'Manual Matrix room invitation may be required',
        },
      );

      // Still don't rethrow to avoid breaking attendance flow,
      // but make the failure highly visible and actionable
      console.error(
        `❌ MATRIX AUTO-INVITATION FAILURE: User ${params.userSlug} not invited to Matrix room for event ${params.eventSlug}`,
      );
      console.error(
        `❌ IMPACT: Historical messages will NOT be accessible to this user`,
      );
      console.error(`❌ ERROR: ${error.message}`);
    }
  }

  @OnEvent('chat.event.member.remove')
  async handleChatEventMemberRemove(params: {
    eventSlug: string;
    userSlug: string;
    tenantId?: string;
  }) {
    this.logger.log('chat.event.member.remove event received', params);

    try {
      // Tenant ID is required in all environments
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // Create a context for the discussion service (for backward compatibility)
      const contextId = ContextIdFactory.create();

      // Resolve the discussion service with a new context
      const discussionService = await this.moduleRef.resolve(
        DiscussionService,
        contextId,
        { strict: false },
      );

      // Get IDs from slugs
      const { eventId, userId } =
        await discussionService.getIdsFromSlugsWithTenant(
          params.eventSlug,
          params.userSlug,
          params.tenantId,
        );

      if (!eventId || !userId) {
        this.logger.error(
          `Could not find event or user with slugs: event=${params.eventSlug}, user=${params.userSlug}`,
        );
        return;
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slug params
      await this.chatRoomManager.removeUserFromEventChatRoom(
        params.eventSlug,
        params.userSlug,
        params.tenantId,
      );

      this.logger.log(
        `Removed user ${params.userSlug} from event ${params.eventSlug} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      // ❌ CRITICAL ERROR: Matrix bot user removal failed
      this.logger.error(
        `🚨 MATRIX BOT USER REMOVAL FAILED for user ${params.userSlug} in event ${params.eventSlug}`,
        {
          error: error.message,
          stack: error.stack,
          eventSlug: params.eventSlug,
          userSlug: params.userSlug,
          tenantId: params.tenantId,
          impact: 'User may retain Matrix room access when they should not',
        },
      );

      // Make Matrix bot failures visible in console
      console.error(
        `❌ MATRIX USER REMOVAL FAILURE: User ${params.userSlug} not removed from Matrix room for event ${params.eventSlug}`,
      );
      console.error(`❌ ERROR: ${error.message}`);
    }
  }

  @OnEvent('chat.group.member.add')
  async handleChatGroupMemberAdd(params: {
    groupSlug?: string;
    groupId?: number;
    userSlug?: string;
    userId?: number;
    tenantId?: string;
  }) {
    this.logger.log('chat.group.member.add event received', params);

    try {
      // Tenant ID is required in all environments
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // If we have slugs but no IDs, we need to resolve them
      let groupId = params.groupId;
      let userId = params.userId;

      // Create a context for the discussion service (when we need to resolve slugs)
      if (!groupId || !userId) {
        const contextId = ContextIdFactory.create();
        const discussionService = await this.moduleRef.resolve(
          DiscussionService,
          contextId,
          { strict: false },
        );

        // If we have slugs, use them to get IDs
        if (params.groupSlug && params.userSlug) {
          const { groupId: resolvedGroupId, userId: resolvedUserId } =
            await discussionService.getGroupAndUserIdsFromSlugsWithTenant(
              params.groupSlug,
              params.userSlug,
              params.tenantId,
            );

          groupId = resolvedGroupId;
          userId = resolvedUserId;
        } else if (!groupId && params.groupSlug) {
          // Just need to resolve the group
          groupId = await discussionService.getGroupIdFromSlugWithTenant(
            params.groupSlug,
            params.tenantId,
          );
        } else if (!userId && params.userSlug) {
          // Just need to resolve the user
          userId = await discussionService.getUserIdFromSlugWithTenant(
            params.userSlug,
            params.tenantId,
          );
        }
      }

      // Check if we have all required parameters now
      if (!groupId || !userId) {
        throw new Error(
          'Could not resolve group ID or user ID from provided parameters',
        );
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slugs
      // If we have group and user slugs, use them directly for better context preservation
      if (params.groupSlug && params.userSlug) {
        await this.chatRoomManager.addUserToGroupChatRoom(
          params.groupSlug,
          params.userSlug,
          params.tenantId,
        );
      } else {
        // We need to look up the slugs from IDs
        const group = await this.groupService.findOne(groupId);
        const user = await this.userService.findById(userId, params.tenantId);

        if (!group || !user) {
          throw new Error(`Could not find group or user to add to chat room`);
        }

        await this.chatRoomManager.addUserToGroupChatRoom(
          group.slug,
          user.slug,
          params.tenantId,
        );
      }

      // Log using the most descriptive identifiers we have
      const userIdentifier = params.userSlug || `id:${userId}`;
      const groupIdentifier = params.groupSlug || `id:${groupId}`;

      this.logger.log(
        `Added user ${userIdentifier} to group ${groupIdentifier} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      // Use the most descriptive identifiers for the error message
      const userIdentifier = params.userSlug || params.userId || 'unknown';
      const groupIdentifier = params.groupSlug || params.groupId || 'unknown';

      this.logger.error(
        `Failed to add user ${userIdentifier} to group ${groupIdentifier} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.remove')
  async handleChatGroupMemberRemove(params: {
    groupSlug?: string;
    groupId?: number;
    userSlug?: string;
    userId?: number;
    tenantId?: string;
  }) {
    this.logger.log('chat.group.member.remove event received', params);

    try {
      // Tenant ID is required in all environments
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // If we have slugs but no IDs, we need to resolve them
      let groupId = params.groupId;
      let userId = params.userId;

      // Create a context for the discussion service (when we need to resolve slugs)
      if (!groupId || !userId) {
        const contextId = ContextIdFactory.create();
        const discussionService = await this.moduleRef.resolve(
          DiscussionService,
          contextId,
          { strict: false },
        );

        // If we have slugs, use them to get IDs
        if (params.groupSlug && params.userSlug) {
          const { groupId: resolvedGroupId, userId: resolvedUserId } =
            await discussionService.getGroupAndUserIdsFromSlugsWithTenant(
              params.groupSlug,
              params.userSlug,
              params.tenantId,
            );

          groupId = resolvedGroupId;
          userId = resolvedUserId;
        } else if (!groupId && params.groupSlug) {
          // Just need to resolve the group
          groupId = await discussionService.getGroupIdFromSlugWithTenant(
            params.groupSlug,
            params.tenantId,
          );
        } else if (!userId && params.userSlug) {
          // Just need to resolve the user
          userId = await discussionService.getUserIdFromSlugWithTenant(
            params.userSlug,
            params.tenantId,
          );
        }
      }

      // Check if we have all required parameters now
      if (!groupId || !userId) {
        throw new Error(
          'Could not resolve group ID or user ID from provided parameters',
        );
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slugs
      // If we have group and user slugs, use them directly for better context preservation
      if (params.groupSlug && params.userSlug) {
        await this.chatRoomManager.removeUserFromGroupChatRoom(
          params.groupSlug,
          params.userSlug,
          params.tenantId,
        );
      } else {
        // We need to look up the slugs from IDs
        const group = await this.groupService.findOne(groupId);
        const user = await this.userService.findById(userId, params.tenantId);

        if (!group || !user) {
          throw new Error(
            `Could not find group or user to remove from chat room`,
          );
        }

        await this.chatRoomManager.removeUserFromGroupChatRoom(
          group.slug,
          user.slug,
          params.tenantId,
        );
      }

      // Log using the most descriptive identifiers we have
      const userIdentifier = params.userSlug || `id:${userId}`;
      const groupIdentifier = params.groupSlug || `id:${groupId}`;

      this.logger.log(
        `Removed user ${userIdentifier} from group ${groupIdentifier} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      // Use the most descriptive identifiers for the error message
      const userIdentifier = params.userSlug || params.userId || 'unknown';
      const groupIdentifier = params.groupSlug || params.groupId || 'unknown';

      this.logger.error(
        `Failed to remove user ${userIdentifier} from group ${groupIdentifier} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.before_delete')
  async handleEventBeforeDelete(params: {
    eventId: number;
    eventSlug: string;
    tenantId?: string;
    skipChatCleanup?: boolean;
  }) {
    this.logger.log(
      `event.before_delete event received for event ${params.eventSlug}`,
    );

    // Skip cleanup if explicitly told to (when EventManagementService already did it)
    if (params.skipChatCleanup) {
      this.logger.log(
        `Skipping chat room cleanup for event ${params.eventSlug} as it was already done by EventManagementService`,
      );
      return;
    }

    try {
      // Validate tenant ID
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slug
      await this.chatRoomManager.deleteEventChatRooms(
        params.eventSlug,
        params.tenantId,
      );

      this.logger.log(
        `Successfully cleaned up chat rooms for event ${params.eventSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clean up chat rooms for event ${params.eventSlug}: ${error.message}`,
        error.stack,
      );
      // We don't rethrow the error here to prevent blocking the event deletion
      // The event deletion should proceed even if chat room cleanup fails
    }
  }

  @OnEvent('group.before_delete')
  async handleGroupBeforeDelete(params: {
    groupId?: number;
    groupSlug?: string;
    tenantId?: string;
    skipChatCleanup?: boolean;
  }) {
    // Use the most descriptive identifier we have for logging
    const groupIdentifier =
      params.groupSlug || (params.groupId ? `id:${params.groupId}` : 'unknown');
    this.logger.log(
      `group.before_delete event received for group ${groupIdentifier}`,
    );

    // Skip cleanup if explicitly told to
    if (params.skipChatCleanup) {
      this.logger.log(
        `Skipping chat room cleanup for group ${groupIdentifier} as requested`,
      );
      return;
    }

    try {
      // Validate tenant ID
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // If we only have a slug, we need to resolve the ID
      let groupId = params.groupId;
      if (!groupId && params.groupSlug) {
        const contextId = ContextIdFactory.create();
        const discussionService = await this.moduleRef.resolve(
          DiscussionService,
          contextId,
          { strict: false },
        );

        // Resolve the group ID from the slug
        groupId = await discussionService.getGroupIdFromSlugWithTenant(
          params.groupSlug,
          params.tenantId,
        );
      }

      // Check if we have a valid group ID
      if (!groupId) {
        throw new Error('Could not resolve group ID from provided parameters');
      }

      // Use the tenant-aware ChatRoomManagerInterface implementation with slug
      if (params.groupSlug) {
        await this.chatRoomManager.deleteGroupChatRooms(
          params.groupSlug,
          params.tenantId,
        );
      } else {
        // We need to find the group slug
        const group = await this.groupService.findOne(groupId);
        if (!group) {
          throw new Error(`Could not find group with ID ${groupId}`);
        }

        await this.chatRoomManager.deleteGroupChatRooms(
          group.slug,
          params.tenantId,
        );
      }

      this.logger.log(
        `Successfully cleaned up chat rooms for group ${groupIdentifier}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clean up chat rooms for group ${groupIdentifier}: ${error.message}`,
        error.stack,
      );
      // We don't rethrow the error here to prevent blocking the group deletion
      // The group deletion should proceed even if chat room cleanup fails
    }
  }

  @OnEvent('chat.event.created')
  async handleChatEventCreated(params: {
    eventSlug: string;
    userSlug?: string; // Make userSlug optional for tests
    userId?: number; // Allow userId as an alternative to userSlug
    eventName: string;
    eventVisibility: string;
    tenantId?: string;
  }) {
    this.logger.log('chat.event.created event received');
    this.logger.log('Full params received:', JSON.stringify(params, null, 2));

    try {
      // First check the tenantId
      this.logger.log(
        `TenantID check: ${params.tenantId ? 'PRESENT' : 'MISSING'}`,
      );
      this.logger.log(`TenantID value: "${params.tenantId}"`);

      // Tenant ID is required in all environments
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      const tenantId = params.tenantId;
      this.logger.log(`Using tenant ID: ${tenantId}`);

      // Double check all required parameters
      if (!params.eventSlug) {
        this.logger.error('Event slug is required');
        throw new Error('Event slug is required');
      }

      if (!params.userSlug && !params.userId) {
        // Just log a warning instead of throwing an error, and return early
        this.logger.warn(
          'Missing both userSlug and userId for event creation, skipping chat room creation',
        );
        return;
      }

      let eventId: number | null = null;
      let userId: number | null = null;

      // Handle looking up by userId if userSlug is not provided
      if (!params.userSlug && params.userId) {
        this.logger.log(`Using userId ${params.userId} instead of userSlug`);
        userId = params.userId;

        // Find the event by slug
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(tenantId);
        const eventRepo = dataSource.getRepository(EventEntity);
        const event = await eventRepo.findOne({
          where: { slug: params.eventSlug },
        });

        if (event) {
          eventId = event.id;
        } else {
          this.logger.error(`Event with slug ${params.eventSlug} not found`);
          throw new Error(`Event not found: ${params.eventSlug}`);
        }
      } else if (params.userSlug) {
        // Use the standard flow with slugs
        // Create a context for the discussion service
        const contextId = ContextIdFactory.create();

        // Resolve the discussion service with a new context
        const discussionService = await this.moduleRef.resolve(
          DiscussionService,
          contextId,
          { strict: false },
        );

        const result = await discussionService.getIdsFromSlugsWithTenant(
          params.eventSlug,
          params.userSlug,
          tenantId,
        );

        eventId = result.eventId;
        userId = result.userId;
      } else if (params.userId) {
        // We have userId but no userSlug
        userId = params.userId;
      } else {
        // Instead of throwing an error, just log a warning and exit
        this.logger.warn(
          'Either userSlug or userId is required for chat room creation, skipping',
        );
        return;
      }

      if (eventId && userId) {
        try {
          // Verify the event still exists using our service-layer method with slug
          const eventExists = await this.chatRoomManager.checkEventExists(
            params.eventSlug,
            tenantId,
          );

          if (!eventExists) {
            this.logger.warn(
              `Event with slug ${params.eventSlug} no longer exists based on service check. Skipping chat room creation.`,
            );
            return;
          }

          // If we have the user's slug, use it directly
          if (params.userSlug) {
            // Create the chat room using our tenant-aware chat room manager with slugs
            await this.chatRoomManager.ensureEventChatRoom(
              params.eventSlug,
              params.userSlug,
              tenantId,
            );
          } else {
            // We need to find the user's slug
            const user = await this.userService.findById(userId, tenantId);
            if (!user) {
              throw new Error(`Could not find user with ID ${userId}`);
            }

            // Create the chat room using our tenant-aware chat room manager with slugs
            await this.chatRoomManager.ensureEventChatRoom(
              params.eventSlug,
              user.slug,
              tenantId,
            );
          }

          this.logger.log(
            `Created chat room for event ${params.eventSlug} by user ID ${userId} in tenant ${tenantId}`,
          );
        } catch (error) {
          this.logger.error(
            `Error verifying event existence (id: ${eventId}): ${error.message}`,
          );
          // Don't attempt to create a chat room if we can't verify the event exists
          return;
        }
      } else {
        this.logger.warn(
          `Could not get valid eventId and userId for event ${params.eventSlug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create chat room for event ${params.eventSlug}: ${error.message}`,
        error.stack,
      );
    }
  }
}
