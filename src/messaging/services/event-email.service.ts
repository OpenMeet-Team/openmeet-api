import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/user.service';
import { MessageSenderService } from './message-sender.service';
import { MessageLoggerService } from './message-logger.service';
import { MessagePolicyService } from './message-policy.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

/**
 * Enhanced service for sending emails from event contexts
 * Composes smaller services to provide full messaging functionality
 * without circular dependencies
 */
@Injectable()
export class EventEmailService {
  constructor(
    private readonly userService: UserService,
    private readonly messageSender: MessageSenderService,
    private readonly messageLogger: MessageLoggerService,
    private readonly messagePolicy: MessagePolicyService,
  ) {}

  /**
   * Send role update notification email with full messaging features
   */
  async sendRoleUpdateEmail(data: {
    userSlug: string;
    groupSlug: string;
    tenantId: string;
  }): Promise<boolean> {
    try {
      // Get user through proper service
      const user = await this.userService.findBySlug(data.userSlug);
      
      if (!user || !user.email) {
        console.warn(`No user or email found for slug: ${data.userSlug}`);
        return false;
      }

      // Check policies (rate limits, pause status)
      const policyCheck = await this.messagePolicy.checkPolicies({
        tenantId: data.tenantId,
        userId: user.id,
        systemReason: 'role_updated',
        skipRateLimit: true, // Role updates are system-generated, skip rate limits
      });

      if (!policyCheck.allowed) {
        console.warn(`Role update email blocked by policy: ${policyCheck.reason}`);
        await this.messagePolicy.logPolicyViolation({
          tenantId: data.tenantId,
          userId: user.id,
          action: 'message_send_skipped',
          reason: policyCheck.reason || 'Unknown policy violation',
        });
        return false;
      }

      // Send email
      const externalId = await this.messageSender.sendSystemEmail({
        recipientEmail: user.email,
        subject: 'Your group role has been updated',
        text: `Your role in the group "${data.groupSlug}" has been updated. Please check the group details for more information.`,
        html: `<p>Your role in the group "<strong>${data.groupSlug}</strong>" has been updated.</p><p>Please check the group details for more information.</p>`,
        tenantId: data.tenantId,
      });

      // Log the email activity
      if (externalId) {
        await this.messageLogger.logSystemEmail({
          tenantId: data.tenantId,
          recipientUserId: user.id,
          status: 'sent',
          externalId,
          type: MessageType.GROUP_ANNOUNCEMENT,
          systemReason: 'role_updated',
        });
        
        console.log(`Role update email sent and logged successfully to ${user.email} for group ${data.groupSlug}`);
        return true;
      } else {
        // Log failure
        await this.messageLogger.logSystemEmail({
          tenantId: data.tenantId,
          recipientUserId: user.id,
          status: 'failed',
          type: MessageType.GROUP_ANNOUNCEMENT,
          systemReason: 'role_updated',
        });
        
        console.error('Failed to send role update email');
        return false;
      }
    } catch (error) {
      console.error('Error sending role update email:', error);
      return false;
    }
  }

  /**
   * Send group member joined notification email
   */
  async sendMemberJoinedEmail(data: {
    newMemberSlug: string;
    groupSlug: string;
    tenantId: string;
    notifyAdmins?: boolean;
  }): Promise<boolean> {
    try {
      // Implementation for member joined notifications
      // This would get group admins and notify them
      console.log(`Member joined email would be sent for user ${data.newMemberSlug} in group ${data.groupSlug}`);
      // TODO: Implement when needed
      return true;
    } catch (error) {
      console.error('Error sending member joined email:', error);
      return false;
    }
  }

  /**
   * Send generic event notification email
   */
  async sendEventNotificationEmail(data: {
    recipientSlug: string;
    subject: string;
    textContent: string;
    htmlContent: string;
    tenantId: string;
  }): Promise<boolean> {
    try {
      const user = await this.userService.findBySlug(data.recipientSlug);
      
      if (!user || !user.email) {
        console.warn(`No user or email found for slug: ${data.recipientSlug}`);
        return false;
      }

      await this.messageSender.sendSystemEmail({
        recipientEmail: user.email,
        subject: data.subject,
        text: data.textContent,
        html: data.htmlContent,
        tenantId: data.tenantId,
      });

      console.log(`Event notification email sent successfully to ${user.email}`);
      return true;
    } catch (error) {
      console.error('Error sending event notification email:', error);
      return false;
    }
  }
}