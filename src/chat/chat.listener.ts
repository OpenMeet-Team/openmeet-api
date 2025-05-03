import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { ContextIdFactory } from '@nestjs/core';
import { ChatRoomManagerInterface } from './interfaces/chat-room-manager.interface';

@Injectable()
export class ChatListener {
  private readonly logger = new Logger(ChatListener.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly chatRoomService: ChatRoomService,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject('ChatRoomManagerInterface')
    private readonly chatRoomManager: ChatRoomManagerInterface,
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
      const { eventId, userId } = await discussionService.getIdsFromSlugsWithTenant(
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

      // Use the tenant-aware ChatRoomManagerInterface implementation
      await this.chatRoomManager.addUserToEventChatRoom(
        eventId,
        userId,
        params.tenantId,
      );

      this.logger.log(
        `Added user ${params.userSlug} to event ${params.eventSlug} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      // Log the error but don't throw it - this allows the event processing to continue
      this.logger.error(
        `Failed to add user ${params.userSlug} to event ${params.eventSlug} chat room: ${error.message}`,
        error.stack,
      );
      // Don't rethrow the error - this allows the event processing to continue
      // The chat room will be created when the event is fully persisted
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
      const { eventId, userId } = await discussionService.getIdsFromSlugsWithTenant(
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

      // Use the tenant-aware ChatRoomManagerInterface implementation
      await this.chatRoomManager.removeUserFromEventChatRoom(
        eventId,
        userId,
        params.tenantId,
      );

      this.logger.log(
        `Removed user ${params.userSlug} from event ${params.eventSlug} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${params.userSlug} from event ${params.eventSlug} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.add')
  async handleChatGroupMemberAdd(params: { 
    groupId: number; 
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('chat.group.member.add event received', params);

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

      // For now, delegate to the legacy implementation through DiscussionService
      // In the future, we can extend ChatRoomManagerInterface to handle group operations
      await discussionService.addMemberToGroupDiscussion(
        params.groupId,
        params.userId,
      );
      
      this.logger.log(
        `Added user ${params.userId} to group ${params.groupId} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user ${params.userId} to group ${params.groupId} chat room: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('chat.group.member.remove')
  async handleChatGroupMemberRemove(params: {
    groupId: number;
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('chat.group.member.remove event received', params);

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

      // For now, delegate to the legacy implementation through DiscussionService
      // In the future, we can extend ChatRoomManagerInterface to handle group operations
      await discussionService.removeMemberFromGroupDiscussion(
        params.groupId,
        params.userId,
      );
      
      this.logger.log(
        `Removed user ${params.userId} from group ${params.groupId} chat room`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${params.userId} from group ${params.groupId} chat room: ${error.message}`,
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

      // Use the tenant-aware ChatRoomManagerInterface implementation
      await this.chatRoomManager.deleteEventChatRooms(
        params.eventId,
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
    groupId: number;
    groupSlug: string;
    tenantId?: string;
  }) {
    this.logger.log(
      `group.before_delete event received for group ${params.groupSlug}`,
    );

    try {
      // Validate tenant ID
      if (!params.tenantId) {
        this.logger.error('Tenant ID is required in the event payload');
        throw new Error('Tenant ID is required');
      }

      // Create a context for the discussion service
      const contextId = ContextIdFactory.create();

      // Resolve the discussion service with a new context
      const discussionService = await this.moduleRef.resolve(
        DiscussionService,
        contextId,
        { strict: false },
      );

      // For now, delegate to the legacy implementation through DiscussionService
      // In the future, we can extend ChatRoomManagerInterface to handle group operations
      await discussionService.cleanupGroupChatRooms(
        params.groupId,
        params.tenantId,
      );

      this.logger.log(
        `Successfully cleaned up chat rooms for group ${params.groupSlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to clean up chat rooms for group ${params.groupSlug}: ${error.message}`,
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
          // Verify the event still exists using our service-layer method
          const eventExists = await this.chatRoomManager.checkEventExists(
            eventId,
            tenantId,
          );

          if (!eventExists) {
            this.logger.warn(
              `Event with id ${eventId} no longer exists based on service check. Skipping chat room creation.`,
            );
            return;
          }

          // Create the chat room using our tenant-aware chat room manager
          await this.chatRoomManager.ensureEventChatRoom(
            eventId,
            userId,
            tenantId,
          );
          
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