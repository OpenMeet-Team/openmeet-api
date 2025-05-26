import { Injectable, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { UnifiedMessagingService } from '../messaging/services/unified-messaging.service';
import { MessageType } from '../messaging/interfaces/message.interface';

export interface EmailSimulationRequest {
  email: string;
  emailType: 'signup' | 'password_reset' | 'email_change';
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly messagingService: UnifiedMessagingService,
    private readonly configService: ConfigService,
  ) {}

  async simulateSignupEmail(email: string): Promise<void> {
    console.log(
      '[DEBUG] AdminService.simulateSignupEmail called with email:',
      email,
    );
    const tenantId = this.request.tenantId;
    console.log('[DEBUG] AdminService tenantId:', tenantId);

    // Generate a mock hash for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);

    const context = {
      title: 'Confirm your email',
      text1: 'Welcome to our platform! Please confirm your email address.',
      text2: 'Click the link above to activate your account.',
      text3: 'If you did not create this account, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-email/${mockHash}`,
      hash: mockHash,
      actionTitle: 'Confirm Email',
      app_name: 'OpenMeet',
    };

    console.log(
      '[DEBUG] AdminService about to call messagingService.sendSystemMessage',
    );
    try {
      await this.messagingService.sendSystemMessage({
        recipientEmail: email,
        subject: context.title,
        content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
        htmlContent: undefined,
        templateId: 'auth/activation.mjml.ejs',
        context,
        type: MessageType.ADMIN_CONTACT,
        systemReason: 'email_simulation_signup',
        tenantId,
      });
      console.log(
        '[DEBUG] AdminService sendSystemMessage completed successfully',
      );
    } catch (error) {
      console.error('[DEBUG] AdminService sendSystemMessage failed:', error);
      throw error;
    }
  }

  async simulatePasswordResetEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;

    // Generate a mock hash and expiry for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);
    const tokenExpires = Date.now() + 3600000; // 1 hour from now

    const context = {
      title: 'Reset your password',
      text1: 'You requested a password reset for your account.',
      text2: 'Click the link above to reset your password.',
      text3: 'This link will expire soon for security reasons.',
      text4: 'If you did not request this reset, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/password-change/${mockHash}`,
      hash: mockHash,
      tokenExpires,
      actionTitle: 'Reset Password',
      app_name: 'OpenMeet',
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}\n\n${context.text4}`,
      htmlContent: undefined,
      templateId: 'auth/reset-password.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_password_reset',
      tenantId,
    });
  }

  async simulateEmailChangeEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;

    // Generate a mock hash for the simulation
    const mockHash = 'simulated-' + Math.random().toString(36).substring(2, 15);

    const context = {
      title: 'Confirm your new email',
      text1: 'Please confirm your new email address.',
      text2: 'Click the link below to confirm your new email.',
      text3: 'If you did not request this change, please ignore this email.',
      url: `${process.env.FRONTEND_DOMAIN}/auth/confirm-new-email/${mockHash}`,
      hash: mockHash,
      actionTitle: 'Confirm New Email',
      app_name: 'OpenMeet',
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.text1}\n\n${context.url}\n\n${context.text2}\n\n${context.text3}`,
      htmlContent: undefined,
      templateId: 'auth/confirm-new-email.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_email_change',
      tenantId,
    });
  }

  async simulateChatNewMessageEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;
    const context = {
      title: 'New message received',
      participant: {
        firstName: 'Demo',
        lastName: 'Sender',
        slug: 'demo-sender-abc123',
      },
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `You have a new message from ${context.participant.firstName} ${context.participant.lastName}.`,
      htmlContent: undefined,
      templateId: 'chat/chat-new-message.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_chat_new_message',
      tenantId,
    });
  }

  async simulateGroupMemberRoleUpdatedEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;
    const context = {
      title: 'Your role has been updated',
      groupMember: {
        user: {
          name: 'Demo User',
          firstName: 'Demo',
          lastName: 'User',
          slug: 'demo-user-abc123',
        },
        group: {
          name: 'Sample Group',
          slug: 'sample-group-def456',
        },
        groupRole: {
          name: 'Moderator',
        },
      },
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `Your role in ${context.groupMember.group.name} has been updated to ${context.groupMember.groupRole.name}.`,
      htmlContent: undefined,
      templateId: 'group/group-member-role-updated.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_group_member_role_updated',
      tenantId,
    });
  }

  async simulateGroupGuestJoinedEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;
    const context = {
      title: 'New member joined your group',
      groupMember: {
        user: {
          firstName: 'Demo',
          lastName: 'Guest',
          slug: 'demo-guest-abc123',
        },
        group: {
          name: 'Sample Group',
          slug: 'sample-group-def456',
        },
      },
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.groupMember.user.firstName} ${context.groupMember.user.lastName} has joined ${context.groupMember.group.name}.`,
      htmlContent: undefined,
      templateId: 'group/group-guest-joined.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_group_guest_joined',
      tenantId,
    });
  }

  async simulateEventAttendeeGuestJoinedEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;
    const context = {
      title: 'New attendee joined your event',
      eventAttendee: {
        user: {
          firstName: 'Demo',
          lastName: 'Attendee',
          slug: 'demo-attendee-abc123',
        },
        event: {
          name: 'Sample Event',
          slug: 'sample-event-def456',
        },
        approvalAnswer:
          'I am interested in learning more about this topic and connecting with like-minded people.',
      },
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `${context.eventAttendee.user.firstName} ${context.eventAttendee.user.lastName} has joined ${context.eventAttendee.event.name}.`,
      htmlContent: undefined,
      templateId: 'event/attendee-guest-joined.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_event_attendee_guest_joined',
      tenantId,
    });
  }

  async simulateEventAttendeeStatusChangedEmail(email: string): Promise<void> {
    const tenantId = this.request.tenantId;
    const context = {
      title: 'Event attendance status changed',
      eventAttendee: {
        event: {
          name: 'Sample Event',
          slug: 'sample-event-def456',
        },
        status: 'Confirmed',
        role: {
          name: 'Attendee',
        },
      },
    };

    await this.messagingService.sendSystemMessage({
      recipientEmail: email,
      subject: context.title,
      content: `Your status for ${context.eventAttendee.event.name} has been updated to ${context.eventAttendee.status}.`,
      htmlContent: undefined,
      templateId: 'event/attendee-status-changed.mjml.ejs',
      context,
      type: MessageType.ADMIN_CONTACT,
      systemReason: 'email_simulation_event_attendee_status_changed',
      tenantId,
    });
  }
}
