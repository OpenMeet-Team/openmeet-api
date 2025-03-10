import * as MatrixSdk from 'matrix-js-sdk';

// Add explicit type declaration for the mock used in tests
declare module 'matrix-js-sdk' {
  export const __mockClient: any;
}

export interface MatrixClientWithContext {
  client: MatrixSdk.MatrixClient;
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
  powerLevelContentOverride?: MatrixSdk.IPowerLevelsContent;
}

export interface RoomInfo {
  roomId: string;
  name: string;
  topic?: string;
  joinedMembers?: string[];
  invitedMembers?: string[];
}

export interface SendMessageOptions {
  roomId: string;
  body: string;
  msgtype?: string;
  formatted_body?: string;
  format?: string;
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
}

export interface ActiveClient {
  client: MatrixSdk.MatrixClient;
  userId: string;
  lastActivity: Date;
  eventCallbacks: ((event: any) => void)[];
}