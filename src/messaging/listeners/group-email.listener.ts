import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { MessageType, MessageChannel } from '../interfaces/message.interface';

export interface GroupMemberRoleUpdatedEvent {
  groupMemberId: number;
  tenantId: string;
  groupSlug?: string;
  userSlug?: string;
}

export interface GroupMemberJoinedEvent {
  groupMemberId: number;
  tenantId: string;
  groupSlug?: string;
  userSlug?: string;
}

@Injectable()
export class GroupEmailListener {
  constructor(private readonly messagingService: UnifiedMessagingService) {}

  @OnEvent('group.member.role.updated')
  async handleGroupMemberRoleUpdated(event: GroupMemberRoleUpdatedEvent): Promise<void> {
    try {
      // Send system message notification about role update
      await this.messagingService.sendSystemMessage({
        type: MessageType.GROUP_ANNOUNCEMENT,
        subject: 'Your group role has been updated',
        content: 'Your role in the group has been updated. Please check the group details for more information.',
        channels: [MessageChannel.EMAIL],
        templateId: 'group/group-member-role-updated',
        metadata: {
          eventType: 'group.member.role.updated',
          groupMemberId: event.groupMemberId,
          tenantId: event.tenantId,
        },
        targetUser: {
          type: 'group_member',
          groupMemberId: event.groupMemberId,
        },
      });
    } catch (error) {
      console.error('Error handling group member role updated event:', error);
    }
  }

  @OnEvent('group.member.joined')
  async handleGroupMemberJoined(event: GroupMemberJoinedEvent): Promise<void> {
    try {
      // Send system message notification to group admins about new member
      await this.messagingService.sendSystemMessage({
        type: MessageType.GROUP_ANNOUNCEMENT,
        subject: 'New member joined your group',
        content: 'A new member has joined your group. You can view the member details in the group management section.',
        channels: [MessageChannel.EMAIL],
        templateId: 'group/group-guest-joined',
        metadata: {
          eventType: 'group.member.joined',
          groupMemberId: event.groupMemberId,
          tenantId: event.tenantId,
        },
        targetUser: {
          type: 'group_admins',
          groupMemberId: event.groupMemberId,
        },
      });
    } catch (error) {
      console.error('Error handling group member joined event:', error);
    }
  }
}