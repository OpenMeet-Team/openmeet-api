import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { MailerService } from '../../mailer/mailer.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { ConfigService } from '@nestjs/config';
import { AllConfigType } from '../../config/config.type';
import { EventStatus } from '../../core/constants/constant';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventQueryService } from '../../event/services/event-query.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { ICalendarService } from '../../event/services/ical/ical.service';

interface ResolvedServices {
  mailerService: MailerService;
  eventQueryService: EventQueryService;
  groupMemberService: GroupMemberService;
  eventAttendeeService: EventAttendeeService;
  icalService: ICalendarService;
}

@Injectable()
export class EventAnnouncementService {
  private readonly logger = new Logger(EventAnnouncementService.name);

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Resolve request-scoped durable services with a synthetic tenant context.
   * Required because EventEmitter events fire outside HTTP request scope,
   * so AggregateByTenantContextIdStrategy.attach() is never called and
   * REQUEST would be undefined. This pattern follows CalendarInviteListener
   * and EventListener.
   */
  private async resolveServices(tenantId: string): Promise<ResolvedServices> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { tenantId, headers: { 'x-tenant-id': tenantId } },
      contextId,
    );
    const [
      mailerService,
      eventQueryService,
      groupMemberService,
      eventAttendeeService,
      icalService,
    ] = await Promise.all([
      this.moduleRef.resolve(MailerService, contextId, { strict: false }),
      this.moduleRef.resolve(EventQueryService, contextId, { strict: false }),
      this.moduleRef.resolve(GroupMemberService, contextId, { strict: false }),
      this.moduleRef.resolve(EventAttendeeService, contextId, {
        strict: false,
      }),
      this.moduleRef.resolve(ICalendarService, contextId, { strict: false }),
    ]);
    return {
      mailerService,
      eventQueryService,
      groupMemberService,
      eventAttendeeService,
      icalService,
    };
  }

  private getTenantConfig(tenantId: string) {
    if (!tenantId) {
      throw new Error('Tenant ID is required for sending emails');
    }
    return this.tenantConnectionService.getTenantConfig(tenantId);
  }

  private async findEventBySlug(
    slug: string,
    services: ResolvedServices,
  ): Promise<EventEntity | null> {
    return services.eventQueryService.findEventBySlug(slug);
  }

  private async getGroupMembersForEmail(
    groupId: number,
    services: ResolvedServices,
  ): Promise<UserEntity[]> {
    // Get all group members using the service layer
    const groupMembers =
      await services.groupMemberService.findGroupDetailsMembers(groupId, 0);

    return groupMembers
      .map((member) => member.user)
      .filter((user) => user && user.email);
  }

  private async getEventAttendeesForEmail(
    eventId: number,
    services: ResolvedServices,
  ): Promise<UserEntity[]> {
    // Get all event attendees who should receive notifications
    const attendees =
      await services.eventAttendeeService.findEventAttendees(eventId);

    return attendees
      .map((attendee) => attendee.user)
      .filter((user) => user && user.email);
  }

  private async getAllRecipientsForEvent(
    event: EventEntity,
    services: ResolvedServices,
  ): Promise<UserEntity[]> {
    const recipients = new Map<number, UserEntity>();

    // Get group members if event is part of a group
    if (event.group) {
      const groupMembers = await this.getGroupMembersForEmail(
        event.group.id,
        services,
      );
      groupMembers.forEach((user) => {
        recipients.set(user.id, user);
      });
    }

    // Get event attendees
    const eventAttendees = await this.getEventAttendeesForEmail(
      event.id,
      services,
    );
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

    if (!params.tenantId) {
      this.logger.error(
        'No tenantId available in event parameters for event.created announcement',
      );
      return;
    }

    try {
      const services = await this.resolveServices(params.tenantId);

      // Get the event with related data using slug (includes group and user relations)
      const event = await this.findEventBySlug(params.slug, services);

      if (!event) {
        this.logger.warn(`Event not found: ${params.eventId}`);
        return;
      }

      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(
        event,
        services,
      );

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
        // Default to true - only exclude users who explicitly set email to false
        return user.preferences?.notifications?.email !== false;
      });

      this.logger.log(
        `Sending announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig(params.tenantId);

      // Get event organizer info
      const organizer = event.user || null;
      if (!organizer) {
        this.logger.warn(
          `Event ${event.slug} has no organizer, skipping announcement`,
        );
        return;
      }

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          // Generate calendar invite for this recipient
          const eventUrl = `${tenantConfig?.frontendDomain}/events/${event.slug}`;
          const icsContent = services.icalService.generateCalendarInvite(
            event,
            {
              email: user.email!,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
            },
            {
              email: organizer.email || '',
              firstName: organizer.firstName || undefined,
              lastName: organizer.lastName || undefined,
            },
            eventUrl,
          );

          await services.mailerService.sendCalendarInviteMail({
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
              eventUrl,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
            },
            tenantConfig,
            icsContent,
          });

          this.logger.debug(
            `Sent announcement with calendar invite to ${user.email}`,
          );
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
    sendNotifications?: boolean;
  }) {
    this.logger.log('Processing event update announcement', {
      eventId: params.eventId,
      slug: params.slug,
      tenantId: params.tenantId,
      sendNotifications: params.sendNotifications,
    });

    // Skip sending notifications if explicitly disabled (defaults to false)
    if (params.sendNotifications !== true) {
      this.logger.log(
        `Skipping event update notifications for ${params.slug} (sendNotifications=${params.sendNotifications})`,
      );
      return;
    }

    if (!params.tenantId) {
      this.logger.error(
        'No tenantId available in event parameters for event.updated announcement',
      );
      return;
    }

    try {
      const services = await this.resolveServices(params.tenantId);

      // Get the event with related data using slug (includes group and user relations)
      const event = await this.findEventBySlug(params.slug, services);

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
        await this.sendCancellationAnnouncement(
          event,
          params.tenantId,
          services,
        );
        return;
      }

      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(
        event,
        services,
      );

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
        // Default to true - only exclude users who explicitly set email to false
        return user.preferences?.notifications?.email !== false;
      });

      this.logger.log(
        `Sending update announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig(params.tenantId);

      // Get event organizer info
      const organizer = event.user || null;
      if (!organizer) {
        this.logger.warn(
          `Event ${params.slug} has no organizer, skipping update announcement`,
        );
        return;
      }

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          // Generate updated calendar invite for this recipient
          const eventUrl = `${tenantConfig?.frontendDomain}/events/${event.slug}`;
          const icsContent = services.icalService.generateCalendarInvite(
            event,
            {
              email: user.email!,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
            },
            {
              email: organizer.email || '',
              firstName: organizer.firstName || undefined,
              lastName: organizer.lastName || undefined,
            },
            eventUrl,
          );

          await services.mailerService.sendCalendarInviteMail({
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
              eventUrl,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
            },
            tenantConfig,
            icsContent,
          });

          this.logger.debug(
            `Sent update announcement with calendar invite to ${user.email}`,
          );
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
  private async sendCancellationAnnouncement(
    event: EventEntity,
    tenantId: string,
    services: ResolvedServices,
  ) {
    this.logger.log('Processing event cancellation announcement', {
      eventId: event.id,
      slug: event.slug,
    });

    try {
      // Get all recipients (group members + event attendees)
      const allRecipients = await this.getAllRecipientsForEvent(
        event,
        services,
      );

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
        // Default to true - only exclude users who explicitly set email to false
        return user.preferences?.notifications?.email !== false;
      });

      this.logger.log(
        `Sending cancellation announcements to ${recipientsToNotify.length} recipients`,
      );

      // Get tenant configuration for emails
      const tenantConfig = this.getTenantConfig(tenantId);

      // Get event organizer info
      const organizer = event.user || null;
      if (!organizer) {
        this.logger.warn(
          `Event ${event.slug} has no organizer, skipping cancellation announcement`,
        );
        return;
      }

      // Send emails to each recipient
      const emailPromises = recipientsToNotify.map(async (user) => {
        try {
          // Generate cancellation calendar invite for this recipient
          const eventUrl = `${tenantConfig?.frontendDomain}/events/${event.slug}`;
          const icsContent = services.icalService.generateCancellationInvite(
            event,
            {
              email: user.email!,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
            },
            {
              email: organizer.email || '',
              firstName: organizer.firstName || undefined,
              lastName: organizer.lastName || undefined,
            },
            eventUrl,
          );

          await services.mailerService.sendCalendarInviteMail({
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
              eventUrl,
              groupUrl: event.group?.slug
                ? `${tenantConfig?.frontendDomain}/groups/${event.group.slug}`
                : null,
              organizerUrl: event.user?.slug
                ? `${tenantConfig?.frontendDomain}/members/${event.user.slug}`
                : null,
            },
            tenantConfig,
            icsContent,
          });

          this.logger.debug(
            `Sent cancellation announcement with calendar invite to ${user.email}`,
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
  async handleEventDeleted(params: {
    event: EventEntity;
    tenantId: string;
  }) {
    this.logger.log(
      'Processing event deletion announcement (physical deletion)',
      {
        eventId: params.event.id,
        slug: params.event.slug,
      },
    );

    if (!params.tenantId) {
      this.logger.error(
        'No tenantId available in event parameters for event.deleted announcement',
      );
      return;
    }

    const services = await this.resolveServices(params.tenantId);

    // For physical deletion, we also send cancellation emails
    // since the event will no longer be accessible
    await this.sendCancellationAnnouncement(
      params.event,
      params.tenantId,
      services,
    );
  }
}
