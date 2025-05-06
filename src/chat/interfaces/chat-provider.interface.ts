import { Message } from '../../matrix/types/matrix.types';

/**
 * Room creation options interface
 */
export interface CreateRoomOptions {
  name: string;
  topic?: string;
  isPublic?: boolean;
  isDirect?: boolean;
  inviteUserIds?: string[];
  powerLevelContentOverride?: Record<string, any>;
}

/**
 * Room information response interface
 */
export interface RoomInfo {
  roomId: string;
  name: string;
  topic?: string;
}

/**
 * Message sending options interface
 */
export interface SendMessageOptions {
  roomId: string;
  content: string;
  userId: string;
  accessToken: string;
  deviceId?: string;
  formatted_body?: string;
  format?: string;
  senderUserId?: string;
  senderAccessToken?: string;
  senderDeviceId?: string;
  body?: string;
}

/**
 * User creation options interface
 */
export interface CreateUserOptions {
  username: string;
  password: string;
  displayName?: string;
}

/**
 * User information response interface
 */
export interface UserInfo {
  userId: string;
  accessToken: string;
  deviceId?: string;
}

/**
 * Interface for chat providers (Matrix, potentially others in the future)
 */
export interface ChatProviderInterface {
  /**
   * Create a new room
   * @param options Room creation options
   * @returns Information about the created room
   */
  createRoom(options: CreateRoomOptions): Promise<RoomInfo>;

  /**
   * Get messages from a room
   * @param roomId The ID of the room
   * @param limit The maximum number of messages to return
   * @param from The token to paginate from
   * @param userId The user ID requesting messages
   * @returns Messages and end token for pagination
   */
  getRoomMessages(
    roomId: string,
    limit: number,
    from?: string,
    userId?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }>;

  /**
   * Send a message to a room
   * @param options Message sending options
   * @returns The ID of the sent message
   */
  sendMessage(options: SendMessageOptions): Promise<string>;

  /**
   * Invite a user to a room
   * @param options Options containing roomId and userId
   */
  inviteUser(options: { roomId: string; userId: string }): Promise<void>;

  /**
   * Join a room
   * @param roomId The ID of the room to join
   * @param userId The user ID joining the room
   * @param accessToken The user's access token
   * @param deviceId The user's device ID
   */
  joinRoom(
    roomId: string,
    userId: string,
    accessToken: string,
    deviceId?: string,
  ): Promise<void>;

  /**
   * Remove a user from a room
   * @param roomId The ID of the room
   * @param userId The ID of the user to remove
   */
  removeUserFromRoom(roomId: string, userId: string): Promise<void>;

  /**
   * Create a new user
   * @param options User creation options
   * @returns Information about the created user
   */
  createUser(options: CreateUserOptions): Promise<UserInfo>;

  /**
   * Set a user's display name
   * @param userId The user's ID
   * @param accessToken The user's access token
   * @param displayName The display name to set
   * @param deviceId The user's device ID
   */
  setUserDisplayName(
    userId: string,
    accessToken: string,
    displayName: string,
    deviceId?: string,
  ): Promise<void>;

  /**
   * Get a user's display name
   * @param userId The user's ID
   * @returns The user's display name
   */
  getUserDisplayName(userId: string): Promise<string | null>;

  /**
   * Start a client for a user
   * @param options Options containing userId, accessToken, deviceId, and tenantId
   */
  startClient(options: {
    userId: string;
    accessToken: string;
    deviceId?: string;
    tenantId?: string;
  }): Promise<void>;

  /**
   * Send a typing notification
   * @param roomId The ID of the room
   * @param userId The ID of the user typing
   * @param accessToken The user's access token
   * @param isTyping Whether the user is typing
   * @param deviceId The user's device ID
   */
  sendTypingNotification(
    roomId: string,
    userId: string,
    accessToken: string,
    isTyping: boolean,
    deviceId?: string,
  ): Promise<void>;
}
