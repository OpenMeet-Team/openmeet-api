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

    // Matrix-native approach: Rooms are created on-demand via Application Service
    // No longer emit chat.group.created events - rooms are created when first accessed
    this.logger.log(
      `Group ${params.slug} created - rooms will be created on-demand via Matrix Application Service`,
    );
  }
}
