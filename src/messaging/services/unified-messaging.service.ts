import {
  Injectable,
  Inject,
  ForbiddenException,
  BadRequestException,
  forwardRef,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { MessageDraftService } from './message-draft.service';
import { MessageAuditService } from './message-audit.service';
import { MessagePauseService } from './message-pause.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupService } from '../../group/group.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { UserService } from '../../user/user.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { IEmailSender, EMAIL_SENDER_TOKEN } from '../interfaces/email-sender.interface';
import {
  MessageType,
  MessageChannel,
  SendMessageRequest,
  MessageRecipient,
  MessageStatus,
} from '../interfaces/message.interface';
import { MessageLogEntity } from '../entities/message-log.entity';
import { MessageDraftEntity } from '../entities/message-draft.entity';
import {
  GroupPermission,
  EventAttendeePermission,
} from '../../core/constants/constant';

@Injectable()
export class UnifiedMessagingService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantService: TenantConnectionService,
    private readonly draftService: MessageDraftService,
    @Inject(EMAIL_SENDER_TOKEN) private readonly emailSender: IEmailSender,
    private readonly auditService: MessageAuditService,
    private readonly pauseService: MessagePauseService,
    // private readonly mailService: MailService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventService: EventQueryService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  private async getLogRepository(): Promise<Repository<MessageLogEntity>> {
    const tenantId = this.request.tenantId;
    const dataSource = await this.tenantService.getTenantConnection(tenantId);
    return dataSource.getRepository(MessageLogEntity);
  }

  async sendGroupMessage(
    groupSlug: string,
    senderSlug: string,
    messageRequest: SendMessageRequest,
  ): Promise<{
    draftSlug: string;
    recipientCount: number;
    requiresReview: boolean;
  }> {
    const tenantId = this.request.tenantId;

    // Get group and validate permissions
    const group = await this.groupService.findGroupBySlug(groupSlug);

    // Get sender member by slugs
    const senderMember =
      await this.groupMemberService.findGroupMemberByUserSlugAndGroupSlug(
        groupSlug,
        senderSlug,
      );

    if (!senderMember) {
      throw new ForbiddenException(
        'You must be a member of this group to send messages',
      );
    }

    // Check permissions based on message type and recipient filter
    await this.validateGroupMessagePermissions(senderMember, messageRequest);

    // Check rate limits
    const rateLimit = await this.auditService.checkRateLimit(
      tenantId,
      senderMember.user.id,
      group.id,
    );
    if (!rateLimit.allowed) {
      await this.auditService.logAction(
        this.request.tenantId,
        senderMember.user.id,
        'rate_limit_exceeded',
        {
          groupId: group.id,
          additionalData: { limit: rateLimit.limit, count: rateLimit.count },
        },
      );
      throw new BadRequestException(
        `Rate limit exceeded. You can send ${rateLimit.limit} message(s) per hour. Current count: ${rateLimit.count}`,
      );
    }

    // Get recipients
    const recipients = await this.getGroupRecipients(
      group.id,
      messageRequest.recipientFilter || 'all',
    );

    // Determine if review is required
    const requiresReview =
      messageRequest.requireReview ||
      (messageRequest.recipientFilter === 'all' && recipients.length > 10); // Auto-require review for large broadcasts

    // Create draft
    const draft = await this.draftService.createDraft(
      senderMember.user.id,
      {
        ...messageRequest,
        type: MessageType.GROUP_ANNOUNCEMENT,
        requireReview: requiresReview,
      },
      group.id,
    );

    // If no review required and approved, send immediately
    if (!requiresReview) {
      await this.sendMessage(draft.slug);
    }

    return {
      draftSlug: draft.slug,
      recipientCount: recipients.length,
      requiresReview,
    };
  }

  async sendEventMessage(
    eventSlug: string,
    senderSlug: string,
    messageRequest: SendMessageRequest,
  ): Promise<{
    draftSlug: string;
    recipientCount: number;
    requiresReview: boolean;
  }> {
    const tenantId = this.request.tenantId;

    // Get event and validate permissions
    const event = await this.eventService.findEventBySlug(eventSlug);
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // Get sender user by slug
    const senderUser = await this.userService.findBySlug(senderSlug);
    if (!senderUser) {
      throw new NotFoundException('User not found');
    }

    const senderAttendee = await this.eventAttendeeService.findByUserAndEvent(
      senderUser.id,
      event.id,
    );

    if (!senderAttendee) {
      throw new ForbiddenException(
        'You must be an attendee of this event to send messages',
      );
    }

    // Check permissions
    await this.validateEventMessagePermissions(senderAttendee, messageRequest);

    // Check rate limits
    const rateLimit = await this.auditService.checkRateLimit(
      tenantId,
      senderUser.id,
      undefined,
      event.id,
    );
    if (!rateLimit.allowed) {
      await this.auditService.logAction(
        this.request.tenantId,
        senderUser.id,
        'rate_limit_exceeded',
        {
          eventId: event.id,
          additionalData: { limit: rateLimit.limit, count: rateLimit.count },
        },
      );
      throw new BadRequestException(
        `Rate limit exceeded. You can send ${rateLimit.limit} message(s) per hour. Current count: ${rateLimit.count}`,
      );
    }

    // Get recipients
    const recipients = await this.getEventRecipients(
      event.id,
      messageRequest.recipientFilter || 'all',
    );

    // Determine if review is required
    const requiresReview =
      messageRequest.requireReview ||
      (messageRequest.recipientFilter === 'all' && recipients.length > 10);

    // Create draft
    const draft = await this.draftService.createDraft(
      senderUser.id,
      {
        ...messageRequest,
        type: MessageType.EVENT_ANNOUNCEMENT,
        requireReview: requiresReview,
      },
      undefined,
      event.id,
    );

    // If no review required, send immediately
    if (!requiresReview) {
      await this.sendMessage(draft.slug);
    }

    return {
      draftSlug: draft.slug,
      recipientCount: recipients.length,
      requiresReview,
    };
  }

  async sendMessage(draftSlug: string): Promise<void> {
    // Check if messaging is paused globally
    const pauseStatus = await this.pauseService.isMessagingPaused();
    if (pauseStatus.paused) {
      // Don't throw - just log and return without sending
      // This keeps the message in its current status (DRAFT or APPROVED)
      // so it can be retried later
      await this.auditService.logAction(
        this.request.tenantId,
        0,
        'message_send_skipped',
        {
          additionalData: {
            messageSlug: draftSlug,
            reason: 'messaging_paused',
            pauseReason: pauseStatus.reason,
          },
        },
      );
      return;
    }

    const tenantId = this.request.tenantId;
    const repository = await this.getLogRepository();

    // Get draft (using 0 for userId since this is admin/system access)
    const draft = await this.draftService.getDraft(draftSlug, 0);

    // Validate draft can be sent
    if (
      draft.status !== MessageStatus.DRAFT &&
      draft.status !== MessageStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Only draft or approved messages can be sent',
      );
    }

    // Get recipients based on draft context
    let recipients: MessageRecipient[] = [];

    if (draft.groupId) {
      recipients = await this.getGroupRecipients(
        draft.groupId,
        draft.recipientFilter || 'all',
      );
    } else if (draft.eventId) {
      recipients = await this.getEventRecipients(
        draft.eventId,
        draft.recipientFilter || 'all',
      );
    } else if (draft.recipientUserIds) {
      // Individual messages
      recipients = await this.getUserRecipients(draft.recipientUserIds);
    }

    // Send messages via each channel
    for (const recipient of recipients) {
      for (const channel of draft.channels) {
        if (recipient.preferredChannels.includes(channel)) {
          try {
            let externalId: string | undefined;

            switch (channel) {
              case MessageChannel.EMAIL:
                if (recipient.email) {
                  externalId = await this.sendEmailMessage(draft, recipient);
                }
                break;
              // Future channels: SMS, Bluesky, WhatsApp
              default:
                console.warn(`Channel ${channel} not yet implemented`);
                continue;
            }

            // Log success
            await repository.save({
              tenantId,
              messageId: draft.id,
              recipientUserId: recipient.userId,
              channel,
              status: 'sent',
              externalId,
            });
          } catch (error) {
            // Log failure
            await repository.save({
              tenantId,
              messageId: draft.id,
              recipientUserId: recipient.userId,
              channel,
              status: 'failed',
              error: error.message,
            });
          }
        }
      }
    }

    // Mark draft as sent
    await this.draftService.markAsSent(draftSlug);

    // Log audit entry
    await this.auditService.logAction(
      this.request.tenantId,
      draft.authorId,
      'message_sent',
      {
        groupId: draft.groupId,
        eventId: draft.eventId,
        messageId: draft.id,
        additionalData: {
          recipientCount: recipients.length,
          channels: draft.channels,
        },
      },
    );
  }

  private async sendEmailMessage(
    draft: MessageDraftEntity,
    recipient: MessageRecipient,
  ): Promise<string> {
    try {
      const context = {
        draft,
        recipient,
        groupName: draft.group?.name,
        eventName: draft.event?.name,
        authorName: draft.author.firstName + ' ' + draft.author.lastName,
      };

      const externalId = await this.emailSender.sendEmail({
        to: recipient.email!,
        subject: draft.subject,
        text: draft.content,
        html: draft.htmlContent,
        templatePath: draft.templateId,
        context,
      });

      return externalId as string || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      // Log error but return placeholder ID to continue processing
      console.error('Email sending failed:', error);
      return `failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  private async validateGroupMessagePermissions(
    senderMember: any,
    messageRequest: SendMessageRequest,
  ): Promise<void> {
    // Individual messages: need SendGroupMessage permission
    if (
      messageRequest.recipientFilter === 'members' ||
      messageRequest.recipientUserIds
    ) {
      const canSendIndividual = await this.groupMemberService.hasPermission(
        senderMember.id,
        GroupPermission.SendGroupMessage,
      );
      if (!canSendIndividual) {
        throw new ForbiddenException(
          'Insufficient permissions to send individual messages',
        );
      }
      return;
    }

    // Bulk messages to all: need SendBulkGroupMessage permission
    if (messageRequest.recipientFilter === 'all') {
      const canSendBulk = await this.groupMemberService.hasPermission(
        senderMember.id,
        GroupPermission.SendBulkGroupMessage,
      );
      if (!canSendBulk) {
        throw new ForbiddenException(
          'Insufficient permissions to send bulk messages to all members',
        );
      }
    }

    // Messages to specific roles (admins/moderators): need appropriate permission
    if (
      messageRequest.recipientFilter === 'admins' ||
      messageRequest.recipientFilter === 'moderators'
    ) {
      const canSendIndividual = await this.groupMemberService.hasPermission(
        senderMember.id,
        GroupPermission.SendGroupMessage,
      );
      if (!canSendIndividual) {
        throw new ForbiddenException(
          'Insufficient permissions to send messages to group roles',
        );
      }
    }
  }

  private async validateEventMessagePermissions(
    senderAttendee: any,
    messageRequest: SendMessageRequest,
  ): Promise<void> {
    // Individual messages: need SendEventMessage permission
    if (
      messageRequest.recipientFilter === 'attendees' ||
      messageRequest.recipientUserIds
    ) {
      const canSendIndividual = await this.eventAttendeeService.hasPermission(
        senderAttendee.id,
        EventAttendeePermission.SendEventMessage,
      );
      if (!canSendIndividual) {
        throw new ForbiddenException(
          'Insufficient permissions to send individual event messages',
        );
      }
      return;
    }

    // Bulk messages to all: need SendBulkEventMessage permission
    if (messageRequest.recipientFilter === 'all') {
      const canSendBulk = await this.eventAttendeeService.hasPermission(
        senderAttendee.id,
        EventAttendeePermission.SendBulkEventMessage,
      );
      if (!canSendBulk) {
        throw new ForbiddenException(
          'Insufficient permissions to send bulk messages to all attendees',
        );
      }
    }

    // Messages to specific roles (admins/moderators): need appropriate permission
    if (
      messageRequest.recipientFilter === 'admins' ||
      messageRequest.recipientFilter === 'moderators'
    ) {
      const canSendIndividual = await this.eventAttendeeService.hasPermission(
        senderAttendee.id,
        EventAttendeePermission.SendEventMessage,
      );
      if (!canSendIndividual) {
        throw new ForbiddenException(
          'Insufficient permissions to send messages to event organizers',
        );
      }
    }
  }

  private async getGroupRecipients(
    groupId: number,
    filter: string,
  ): Promise<MessageRecipient[]> {
    // Get group members based on filter
    const members = await this.groupMemberService.getGroupMembersForMessaging(
      groupId,
      filter,
    );

    return members.map((member) => ({
      userId: member.user.id,
      email: member.user.email || undefined,
      phoneNumber: undefined, // phoneNumber not available on UserEntity yet
      // For now, default to email preference
      preferredChannels: [MessageChannel.EMAIL],
    }));
  }

  private async getEventRecipients(
    eventId: number,
    filter: string,
  ): Promise<MessageRecipient[]> {
    // Get event attendees based on filter
    const attendees = await this.eventAttendeeService.getAttendeesForMessaging(
      eventId,
      filter,
    );

    return attendees.map((attendee) => ({
      userId: attendee.user.id,
      email: attendee.user.email || undefined,
      phoneNumber: undefined, // phoneNumber not available on UserEntity yet
      preferredChannels: [MessageChannel.EMAIL],
    }));
  }

  private getUserRecipients(_userIds: number[]): MessageRecipient[] {
    // Implementation would fetch users by IDs
    // For now, returning empty array as placeholder
    return [];
  }

  private async getTargetRecipients(targetUser: {
    type: 'group_member' | 'group_admins' | 'event_attendee' | 'event_organizers';
    groupMemberId?: number;
    attendeeId?: number;
  }): Promise<MessageRecipient[]> {
    switch (targetUser.type) {
      case 'group_member':
        if (!targetUser.groupMemberId) {
          throw new BadRequestException('groupMemberId required for group_member target');
        }
        // Get the specific group member
        const groupMember = await this.groupMemberService.showGroupDetailsMember(targetUser.groupMemberId);
        if (!groupMember || !groupMember.user) {
          return [];
        }
        return [{
          userId: groupMember.user.id,
          email: groupMember.user.email || undefined,
          phoneNumber: undefined,
          preferredChannels: [MessageChannel.EMAIL],
        }];

      case 'group_admins':
        if (!targetUser.groupMemberId) {
          throw new BadRequestException('groupMemberId required for group_admins target');
        }
        // Get group from the member and find all admins
        const member = await this.groupMemberService.showGroupDetailsMember(targetUser.groupMemberId);
        if (!member || !member.group) {
          return [];
        }
        const groupAdmins = await this.groupMemberService.getGroupMembersForMessaging(
          member.group.id,
          'admins',
        );
        return groupAdmins.map((admin) => ({
          userId: admin.user.id,
          email: admin.user.email || undefined,
          phoneNumber: undefined,
          preferredChannels: [MessageChannel.EMAIL],
        }));

      case 'event_attendee':
        if (!targetUser.attendeeId) {
          throw new BadRequestException('attendeeId required for event_attendee target');
        }
        // Get the specific event attendee
        const attendee = await this.eventAttendeeService.showEventAttendee(targetUser.attendeeId);
        if (!attendee || !attendee.user) {
          return [];
        }
        return [{
          userId: attendee.user.id,
          email: attendee.user.email || undefined,
          phoneNumber: undefined,
          preferredChannels: [MessageChannel.EMAIL],
        }];

      case 'event_organizers':
        if (!targetUser.attendeeId) {
          throw new BadRequestException('attendeeId required for event_organizers target');
        }
        // Get event from the attendee and find all organizers
        const eventAttendee = await this.eventAttendeeService.showEventAttendee(targetUser.attendeeId);
        if (!eventAttendee || !eventAttendee.event) {
          return [];
        }
        const organizers = await this.eventAttendeeService.getAttendeesForMessaging(
          eventAttendee.event.id,
          'admins',
        );
        return organizers.map((organizer) => ({
          userId: organizer.user.id,
          email: organizer.user.email || undefined,
          phoneNumber: undefined,
          preferredChannels: [MessageChannel.EMAIL],
        }));

      default:
        throw new BadRequestException(`Unknown target user type: ${targetUser.type}`);
    }
  }

  /**
   * Send a system message immediately without creating a draft
   * Used for authentication emails, notifications, etc.
   *
   * @param options Message options
   * @returns Message log entry
   */
  async sendSystemMessage(options: {
    recipientEmail?: string;
    recipientUserId?: number;
    subject: string;
    content: string;
    htmlContent?: string;
    templateId?: string;
    context?: any;
    type: MessageType;
    channels?: MessageChannel[];
    systemReason?: string; // e.g., 'user_signup', 'password_reset', 'role_changed'
    metadata?: any;
    targetUser?: {
      type: 'group_member' | 'group_admins' | 'event_attendee' | 'event_organizers';
      groupMemberId?: number;
      attendeeId?: number;
    };
  }): Promise<MessageLogEntity | MessageLogEntity[]> {
    const tenantId = this.request.tenantId;
    const repository = await this.getLogRepository();

    // Get system user ID from config or use default admin (1)
    const systemUserId =
      this.tenantService.getTenantConfig(tenantId).systemUserId || 1;

    // Get recipients based on targetUser type or direct email/userId
    let recipients: MessageRecipient[] = [];

    if (options.targetUser) {
      recipients = await this.getTargetRecipients(options.targetUser);
    } else {
      // Legacy single recipient handling
      let recipientUser: any;
      if (options.recipientUserId) {
        recipientUser = await this.userService.findOne(options.recipientUserId);
      } else if (options.recipientEmail) {
        recipientUser = await this.userService.findByEmail(
          options.recipientEmail,
        );
      }

      if (!recipientUser) {
        throw new NotFoundException('Recipient user not found');
      }

      recipients = [{
        userId: recipientUser.id,
        email: recipientUser.email,
        phoneNumber: undefined,
        preferredChannels: options.channels || [MessageChannel.EMAIL],
      }];
    }

    if (recipients.length === 0) {
      throw new NotFoundException('No recipients found');
    }

    // Check if messaging is paused (but allow system messages through)
    const pauseStatus = await this.pauseService.isMessagingPaused();
    if (
      pauseStatus.paused &&
      options.systemReason !== 'user_signup' &&
      options.systemReason !== 'password_reset'
    ) {
      // Allow critical auth messages through even when paused
      await this.auditService.logAction(
        this.request.tenantId,
        systemUserId,
        'system_message_skipped',
        {
          additionalData: {
            recipientCount: recipients.length,
            type: options.type,
            systemReason: options.systemReason,
            reason: 'messaging_paused',
          },
        },
      );
      throw new BadRequestException('Messaging is currently paused');
    }

    // Send messages to all recipients
    const logs: MessageLogEntity[] = [];
    const channels = options.channels || [MessageChannel.EMAIL];

    for (const recipient of recipients) {
      for (const channel of channels) {
        if (recipient.preferredChannels.includes(channel)) {
          try {
            let externalId: string | undefined;

            switch (channel) {
              case MessageChannel.EMAIL:
                if (recipient.email) {
                  const result = await this.emailSender.sendEmail({
                    to: recipient.email,
                    subject: options.subject,
                    text: options.content,
                    html: options.htmlContent,
                    templatePath: options.templateId,
                    context: {
                      ...options.context,
                      recipient,
                      metadata: options.metadata,
                    },
                  });
                  externalId = result as string;
                }
                break;
              default:
                console.warn(`Channel ${channel} not yet implemented`);
                continue;
            }

            // Log success
            const log = repository.create({
              tenantId,
              messageId: undefined, // No draft for system messages
              recipientUserId: recipient.userId,
              channel,
              status: 'sent',
              externalId: externalId as string || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              metadata: {
                type: options.type,
                systemReason: options.systemReason,
                isSystemMessage: true,
                ...options.metadata,
              },
            });
            await repository.save(log);
            logs.push(log);

          } catch (error) {
            // Log failure
            const failedLog = repository.create({
              tenantId,
              messageId: undefined,
              recipientUserId: recipient.userId,
              channel,
              status: 'failed',
              error: error.message,
              metadata: {
                type: options.type,
                systemReason: options.systemReason,
                isSystemMessage: true,
                ...options.metadata,
              },
            });
            await repository.save(failedLog);
            logs.push(failedLog);
          }
        }
      }
    }

    // Log audit entry
    await this.auditService.logAction(
      this.request.tenantId,
      systemUserId,
      'system_message_sent',
      {
        additionalData: {
          recipientCount: recipients.length,
          type: options.type,
          systemReason: options.systemReason,
          logCount: logs.length,
        },
      },
    );

    return logs.length === 1 ? logs[0] : logs;
  }
}
