import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DiscussionService } from './services/discussion.service';
import { ChatRoomService } from './rooms/chat-room.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

@Injectable()
export class ChatListener {
  private readonly logger = new Logger(ChatListener.name);

  constructor(
    private readonly discussionService: DiscussionService,
    private readonly chatRoomService: ChatRoomService,
    private readonly tenantConnectionService: TenantConnectionService,
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

      // Use the modified method with tenant ID
      await this.discussionService.addMemberToEventDiscussionBySlug(
        params.eventSlug,
        params.userSlug,
        params.tenantId,
      );

      this.logger.log(
        `Added user ${params.userSlug} to event ${params.eventSlug} chat room in tenant ${params.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add user ${params.userSlug} to event ${params.eventSlug} chat room: ${error.message}`,
        error.stack,
      );
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

      await this.discussionService.removeMemberFromEventDiscussionBySlug(
        params.eventSlug,
        params.userSlug,
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
  async handleChatGroupMemberAdd(params: { groupId: number; userId: number }) {
    this.logger.log('chat.group.member.add event received', params);

    try {
      await this.discussionService.addMemberToGroupDiscussion(
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
  }) {
    this.logger.log('chat.group.member.remove event received', params);

    try {
      await this.discussionService.removeMemberFromGroupDiscussion(
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
        const result = await this.discussionService.getIdsFromSlugsWithTenant(
          params.eventSlug,
          params.userSlug,
          tenantId,
        );

        eventId = result.eventId;
        userId = result.userId;
      } else {
        this.logger.error('Either userSlug or userId is required');
        throw new Error('Either userSlug or userId is required');
      }

      if (eventId && userId) {
        await this.chatRoomService.createEventChatRoomWithTenant(
          eventId,
          userId,
          tenantId,
        );
        this.logger.log(
          `Created chat room for event ${params.eventSlug} by user ID ${userId} in tenant ${tenantId}`,
        );
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
