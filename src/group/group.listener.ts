import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupService } from './group.service';
import { UserService } from '../user/user.service';

@Injectable()
export class GroupListener {
  private readonly logger = new Logger(GroupListener.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly groupService: GroupService,
    private readonly userService: UserService,
  ) {
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
    // const tenantId = params.tenantId; // Currently not used

    // Matrix-native approach: Rooms are created on-demand via Application Service
    // No longer emit chat.group.created events - rooms are created when first accessed
    this.logger.log(
      `Group ${params.slug} created - rooms will be created on-demand via Matrix Application Service`,
    );
  }

  /**
   * Handle Matrix handle registration event
   * Reprocess pending group chat invitations for users who joined groups before connecting to Matrix
   */
  @OnEvent('matrix.handle.registered')
  async handleMatrixHandleRegistered(params: {
    userId: number;
    tenantId: string;
    handle: string;
  }) {
    try {
      this.logger.log(
        `Matrix handle registered for user ${params.userId}, reprocessing pending group invitations`,
      );

      // Get user to retrieve slug
      const user = await this.userService.findById(params.userId);
      if (!user) {
        this.logger.warn(
          `User ${params.userId} not found, cannot reprocess invitations`,
        );
        return;
      }

      // Find all groups where user is a member (getGroupsByMember only returns approved memberships)
      const groups = await this.groupService.getGroupsByMember(params.userId);

      this.logger.log(
        `Found ${groups.length} group memberships for user ${user.slug}`,
      );

      // Re-emit chat.group.member.add for each group membership
      for (const group of groups) {
        this.eventEmitter.emit('chat.group.member.add', {
          groupSlug: group.slug,
          userSlug: user.slug,
          tenantId: params.tenantId,
        });
        this.logger.log(
          `Re-emitted chat.group.member.add for user ${user.slug} in group ${group.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to reprocess group invitations for user ${params.userId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
