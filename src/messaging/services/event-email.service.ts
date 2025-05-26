import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { GroupMemberService } from '../../group-member/group-member.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { UnifiedMessagingService } from './unified-messaging.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

/**
 * Enhanced service for sending emails from event contexts
 * Composes smaller services to provide full messaging functionality
 * without circular dependencies
 */
@Injectable()
export class EventEmailService {
  constructor(
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
    @Inject(forwardRef(() => UnifiedMessagingService))
    private readonly messagingService: UnifiedMessagingService,
    private readonly tenantService: TenantConnectionService,
  ) {}

  /**
   * Send role update notification email with template and proper context
   */
  async sendRoleUpdateEmailByMemberId(data: {
    groupMemberId: number;
    tenantId: string;
  }): Promise<boolean> {
    try {
      // Get group member with all relations needed for template
      const groupMember =
        await this.groupMemberService.getGroupMemberForEmailTemplate(
          data.groupMemberId,
        );

      if (!groupMember || !groupMember.user?.email) {
        console.warn(
          `No group member or email found for groupMemberId: ${data.groupMemberId}`,
        );
        return false;
      }

      // Get tenant configuration for template context
      const tenantConfig = this.tenantService.getTenantConfig(data.tenantId);

      // Send email using template system
      await this.messagingService.sendSystemMessage({
        recipientEmail: groupMember.user.email,
        subject: 'Your group role has been updated',
        content: `Your role in the group "${groupMember.group.name}" has been updated to ${groupMember.groupRole.name}. Please check the group details for more information.`,
        templateId: 'group/group-member-role-updated',
        context: {
          groupMember,
          tenantConfig,
        },
        type: MessageType.GROUP_ANNOUNCEMENT,
        channels: [MessageChannel.EMAIL],
        systemReason: 'role_updated',
        tenantId: data.tenantId,
      });

      console.log(
        `Role update email sent successfully to ${groupMember.user.email} for group ${groupMember.group.slug}`,
      );
      return true;
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
      // Implementation for member joined notifications would go here
      // This would get group admins and notify them using the template system
      console.log(
        `Member joined email would be sent for user ${data.newMemberSlug} in group ${data.groupSlug}`,
      );
      // TODO: Implement when needed
      return Promise.resolve(true);
    } catch (error) {
      console.error('Error sending member joined email:', error);
      return Promise.resolve(false);
    }
  }
}
