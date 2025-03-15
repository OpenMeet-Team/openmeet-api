// Using dynamic import (at runtime) instead of static import for ESM compatibility
// The actual matrix-js-sdk import will happen in MatrixService
type MatrixSdk = any;
import { Socket } from 'socket.io';

// Add explicit type declaration for the mock used in tests
declare module 'matrix-js-sdk' {
  export const __mockClient: any;
}

export interface MatrixClientWithContext {
  client: any; // MatrixClient
  userId: string;
}

export interface CreateUserOptions {
  username: string;
  password: string;
  displayName?: string;
  adminUser?: boolean;
}

export interface MatrixUserInfo {
  userId: string;
  accessToken: string;
  deviceId: string;
}

export interface CreateRoomOptions {
  name: string;
  topic?: string;
  isPublic?: boolean;
  isDirect?: boolean;
  inviteUserIds?: string[];
  powerLevels?: Record<string, number>;
  powerLevelContentOverride?: any; // IPowerLevelsContent
}

export interface RoomInfo {
  roomId: string;
  name: string;
  topic?: string;
  joinedMembers?: string[];
  invitedMembers?: string[];
  membership?: 'join' | 'invite' | 'leave' | 'ban';
}

export interface SendMessageOptions {
  roomId: string;
  userId: string;
  accessToken: string;
  content: string;
  messageType?: string;
  deviceId?: string;
  // Legacy properties
  body?: string;
  msgtype?: string;
  formatted_body?: string;
  format?: string;
  senderUserId?: string;
  senderAccessToken?: string;
  senderDeviceId?: string;
  relationshipType?: string;
  relationshipEventId?: string;
}

export interface Message {
  eventId: string;
  roomId: string;
  sender: string;
  content: any;
  timestamp: number;
}

export interface InviteUserOptions {
  roomId: string;
  userId: string;
}

export interface StartClientOptions {
  userId: string;
  accessToken: string;
  deviceId?: string;
  onEvent?: (event: any) => void;
  onSync?: (state: string, prevState: string | null) => void;
  wsClient?: Socket; // WebSocket client to associate with this Matrix client
}

export interface ActiveClient {
  client: any; // MatrixClient
  userId: string;
  lastActivity: Date;
  eventCallbacks: ((event: any) => void)[];
  wsClient?: Socket; // WebSocket client associated with this Matrix client
}
