import { Injectable, NotFoundException } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { UserService } from '../user/user.service';
import { GroupPermission } from '../core/constants/constant';

export interface AdminMessageResult {
  success: boolean;
  messageId: string;
  deliveredCount: number;
  failedCount: number;
  errors?: string[];
}

@Injectable()
export class GroupMailService {
  constructor(
    private readonly mailService: MailService,
    private readonly groupMemberService: GroupMemberService,
    private readonly userService: UserService,
  ) {}

  async sendGroupGuestJoined(groupMemberId: number) {
    const groupMember =
      await this.groupMemberService.getMailServiceGroupMember(groupMemberId);
    const admins =
      await this.groupMemberService.getMailServiceGroupMembersByPermission(
        groupMember.group.id,
        GroupPermission.ManageMembers,
      );

    for (const admin of admins) {
      if (!admin.email) {
        return;
      }

      await this.mailService.groupGuestJoined({
        to: admin.email,
        data: {
          groupMember,
        },
      });
    }
  }

  async sendGroupMemberRoleUpdated(groupMemberId: number) {
    const groupMember =
      await this.groupMemberService.getMailServiceGroupMember(groupMemberId);
    if (!groupMember.user.email) {
      return;
    }
    await this.mailService.groupMemberRoleUpdated({
      to: groupMember.user.email,
      data: {
        groupMember,
      },
    });
  }

  async sendAdminMessageToMembers(
    group: any, // Group entity passed from calling code
    adminUserId: number,
    subject: string,
    message: string,
    targetUserIds?: number[], // Optional array of specific user IDs to target
  ): Promise<AdminMessageResult> {
    // Get admin and members info
    const admin = await this.userService.findById(adminUserId);

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    // Get members based on targeting
    let members;
    if (targetUserIds && targetUserIds.length > 0) {
      // Get specific users if provided
      members = await this.groupMemberService.getSpecificGroupMembers(
        group.id,
        targetUserIds,
      );
    } else {
      // Get all group members who can see the group
      members =
        await this.groupMemberService.getMailServiceGroupMembersByPermission(
          group.id,
          GroupPermission.SeeGroup,
        );
    }

    if (members.length === 0) {
      throw new NotFoundException('No members found for this group');
    }

    let deliveredCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Create a set to track unique email addresses to avoid duplicates
    const emailsSent = new Set<string>();

    // Always include the admin who sent the message
    if (admin.email) {
      try {
        await this.mailService.sendAdminGroupMessage({
          to: admin.email,
          data: {
            group,
            admin,
            subject,
            message,
          },
        });
        deliveredCount++;
        emailsSent.add(admin.email);
      } catch (error) {
        failedCount++;
        errors.push(`Failed to send to admin ${admin.email}: ${error.message}`);
      }
    }

    // Send individual emails to members with email addresses
    for (const member of members) {
      if (member.email && !emailsSent.has(member.email)) {
        try {
          await this.mailService.sendAdminGroupMessage({
            to: member.email,
            data: {
              group,
              admin,
              subject,
              message,
            },
          });
          deliveredCount++;
          emailsSent.add(member.email);
        } catch (error) {
          failedCount++;
          errors.push(`Failed to send to ${member.email}: ${error.message}`);
        }
      }
    }

    return {
      success: failedCount === 0,
      messageId: `group_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deliveredCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async previewAdminMessage(
    group: any, // Group entity passed from calling code
    adminUserId: number,
    subject: string,
    message: string,
    testEmail: string,
    targetUserIds?: number[], // Optional array of specific user IDs to target
  ): Promise<void> {
    // Get admin info
    const admin = await this.userService.findById(adminUserId);

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    // Send preview email
    await this.mailService.sendAdminGroupMessage({
      to: testEmail,
      data: {
        group,
        admin,
        subject: `[PREVIEW] ${subject}`,
        message,
      },
    });
  }

  async sendMemberContactToAdmins(
    group: any, // Group entity passed from calling code
    memberId: number,
    contactType: string,
    subject: string,
    message: string,
  ): Promise<AdminMessageResult> {
    // Get member info
    const member = await this.userService.findById(memberId);

    if (!member) {
      throw new NotFoundException('Member user not found');
    }

    // Get all group admins
    const admins =
      await this.groupMemberService.getMailServiceGroupMembersByPermission(
        group.id,
        GroupPermission.ManageMembers, // Target group admins
      );

    if (admins.length === 0) {
      throw new NotFoundException('No admins found for this group');
    }

    let deliveredCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Send notification to all admins
    for (const admin of admins) {
      if (admin.email) {
        try {
          await this.mailService.sendMemberContactNotification({
            to: admin.email,
            data: {
              group,
              member,
              contactType,
              subject,
              message,
            },
          });
          deliveredCount++;
        } catch (error) {
          failedCount++;
          errors.push(
            `Failed to send to admin ${admin.email}: ${error.message}`,
          );
        }
      }
    }

    return {
      success: failedCount === 0,
      messageId: `member_contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deliveredCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
