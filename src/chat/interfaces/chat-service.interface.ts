import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

/**
 * Common message format used across chat implementations
 */
export interface ChatMessage {
  id: string;
  roomId: string;
  sender: string;
  senderName?: string;
  content: string;
  formattedContent?: string;
  timestamp: number;
  type?: string;
}

/**
 * Room information format
 */
export interface ChatRoomInfo {
  id: string;
  name: string;
  topic?: string;
  members?: string[];
  isPublic?: boolean;
}

/**
 * Options for creating a chat room
 */
export interface CreateChatRoomOptions {
  name: string;
  topic?: string;
  isPublic?: boolean;
  isDirect?: boolean;
  creatorId: number;
  memberIds?: number[];
  eventId?: number;
  groupId?: number;
}

/**
 * Response from creating a chat room
 */
export interface ChatRoomResponse {
  id: string;
  name: string;
  topic?: string;
}

/**
 * Options for sending a message
 */
export interface SendChatMessageOptions {
  roomId: string;
  userId: number;
  message: string;
  formattedMessage?: string;
}

/**
 * Interface for chat service implementations
 */
export interface ChatServiceInterface {
  /**
   * Creates a new chat room
   * @param options Room creation options
   * @returns Information about the created room
   */
  createRoom(options: CreateChatRoomOptions): Promise<ChatRoomResponse>;

  /**
   * Sends a message to a chat room
   * @param options Message sending options
   * @returns ID of the sent message
   */
  sendMessage(options: SendChatMessageOptions): Promise<string>;

  /**
   * Gets messages from a chat room
   * @param roomId Room ID to get messages from
   * @param userId User ID requesting the messages
   * @param limit Maximum number of messages to return
   * @param before Fetch messages before this ID/timestamp
   * @returns Array of messages and pagination token
   */
  getMessages(
    roomId: string,
    userId: number,
    limit?: number,
    before?: string,
  ): Promise<{
    messages: ChatMessage[];
    nextToken?: string;
  }>;

  /**
   * Adds a user to a chat room
   * @param roomId Room ID to add the user to
   * @param userId User ID to add
   */
  addUserToRoom(roomId: string, userId: number): Promise<void>;

  /**
   * Removes a user from a chat room
   * @param roomId Room ID to remove the user from
   * @param userId User ID to remove
   */
  removeUserFromRoom(roomId: string, userId: number): Promise<void>;

  /**
   * Ensures a user has necessary chat credentials
   * @param userId User ID to provision
   * @returns Updated user with chat credentials
   */
  ensureUserHasCredentials(userId: number): Promise<UserEntity>;

  /**
   * Sends a typing notification in a chat room
   * @param roomId Room ID where the user is typing
   * @param userId User ID who is typing
   * @param isTyping Whether the user is typing or stopped typing
   */
  sendTypingNotification(
    roomId: string,
    userId: number,
    isTyping: boolean,
  ): Promise<void>;
}
