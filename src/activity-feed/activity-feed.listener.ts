import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility } from '../core/constants/constant';

@Injectable()
export class ActivityFeedListener {
  private readonly logger = new Logger(ActivityFeedListener.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly activityFeedService: ActivityFeedService,
    private readonly groupService: GroupService,
    private readonly userService: UserService,
  ) {
    this.logger.log('ActivityFeedListener constructed and ready to handle events');
  }

  @OnEvent('chat.group.member.add')
  async handleGroupMemberAdded(params: {
    groupSlug: string;
    userSlug: string;
    tenantId: string;
  }) {
    try {
      this.logger.log('chat.group.member.add event received', {
        groupSlug: params.groupSlug,
        userSlug: params.userSlug,
        tenantId: params.tenantId,
      });

      // Fetch group entity to get id, name, visibility
      const group = await this.groupService.getGroupBySlug(params.groupSlug);
      if (!group) {
        this.logger.warn(
          `Group not found for slug ${params.groupSlug}, skipping activity creation`,
        );
        return;
      }

      // Fetch user entity to get id, name
      const user = await this.userService.getUserBySlug(params.userSlug);
      if (!user) {
        this.logger.warn(
          `User not found for slug ${params.userSlug}, skipping activity creation`,
        );
        return;
      }

      // Construct full name from firstName and lastName (name is a virtual column)
      const actorName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

      // Create detailed activity (always created)
      await this.activityFeedService.create({
        activityType: 'member.joined',
        feedScope: 'group',
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        actorId: user.id,
        actorSlug: user.slug,
        actorName: actorName,
        groupVisibility: group.visibility,
        aggregationStrategy: 'time_window',
        aggregationWindow: 60, // 1 hour window
      });

      this.logger.log(
        `Created member.joined activity for ${user.slug} in ${group.slug}`,
      );

      // For private groups, create anonymized sitewide activity
      if (group.visibility === GroupVisibility.Private) {
        await this.activityFeedService.create({
          activityType: 'group.activity',
          feedScope: 'sitewide',
          groupId: group.id,
          groupSlug: group.slug,
          groupName: group.name,
          groupVisibility: GroupVisibility.Public, // Force public for sitewide
          metadata: {
            activityCount: 1,
          },
          aggregationStrategy: 'time_window',
          aggregationWindow: 60,
        });

        this.logger.log(
          `Created anonymized sitewide activity for private group ${group.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create activity for group ${params.groupSlug} and user ${params.userSlug}: ${error.message}`,
        error.stack,
      );
    }
  }
}
