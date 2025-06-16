import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ChatPermissionSyncEvent,
  UserJoinedChatEvent,
  CHAT_EVENTS,
} from '../events/chat-permission.events';

/**
 * Service for emitting chat permission events
 * This service provides a clean interface for other services to emit chat-related events
 */
@Injectable()
export class ChatPermissionEmitterService {
  private readonly logger = new Logger(ChatPermissionEmitterService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit event when user role changes and Matrix permissions need syncing
   */
  emitPermissionSyncRequired(data: {
    userId: number;
    userSlug: string;
    matrixUserId: string;
    entityId: number;
    entitySlug: string;
    entityType: 'event' | 'group';
    newRole: string;
    oldRole?: string;
    tenantId: string;
    action: 'granted' | 'revoked' | 'updated';
  }): void {
    const event: ChatPermissionSyncEvent = {
      ...data,
    };

    this.logger.debug(
      `Emitting permission sync event for user ${data.userSlug} in ${data.entityType} ${data.entitySlug}`,
    );

    this.eventEmitter.emit(CHAT_EVENTS.PERMISSION_SYNC_REQUIRED, event);
  }

  /**
   * Emit event when user joins a chat room
   */
  emitUserJoinedChat(data: {
    userId: number;
    userSlug: string;
    matrixUserId: string;
    roomId: string;
    entityId: number;
    entitySlug: string;
    entityType: 'event' | 'group';
    userRole: string;
    tenantId: string;
  }): void {
    const event: UserJoinedChatEvent = {
      ...data,
    };

    this.logger.debug(
      `Emitting user joined chat event for user ${data.userSlug} in room ${data.roomId}`,
    );

    this.eventEmitter.emit(CHAT_EVENTS.USER_JOINED, event);
  }

  /**
   * Convenience method for event host/moderator role changes
   */
  emitEventRoleChanged(data: {
    userId: number;
    userSlug: string;
    matrixUserId: string;
    eventId: number;
    eventSlug: string;
    newRole: string;
    oldRole?: string;
    tenantId: string;
    action: 'granted' | 'revoked' | 'updated';
  }): void {
    this.emitPermissionSyncRequired({
      ...data,
      entityId: data.eventId,
      entitySlug: data.eventSlug,
      entityType: 'event',
    });
  }

  /**
   * Convenience method for group member role changes
   */
  emitGroupRoleChanged(data: {
    userId: number;
    userSlug: string;
    matrixUserId: string;
    groupId: number;
    groupSlug: string;
    newRole: string;
    oldRole?: string;
    tenantId: string;
    action: 'granted' | 'revoked' | 'updated';
  }): void {
    this.emitPermissionSyncRequired({
      ...data,
      entityId: data.groupId,
      entitySlug: data.groupSlug,
      entityType: 'group',
    });
  }
}
