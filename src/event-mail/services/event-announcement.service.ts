import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { MailerService } from '../../mailer/mailer.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';
import { EventStatus } from '../../core/constants/constant';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class EventAnnouncementService {
  private readonly logger = new Logger(EventAnnouncementService.name);
  private eventRepository: Repository<EventEntity>;
  private groupMemberRepository: Repository<GroupMemberEntity>;

  constructor(
    private readonly mailerService: MailerService,
    private readonly userService: UserService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService<AllConfigType>,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  private async initializeRepository() {
    if (!this.eventRepository || !this.groupMemberRepository) {
      const tenantId = this.request.tenantId;
      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      this.eventRepository = dataSource.getRepository(EventEntity);
      this.groupMemberRepository = dataSource.getRepository(GroupMemberEntity);
    }
  }

  private getTenantConfig() {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required for sending emails');
    }
    return this.tenantConnectionService.getTenantConfig(tenantId);
  }

  private async findEventBySlug(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    return this.eventRepository.findOne({
      where: { slug },
      relations: ['user', 'group', 'categories', 'image'],
    });
  }

  private async getGroupMembersForEmail(
    groupId: number,
  ): Promise<UserEntity[]> {
    await this.initializeRepository();

    // For now, just get all group members - we can add permission filtering later
    const groupMembers = await this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
      },
      relations: ['user'],
    });

    return groupMembers
      .map((member) => member.user)
      .filter((user) => user && user.email);
  }

  @OnEvent('event.created')
  async handleEventCreated(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('Processing new event announcement', {
      eventId: params.eventId,
      slug: params.slug,
      tenantId: params.tenantId,
    });

    try {
      // Get the event with related data using slug (includes group and user relations)
      const event = await this.findEventBySlug(params.slug);

      if (!event) {
        this.logger.warn(`Event not found: ${params.eventId}`);
        return;
      }

      // Skip if event is not part of a group
      if (!event.group) {
        this.logger.log(
          `Event ${params.slug} is not part of a group, skipping announcement`,
        );
        return;
      }

      // Get all group members for email notifications
      const groupMembers = await this.getGroupMembersForEmail(event.group.id);

      if (!groupMembers || groupMembers.length === 0) {
        this.logger.log(
          `Group ${event.group.slug} has no members, skipping announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${groupMembers.length} group members for announcement`,
      );

      // Filter members who want email notifications and exclude the organizer
      const membersToNotify = groupMembers.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Skip the event organizer
        if (user.id === event.user?.id) {
          this.logger.debug(
            `Skipping organizer ${user.slug} from announcement`,
          );
          return false;
        }

        // Check if user has opted into new event notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences
        return true;
      });

      this.logger.log(
        `Sending announcements to ${membersToNotify.length} members`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each member
      const emailPromises = membersToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: `New Event: ${event.name} in ${event.group?.name}`,
            templateName: 'event/new-event-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventLocation: event.location,
              groupName: event.group?.name,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: `${tenantConfig?.frontendDomain}/groups/${event.group?.slug}`,
            },
            tenantConfig,
          });

          this.logger.debug(`Sent announcement email to ${user.email}`);
        } catch (error) {
          this.logger.error(
            `Failed to send announcement email to ${user.email}: ${error.message}`,
            error.stack,
          );
          // Continue with other emails even if one fails
        }
      });

      // Wait for all emails to complete
      await Promise.allSettled(emailPromises);

      this.logger.log(
        `Completed sending announcements for event ${params.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event announcement for ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.updated')
  async handleEventUpdated(params: {
    eventId: number;
    slug: string;
    userId: number;
    tenantId?: string;
  }) {
    this.logger.log('Processing event update announcement', {
      eventId: params.eventId,
      slug: params.slug,
      tenantId: params.tenantId,
    });

    try {
      // Get the event with related data using slug (includes group and user relations)
      const event = await this.findEventBySlug(params.slug);

      if (!event) {
        this.logger.warn(`Event not found: ${params.eventId}`);
        return;
      }

      // Check if this is a cancellation (status is cancelled)
      if (event.status === EventStatus.Cancelled) {
        this.logger.log(
          `Event ${params.slug} was cancelled, sending cancellation announcement instead of update`,
        );
        // Use the existing cancellation logic
        await this.sendCancellationAnnouncement(event);
        return;
      }

      // Skip if event is not part of a group
      if (!event.group) {
        this.logger.log(
          `Event ${params.slug} is not part of a group, skipping update announcement`,
        );
        return;
      }

      // Get all group members for email notifications
      const groupMembers = await this.getGroupMembersForEmail(event.group.id);

      if (!groupMembers || groupMembers.length === 0) {
        this.logger.log(
          `Group ${event.group.slug} has no members, skipping update announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${groupMembers.length} group members for update announcement`,
      );

      // Filter members who want email notifications and exclude the organizer
      const membersToNotify = groupMembers.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Skip the event organizer
        if (user.id === event.user?.id) {
          this.logger.debug(
            `Skipping organizer ${user.slug} from update announcement`,
          );
          return false;
        }

        // Check if user has opted into event update notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences for event updates
        return true;
      });

      this.logger.log(
        `Sending update announcements to ${membersToNotify.length} members`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each member
      const emailPromises = membersToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: `Updated Event: ${event.name} in ${event.group?.name}`,
            templateName: 'event/event-update-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventLocation: event.location,
              groupName: event.group?.name,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: `${tenantConfig?.frontendDomain}/groups/${event.group?.slug}`,
            },
            tenantConfig,
          });

          this.logger.debug(`Sent update announcement email to ${user.email}`);
        } catch (error) {
          this.logger.error(
            `Failed to send update announcement email to ${user.email}: ${error.message}`,
            error.stack,
          );
          // Continue with other emails even if one fails
        }
      });

      // Wait for all emails to complete
      await Promise.allSettled(emailPromises);

      this.logger.log(
        `Completed sending update announcements for event ${params.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event update announcement for ${params.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send cancellation announcement emails for a cancelled event
   */
  private async sendCancellationAnnouncement(event: EventEntity) {
    this.logger.log('Processing event cancellation announcement', {
      eventId: event.id,
      slug: event.slug,
    });

    try {
      // Skip if event is not part of a group
      if (!event.group) {
        this.logger.log(
          `Event ${event.slug} is not part of a group, skipping cancellation announcement`,
        );
        return;
      }

      // Get all group members for email notifications
      const groupMembers = await this.getGroupMembersForEmail(event.group.id);

      if (!groupMembers || groupMembers.length === 0) {
        this.logger.log(
          `Group ${event.group.slug} has no members, skipping cancellation announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${groupMembers.length} group members for cancellation announcement`,
      );

      // Filter members who want email notifications and exclude the organizer
      const membersToNotify = groupMembers.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Skip the event organizer
        if (user.id === event.user?.id) {
          this.logger.debug(
            `Skipping organizer ${user.slug} from cancellation announcement`,
          );
          return false;
        }

        // Check if user has opted into event cancellation notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences for event cancellations
        return true;
      });

      this.logger.log(
        `Sending cancellation announcements to ${membersToNotify.length} members`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each member
      const emailPromises = membersToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: `Cancelled Event: ${event.name} in ${event.group?.name}`,
            templateName: 'event/event-cancellation-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventLocation: event.location,
              groupName: event.group?.name,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: `${tenantConfig?.frontendDomain}/groups/${event.group?.slug}`,
            },
            tenantConfig,
          });

          this.logger.debug(
            `Sent cancellation announcement email to ${user.email}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to send cancellation announcement email to ${user.email}: ${error.message}`,
            error.stack,
          );
          // Continue with other emails even if one fails
        }
      });

      // Wait for all emails to complete
      await Promise.allSettled(emailPromises);

      this.logger.log(
        `Completed sending cancellation announcements for event ${event.slug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event cancellation announcement for ${event.slug}: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent('event.deleted')
  async handleEventDeleted(event: EventEntity) {
    this.logger.log(
      'Processing event deletion announcement (physical deletion)',
      {
        eventId: event.id,
        slug: event.slug,
      },
    );

    // For physical deletion, we also send cancellation emails
    // since the event will no longer be accessible
    await this.sendCancellationAnnouncement(event);
  }
}
