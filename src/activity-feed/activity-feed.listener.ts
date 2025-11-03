import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityFeedService } from './activity-feed.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { REQUEST } from '@nestjs/core';
import { GroupVisibility, EventVisibility } from '../core/constants/constant';
import { EventQueryService } from '../event/services/event-query.service';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';

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
    this.logger.log(
      'ActivityFeedListener constructed and ready to handle events',
    );
  }

  @OnEvent('group.created')
  async handleGroupCreated(params: {
    groupId: number;
    slug: string;
    userId: number;
    tenantId: string;
  }) {
    try {
      this.logger.log('group.created event received', {
        groupId: params.groupId,
        slug: params.slug,
        userId: params.userId,
        tenantId: params.tenantId,
      });

      // Fetch group entity to get name, visibility
      const group = await this.groupService.getGroupBySlug(params.slug);
      if (!group) {
        this.logger.warn(
          `Group not found for slug ${params.slug}, skipping activity creation`,
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

      // Create group.created activity (always in group feed)
      await this.activityFeedService.create({
        activityType: 'group.created',
        feedScope: 'group',
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        actorId: user.id,
        actorSlug: user.slug,
        actorName: actorName,
        groupVisibility: group.visibility,
        aggregationStrategy: 'none', // Don't aggregate group creations
      });

      this.logger.log(
        `Created group.created activity for ${group.slug} by ${user.slug}`,
      );

      // Create sitewide activity for discovery
      if (group.visibility === GroupVisibility.Public) {
        // Public groups: show full details for discovery
        await this.activityFeedService.create({
          activityType: 'group.created',
          feedScope: 'sitewide',
          groupId: group.id,
          groupSlug: group.slug,
          groupName: group.name,
          actorId: user.id,
          actorSlug: user.slug,
          actorName: actorName,
          groupVisibility: group.visibility,
          aggregationStrategy: 'none',
        });

        this.logger.log(
          `Created sitewide group.created activity for ${group.slug}`,
        );
      } else {
        // Private/authenticated groups: anonymized activity for social proof
        await this.activityFeedService.create({
          activityType: 'group.activity',
          feedScope: 'sitewide',
          groupVisibility: GroupVisibility.Public, // Force public for sitewide
          metadata: {
            activityCount: 1,
            activityDescription: 'A new group was created',
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
        `Failed to create activity for group ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
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

      // Check for group milestones
      await this.checkGroupMilestone(group);

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

      // Handle events that belong to a group
      let group: GroupEntity | null = null;
      if (event.group) {
        group = await this.groupService.getGroupBySlug(event.group.slug);
        if (!group) {
          this.logger.warn(
            `Group not found for event ${params.slug}, treating as standalone`,
          );
        }
      }

      // Create group-scoped activity if event belongs to a group
      if (group) {
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
          `Created group-scoped event.created activity for ${event.slug} by ${user.slug}`,
        );
      }

      // Create sitewide activity for discovery
      const eventVisibility = event.visibility;

      // For standalone events or public events
      if (eventVisibility === EventVisibility.Public) {
        // Check if this is a standalone event or if both event and group are public
        const shouldShowFullDetails =
          !group || // Standalone event
          (group && group.visibility === GroupVisibility.Public); // Public event in public group

        if (shouldShowFullDetails) {
          // Show full details for discovery
          await this.activityFeedService.create({
            activityType: 'event.created',
            feedScope: 'sitewide',
            groupId: group?.id,
            groupSlug: group?.slug,
            groupName: group?.name,
            eventId: event.id,
            eventSlug: event.slug,
            eventName: event.name,
            actorId: user.id,
            actorSlug: user.slug,
            actorName: actorName,
            groupVisibility: group?.visibility || GroupVisibility.Public,
            aggregationStrategy: 'none',
          });

          this.logger.log(
            `Created sitewide event.created activity for ${event.slug} (${group ? 'group event' : 'standalone event'})`,
          );
        } else {
          // Public event in non-public group: anonymized activity for social proof
          await this.activityFeedService.create({
            activityType: 'group.activity',
            feedScope: 'sitewide',
            groupVisibility: GroupVisibility.Public, // Force public for sitewide
            metadata: {
              activityCount: 1,
              activityDescription: 'A new event was created',
            },
            aggregationStrategy: 'time_window',
            aggregationWindow: 60,
          });

          this.logger.log(
            `Created anonymized sitewide activity for public event ${event.slug} in non-public group`,
          );
        }
      } else {
        // Private/authenticated events: anonymized activity for social proof
        await this.activityFeedService.create({
          activityType: 'group.activity',
          feedScope: 'sitewide',
          groupVisibility: GroupVisibility.Public, // Force public for sitewide
          metadata: {
            activityCount: 1,
            activityDescription: 'A new event was created',
          },
          aggregationStrategy: 'time_window',
          aggregationWindow: 60,
        });

        this.logger.log(
          `Created anonymized sitewide activity for private/authenticated event ${event.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create activity for event ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.rsvp.added')
  async handleEventRsvpAdded(params: {
    eventId: number;
    eventSlug: string;
    userId: number;
    userSlug: string;
    status: string;
    tenantId: string;
  }) {
    try {
      this.logger.log('event.rsvp.added event received', {
        eventId: params.eventId,
        eventSlug: params.eventSlug,
        userId: params.userId,
        userSlug: params.userSlug,
        status: params.status,
        tenantId: params.tenantId,
      });

      // Fetch event entity to get name, groupId
      const event = await this.eventQueryService.findEventBySlug(
        params.eventSlug,
      );
      if (!event) {
        this.logger.warn(
          `Event not found for slug ${params.eventSlug}, skipping activity creation`,
        );
        return;
      }

      // Fetch user entity to get actor's name
      const user = await this.userService.getUserById(params.userId);
      if (!user) {
        this.logger.warn(
          `User not found for id ${params.userId}, skipping activity creation`,
        );
        return;
      }

      // Construct full name from firstName and lastName
      const actorName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

      // Handle group events and standalone events differently
      if (event.group) {
        // Fetch group entity to get group details
        const group = await this.groupService.getGroupBySlug(event.group.slug);
        if (!group) {
          this.logger.warn(
            `Group not found for event ${params.eventSlug}, skipping activity creation`,
          );
          return;
        }

        // Create event.rsvp activity in group feed
        await this.activityFeedService.create({
          activityType: 'event.rsvp',
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
          aggregationStrategy: 'time_window',
          aggregationWindow: 30, // 30-minute window for RSVPs (shows momentum)
        });

        this.logger.log(
          `Created event.rsvp activity for group event ${event.slug} by ${user.slug}`,
        );
      } else {
        // Create event.rsvp activity for standalone events in event feed
        await this.activityFeedService.create({
          activityType: 'event.rsvp',
          feedScope: 'event',
          eventId: event.id,
          eventSlug: event.slug,
          eventName: event.name,
          actorId: user.id,
          actorSlug: user.slug,
          actorName: actorName,
          aggregationStrategy: 'time_window',
          aggregationWindow: 30, // 30-minute window for RSVPs (shows momentum)
        });

        this.logger.log(
          `Created event.rsvp activity for standalone event ${event.slug} by ${user.slug}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create RSVP activity for event ${params.eventSlug}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.updated')
  async handleEventUpdated(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId: string;
  }) {
    try {
      this.logger.log('event.updated event received', {
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
          `Event ${params.slug} doesn't belong to a group, skipping event.updated activity`,
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

      // Create event.updated activity (no aggregation - each update is separate)
      await this.activityFeedService.create({
        activityType: 'event.updated',
        feedScope: 'group',
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        eventId: event.id,
        eventSlug: event.slug,
        eventName: event.name,
        groupVisibility: group.visibility,
        aggregationStrategy: 'none', // Don't aggregate updates
      });

      this.logger.log(`Created event.updated activity for ${event.slug}`);
    } catch (error) {
      this.logger.error(
        `Failed to create event.updated activity for ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('group.updated')
  async handleGroupUpdated(params: {
    groupId: number;
    slug: string;
    tenantId: string;
  }) {
    try {
      this.logger.log('group.updated event received', {
        groupId: params.groupId,
        slug: params.slug,
        tenantId: params.tenantId,
      });

      // Fetch group entity to get name, visibility
      const group = await this.groupService.getGroupBySlug(params.slug);
      if (!group) {
        this.logger.warn(
          `Group not found for slug ${params.slug}, skipping activity creation`,
        );
        return;
      }

      // Create group.updated activity (no aggregation - each update is separate)
      await this.activityFeedService.create({
        activityType: 'group.updated',
        feedScope: 'group',
        groupId: group.id,
        groupSlug: group.slug,
        groupName: group.name,
        groupVisibility: group.visibility,
        aggregationStrategy: 'none', // Don't aggregate updates
      });

      this.logger.log(`Created group.updated activity for ${group.slug}`);
    } catch (error) {
      this.logger.error(
        `Failed to create group.updated activity for ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Check if group has reached a milestone and create activity if so
   * Milestones: 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000
   */
  private async checkGroupMilestone(group: any) {
    const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    const memberCount = group.memberCount || 0;

    // Check if current member count matches a milestone
    if (milestones.includes(memberCount)) {
      this.logger.log(
        `Group ${group.slug} reached milestone: ${memberCount} members`,
      );

      try {
        // Create milestone activity
        await this.activityFeedService.create({
          activityType: 'group.milestone',
          feedScope: 'group',
          groupId: group.id,
          groupSlug: group.slug,
          groupName: group.name,
          groupVisibility: group.visibility,
          metadata: {
            milestoneType: 'members',
            value: memberCount,
          },
          aggregationStrategy: 'none', // Don't aggregate milestones
        });

        // For public groups, also create sitewide milestone activity
        if (group.visibility === GroupVisibility.Public) {
          await this.activityFeedService.create({
            activityType: 'group.milestone',
            feedScope: 'sitewide',
            groupId: group.id,
            groupSlug: group.slug,
            groupName: group.name,
            groupVisibility: group.visibility,
            metadata: {
              milestoneType: 'members',
              value: memberCount,
            },
            aggregationStrategy: 'none',
          });

          this.logger.log(
            `Created sitewide milestone activity for ${group.slug} (${memberCount} members)`,
          );
        }

        this.logger.log(
          `Created group.milestone activity for ${group.slug} (${memberCount} members)`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to create milestone activity for ${group.slug}: ${error.message}`,
          error.stack,
        );
      }
    }
  }
}
