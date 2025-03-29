/**
 * Interfaces for Matrix service components to improve testability
 * These interfaces allow us to mock the Matrix SDK and its components in tests
 */

export interface IMatrixSdk {
  createClient: (options: any) => IMatrixClient;
  Visibility: {
    Public: string;
    Private: string;
  };
  Preset: {
    PublicChat: string;
    PrivateChat: string;
    TrustedPrivateChat: string;
  };
  Direction: {
    Forward: string;
    Backward: string;
  };
}

export interface IMatrixClient {
  // Client lifecycle
  startClient: (options?: any) => Promise<void>;
  stopClient: () => void;

  // Room operations
  createRoom: (options: any) => Promise<{ room_id: string }>;
  invite: (roomId: string, userId: string) => Promise<{}>;
  kick: (roomId: string, userId: string, reason?: string) => Promise<{}>;
  joinRoom: (roomId: string) => Promise<{}>;

  // State and profile operations
  getStateEvent: (
    roomId: string,
    type: string,
    stateKey: string,
  ) => Promise<any>;
  sendStateEvent: (
    roomId: string,
    type: string,
    content: any,
    stateKey: string,
  ) => Promise<any>;
  getProfileInfo: (userId: string) => Promise<{ displayname?: string }>;
  setDisplayName: (displayName: string) => Promise<{}>;

  // Message operations
  sendEvent: (
    roomId: string,
    type: string,
    content: any,
    txnId?: string,
  ) => Promise<{ event_id: string }>;
  sendTyping: (
    roomId: string,
    isTyping: boolean,
    timeout: number,
  ) => Promise<{}>;

  // Room info
  getJoinedRooms: () => Promise<{ joined_rooms: string[] }>;
  getRoom: (roomId: string) => any;
  roomState: (roomId: string) => Promise<any[]>;

  // Authentication
  getAccessToken: () => string | null;
  getUserId: () => string | null;

  // Event handling
  on: (event: string, callback: (...args: any[]) => void) => void;
  removeListener: (event: string, callback: (...args: any[]) => void) => void;
}

export interface IMatrixAdminApi {
  createUser: (
    username: string,
    password: string,
    isAdmin?: boolean,
    displayName?: string,
  ) => Promise<{ userId: string; accessToken: string; deviceId: string }>;
  deleteUser: (userId: string) => Promise<{}>;
  setUserPassword: (userId: string, password: string) => Promise<{}>;
}

export interface IMatrixClientProvider {
  getClientForUser: (
    userSlug: string,
    userService?: any,
    tenantId?: string,
  ) => Promise<IMatrixClient>;
  releaseClientForUser: (userSlug: string) => {}; // Changed from void to {} for consistency
}

export interface IMatrixRoomProvider {
  createRoom: (options: any) => Promise<{
    roomId: string;
    name: string;
    topic?: string;
    invitedMembers?: string[];
  }>;
  inviteUser: (roomId: string, userId: string) => Promise<{}>;
  removeUserFromRoom: (roomId: string, userId: string) => Promise<{}>;
  setRoomPowerLevels: (
    roomId: string,
    userPowerLevels: Record<string, number>,
  ) => Promise<{}>;
}

export interface IMatrixMessageProvider {
  sendMessage: (options: any) => Promise<string>;
  sendTypingNotification: (
    roomId: string,
    userId: string,
    accessToken: string,
    isTyping: boolean,
    deviceId?: string,
  ) => Promise<{}>;
  getRoomMessages: (
    roomId: string,
    limit?: number,
    from?: string,
    userId?: string,
  ) => Promise<{ messages: any[]; end: string }>;
}

export interface IMatrixEventEmitter {
  sendEventToWebSocket: (userId: string, roomId: string, event: any) => void;
}
