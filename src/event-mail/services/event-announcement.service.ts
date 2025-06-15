import { Injectable, Logger, Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { REQUEST } from '@nestjs/core';
import { MailerService } from '../../mailer/mailer.service';
import { UserService } from '../../user/user.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';
import { EventStatus } from '../../core/constants/constant';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';

@Injectable()
export class EventAnnouncementService {
  private readonly logger = new Logger(EventAnnouncementService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly userService: UserService,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly eventQueryService: EventQueryService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  private getTenantConfig() {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('Tenant ID is required for sending emails');
    }
    return this.tenantConnectionService.getTenantConfig(tenantId);
  }

  private async findEventBySlug(slug: string): Promise<EventEntity | null> {
    return this.eventQueryService.findEventBySlug(slug);
  }

  private async getGroupMembersForEmail(
    groupId: number,
  ): Promise<UserEntity[]> {
    // Get all group members using the service layer
    const groupMembers = await this.groupMemberService.findGroupDetailsMembers(
      groupId,
      0,
    );

    return groupMembers
      .map((member) => member.user)
      .filter((user) => user && user.email);
  }

  private async getEventAttendeesForEmail(
    eventId: number,
  ): Promise<UserEntity[]> {
    // Get all event attendees who should receive notifications
    const attendees =
      await this.eventAttendeeService.findEventAttendees(eventId);

    return attendees
      .map((attendee) => attendee.user)
      .filter((user) => user && user.email);
  }

  private async getAllRecipientsForEvent(
    event: EventEntity,
  ): Promise<UserEntity[]> {
    const recipients = new Map<number, UserEntity>();

    // Get group members if event is part of a group
    if (event.group) {
      const groupMembers = await this.getGroupMembersForEmail(event.group.id);
      groupMembers.forEach((user) => {
        recipients.set(user.id, user);
      });
    }

    // Get event attendees
    const eventAttendees = await this.getEventAttendeesForEmail(event.id);
    eventAttendees.forEach((user) => {
      recipients.set(user.id, user);
    });

    // Convert Map back to array to remove duplicates
    return Array.from(recipients.values());
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

      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(event);

      if (!allRecipients || allRecipients.length === 0) {
        this.logger.log(
          `Event ${params.slug} has no recipients, skipping announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${allRecipients.length} recipients (group members + attendees) for announcement`,
      );

      // Filter recipients who want email notifications (including organizers)
      const recipientsToNotify = allRecipients.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Check if user has opted into new event notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences
        return true;
      });

      this.logger.log(
        `Sending announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: event.group?.name
              ? `New Event: ${event.name} in ${event.group.name}`
              : `New Event: ${event.name}`,
            templateName: 'event/new-event-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventEndDateTime: event.endDate,
              eventTimeZone: event.timeZone,
              eventLocation: event.location,
              groupName: event.group?.name || null,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              organizerSlug: event.user?.slug,
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
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

      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(event);

      if (!allRecipients || allRecipients.length === 0) {
        this.logger.log(
          `Event ${params.slug} has no recipients, skipping update announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${allRecipients.length} recipients (group members + attendees) for update announcement`,
      );

      // Filter recipients who want email notifications and exclude the organizer
      const recipientsToNotify = allRecipients.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Check if user has opted into event update notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences for event updates
        return true;
      });

      this.logger.log(
        `Sending update announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: event.group?.name
              ? `Updated Event: ${event.name} in ${event.group.name}`
              : `Updated Event: ${event.name}`,
            templateName: 'event/event-update-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventEndDateTime: event.endDate,
              eventTimeZone: event.timeZone,
              eventLocation: event.location,
              groupName: event.group?.name || null,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              organizerSlug: event.user?.slug,
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
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
      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(event);

      if (!allRecipients || allRecipients.length === 0) {
        this.logger.log(
          `Event ${event.slug} has no recipients, skipping cancellation announcement`,
        );
        return;
      }

      this.logger.log(
        `Found ${allRecipients.length} recipients (group members + attendees) for cancellation announcement`,
      );

      // Filter recipients who want email notifications and exclude the organizer
      const recipientsToNotify = allRecipients.filter((user) => {
        // Skip users without email addresses
        if (!user.email) {
          this.logger.debug(`Skipping user ${user.slug} with no email address`);
          return false;
        }

        // Check if user has opted into event cancellation notifications
        // For now, default to true since user preferences for notifications aren't implemented yet
        // TODO: Implement user notification preferences for event cancellations
        return true;
      });

      this.logger.log(
        `Sending cancellation announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig();

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          await this.mailerService.sendMjmlMail({
            to: user.email!,
            subject: event.group?.name
              ? `Cancelled Event: ${event.name} in ${event.group.name}`
              : `Cancelled Event: ${event.name}`,
            templateName: 'event/event-cancellation-announcement',
            context: {
              recipientName: user.firstName,
              eventTitle: event.name,
              eventDescription: event.description,
              eventDateTime: event.startDate,
              eventEndDateTime: event.endDate,
              eventTimeZone: event.timeZone,
              eventLocation: event.location,
              groupName: event.group?.name || null,
              organizerName:
                `${event.user?.firstName || ''} ${event.user?.lastName || ''}`.trim(),
              organizerSlug: event.user?.slug,
              eventUrl: `${tenantConfig?.frontendDomain}/events/${event.slug}`,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
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
