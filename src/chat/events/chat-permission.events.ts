/**
 * Events for chat permission management
 * These events are emitted when user roles change and need Matrix permission sync
 */

export interface ChatPermissionSyncEvent {
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
}

export interface ChatRoomCreatedEvent {
  roomId: string;
  entityId: number;
  entitySlug: string;
  entityType: 'event' | 'group';
  creatorUserId: number;
  creatorMatrixUserId: string;
  tenantId: string;
}

export interface UserJoinedChatEvent {
  userId: number;
  userSlug: string;
  matrixUserId: string;
  roomId: string;
  entityId: number;
  entitySlug: string;
  entityType: 'event' | 'group';
  userRole: string;
  tenantId: string;
}

// Event names as constants
export const CHAT_EVENTS = {
  PERMISSION_SYNC_REQUIRED: 'chat.permission.sync.required',
  ROOM_CREATED: 'chat.room.created',
  USER_JOINED: 'chat.user.joined',
  USER_ROLE_CHANGED: 'chat.user.role.changed',
} as const;
