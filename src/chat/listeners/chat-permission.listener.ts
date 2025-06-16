import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ChatRoomService } from '../rooms/chat-room.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { UserService } from '../../user/user.service';
import { Trace } from '../../utils/trace.decorator';
import {
  ChatPermissionSyncEvent,
  UserJoinedChatEvent,
  CHAT_EVENTS,
} from '../events/chat-permission.events';

/**
 * Listener service for chat permission events
 * Handles automatic Matrix permission synchronization when user roles change
 */
@Injectable()
export class ChatPermissionListener {
  private readonly logger = new Logger(ChatPermissionListener.name);

  constructor(
    private readonly chatRoomService: ChatRoomService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly userService: UserService,
  ) {}

  /**
   * Handle permission sync requirements when user roles change
   */
  @OnEvent(CHAT_EVENTS.PERMISSION_SYNC_REQUIRED)
  @Trace('chat-permission.handlePermissionSync')
  async handlePermissionSyncRequired(
    event: ChatPermissionSyncEvent,
  ): Promise<void> {
    try {
      this.logger.log(
        `Permission sync required: User ${event.userSlug} role ${event.action} for ${event.entityType} ${event.entitySlug}`,
      );

      // Get chat rooms for the entity
      const chatRooms =
        event.entityType === 'event'
          ? await this.chatRoomService.getEventChatRooms(event.entityId)
          : await this.chatRoomService.getGroupChatRooms(event.entityId);

      if (!chatRooms || chatRooms.length === 0) {
        this.logger.debug(
          `No chat rooms found for ${event.entityType} ${event.entitySlug}`,
        );
        return;
      }

      // Update Matrix permissions for each chat room
      for (const room of chatRooms) {
        await this.syncUserPermissionsInRoom(event, room.matrixRoomId);
      }

      this.logger.log(
        `Successfully synced Matrix permissions for user ${event.userSlug} in ${chatRooms.length} rooms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync permissions for user ${event.userSlug} in ${event.entityType} ${event.entitySlug}: ${error.message}`,
        error.stack,
      );
      // Don't throw - permission sync failures shouldn't break role changes
    }
  }

  /**
   * Handle when a user joins a chat room to ensure proper permissions
   */
  @OnEvent(CHAT_EVENTS.USER_JOINED)
  @Trace('chat-permission.handleUserJoined')
  async handleUserJoinedChat(event: UserJoinedChatEvent): Promise<void> {
    try {
      this.logger.log(
        `User ${event.userSlug} joined chat for ${event.entityType} ${event.entitySlug}, syncing permissions`,
      );

      // Determine the actual user role based on entity type
      let actualRole = event.userRole;

      if (event.entityType === 'group') {
        try {
          const groupMember =
            await this.groupMemberService.findGroupMemberByUserId(
              event.userId,
              event.entityId,
            );
          actualRole = groupMember?.groupRole?.name || 'MEMBER';
        } catch (roleError) {
          this.logger.warn(
            `Could not determine group role for user ${event.userSlug}: ${roleError.message}`,
          );
        }
      } else if (event.entityType === 'event') {
        try {
          const eventAttendee =
            await this.eventAttendeeService.findEventAttendeeByUserId(
              event.userId,
              event.entityId,
            );
          actualRole = eventAttendee?.role?.name || 'ATTENDEE';
        } catch (roleError) {
          this.logger.warn(
            `Could not determine event role for user ${event.userSlug}: ${roleError.message}`,
          );
        }
      }

      await this.syncUserPermissionsInRoom(
        {
          userId: event.userId,
          userSlug: event.userSlug,
          matrixUserId: event.matrixUserId,
          entityId: event.entityId,
          entitySlug: event.entitySlug,
          entityType: event.entityType,
          newRole: actualRole,
          tenantId: event.tenantId,
          action: 'granted',
        },
        event.roomId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync permissions for user ${event.userSlug} joining ${event.entityType} ${event.entitySlug}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Sync user permissions in a specific Matrix room
   */
  private async syncUserPermissionsInRoom(
    event: ChatPermissionSyncEvent,
    matrixRoomId: string,
  ): Promise<void> {
    const powerLevel = this.calculateRequiredPowerLevel(event);

    if (powerLevel === null) {
      this.logger.debug(
        `No power level change needed for user ${event.userSlug} with role ${event.newRole}`,
      );
      return;
    }

    if (event.action === 'revoked') {
      // User lost permissions, set to regular user level
      await this.chatRoomService.updateUserPowerLevel(
        matrixRoomId,
        event.matrixUserId,
        0, // Regular user level
      );
      this.logger.log(
        `Revoked moderator permissions for user ${event.userSlug} in room ${matrixRoomId}`,
      );
    } else {
      // User gained or maintained permissions
      await this.chatRoomService.updateUserPowerLevel(
        matrixRoomId,
        event.matrixUserId,
        powerLevel,
      );
      this.logger.log(
        `Granted power level ${powerLevel} to user ${event.userSlug} in room ${matrixRoomId}`,
      );
    }
  }

  /**
   * Calculate the required Matrix power level based on user role
   */
  private calculateRequiredPowerLevel(
    event: ChatPermissionSyncEvent,
  ): number | null {
    const role = event.newRole?.toUpperCase();

    // Moderator-level roles that can redact messages (power level 50)
    const moderatorRoles = [
      'HOST',
      'CO_HOST',
      'MODERATOR',
      'ADMIN',
      'OWNER',
      'CREATOR',
    ];

    if (moderatorRoles.includes(role)) {
      return 50; // Moderator level - can redact messages
    }

    // Admin-level roles (power level 100) - future use
    const adminRoles = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
    if (adminRoles.includes(role)) {
      return 100; // Admin level
    }

    // Regular users or roles that don't need special permissions
    const regularRoles = [
      'MEMBER',
      'ATTENDEE',
      'GUEST',
      'PARTICIPANT',
      'CONFIRMED',
      'PENDING',
    ];

    if (regularRoles.includes(role)) {
      return 0; // Regular user level
    }

    // Unknown role - no change needed
    this.logger.warn(
      `Unknown role '${event.newRole}' for user ${event.userSlug}, no power level change`,
    );
    return null;
  }
}
