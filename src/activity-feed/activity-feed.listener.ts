import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility } from '../core/constants/constant';
import { EventQueryService } from '../event/services/event-query.service';

@Injectable()
export class ActivityFeedListener {
  private readonly logger = new Logger(ActivityFeedListener.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly activityFeedService: ActivityFeedService,
    private readonly groupService: GroupService,
    private readonly userService: UserService,
    private readonly eventQueryService: EventQueryService,
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

  @OnEvent('event.created')
  async handleEventCreated(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId: string;
  }) {
    try {
      this.logger.log('event.created event received', {
        eventId: params.eventId,
        slug: params.slug,
        userId: params.userId,
        tenantId: params.tenantId,
      });

      // Fetch event entity to get name, groupId
      const event = await this.eventQueryService.findEventBySlug(params.slug);
      if (!event) {
        this.logger.warn(
          `Event not found for slug ${params.slug}, skipping activity creation`,
        );
        return;
      }

      // Skip if event doesn't belong to a group
      if (!event.group) {
        this.logger.debug(
          `Event ${params.slug} doesn't belong to a group, skipping activity creation`,
        );
        return;
      }

      // Fetch group entity to get group details
      const group = await this.groupService.getGroupBySlug(event.group.slug);
      if (!group) {
        this.logger.warn(
          `Group not found for event ${params.slug}, skipping activity creation`,
        );
        return;
      }

      // Fetch user entity to get creator's name
      const user = await this.userService.getUserById(params.userId);
      if (!user) {
        this.logger.warn(
          `User not found for id ${params.userId}, skipping activity creation`,
        );
        return;
      }

      // Construct full name from firstName and lastName
      const actorName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

      // Create event.created activity
      await this.activityFeedService.create({
        activityType: 'event.created',
        feedScope: 'group',
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        eventId: event.id,
        eventSlug: event.slug,
        eventName: event.name,
        actorId: user.id,
        actorSlug: user.slug,
        actorName: actorName,
        groupVisibility: group.visibility,
        aggregationStrategy: 'none', // Don't aggregate event creations
      });

      this.logger.log(
        `Created event.created activity for ${event.slug} by ${user.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create activity for event ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }
}
