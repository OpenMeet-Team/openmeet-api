import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UnifiedMessagingService } from '../services/unified-messaging.service';
import { EventEmailService } from '../services/event-email.service';
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
  constructor(
    private readonly messagingService: UnifiedMessagingService,
    private readonly eventEmailService: EventEmailService,
  ) {}

  @OnEvent('group.member.role.updated')
  async handleGroupMemberRoleUpdated(
    event: GroupMemberRoleUpdatedEvent,
  ): Promise<void> {
    try {
      // Use EventEmailService with proper template context
      if (event.groupMemberId && event.tenantId) {
        const success =
          await this.eventEmailService.sendRoleUpdateEmailByMemberId({
            groupMemberId: event.groupMemberId,
            tenantId: event.tenantId,
          });

        if (!success) {
          console.warn('Role update email failed, but role change succeeded');
        }
      } else {
        console.warn(
          'Missing required event data for role update email:',
          event,
        );
      }
    } catch (error) {
      console.error('Error handling group member role updated event:', error);
    }
  }

  @OnEvent('group.member.joined')
  async handleGroupMemberJoined(event: GroupMemberJoinedEvent): Promise<void> {
    try {
      // Send system message notification to group admins about new member
      await this.messagingService.sendSystemMessage({
        tenantId: event.tenantId,
        type: MessageType.GROUP_ANNOUNCEMENT,
        subject: 'New member joined your group',
        content:
          'A new member has joined your group. You can view the member details in the group management section.',
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
