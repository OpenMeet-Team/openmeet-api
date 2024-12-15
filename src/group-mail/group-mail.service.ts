import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { GroupPermission } from '../core/constants/constant';

@Injectable()
export class GroupMailService {
  constructor(
    private readonly mailService: MailService,
    private readonly groupMemberService: GroupMemberService,
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
}
