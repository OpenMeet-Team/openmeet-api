import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';

@Injectable()
export class GroupListener {
  private readonly logger = new Logger(GroupListener.name);

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.logger.log('GroupListener constructed and ready to handle events');
  }

  @OnEvent('group.deleted')
  handleGroupDeletedEvent(group: GroupEntity) {
    this.logger.log('group.deleted', {
      id: group.id,
      slug: group.slug,
    });
    // Matrix rooms are managed via the Matrix API now
  }

  @OnEvent('group.updated')
  handleGroupUpdatedEvent(group: GroupEntity) {
    this.logger.log('group.updated', {
      id: group.id,
      slug: group.slug,
    });
  }

  @OnEvent('group.created')
  handleGroupCreatedEvent(params: {
    groupId: number;
    slug: string;
    userId: number;
    tenantId: string;
  }) {
    this.logger.log('group.created', {
      id: params.groupId,
      slug: params.slug,
      tenantId: params.tenantId,
    });

    // Use the tenant ID from the event payload (no fallback to request needed)
    const tenantId = params.tenantId;

    // Emit an event for the chat module to handle chat room creation
    // following the same pattern as event.created
    try {
      this.logger.log(
        `Emitting chat.group.created event for group ${params.slug}`,
      );

      // Create payload with all required fields including tenantId and userId
      const payload = {
        groupSlug: params.slug,
        userId: params.userId, // Use userId from group creation payload
        groupName: params.groupId.toString(), // We don't have the group name, use ID as fallback
        groupVisibility: 'public', // Default visibility
        tenantId: tenantId,
      };

      // Log crucial fields to debug
      this.logger.log(`Chat group payload: ${JSON.stringify(payload)}`);

      // Skip emitting event if we don't have any user identifier
      if (!payload.userId) {
        this.logger.warn(
          `Cannot create chat room for group ${params.slug}: No user identifier provided`,
        );
        return;
      }

      // Emit the event with our prepared payload
      this.eventEmitter.emit('chat.group.created', payload);
    } catch (error) {
      this.logger.error(`Error in handleGroupCreatedEvent: ${error.message}`);
    }
  }
}
