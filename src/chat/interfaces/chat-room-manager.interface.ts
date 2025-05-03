import { ChatRoomEntity } from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

/**
 * Interface for ChatRoomManagerService that handles chat room operations
 * without depending on REQUEST scope
 */
export interface ChatRoomManagerInterface {
  /**
   * Ensure a chat room exists for an event
   * @param eventId The ID of the event
   * @param creatorId The ID of the user creating the room
   * @param tenantId The tenant ID
   * @returns The chat room entity
   */
  ensureEventChatRoom(
    eventId: number,
    creatorId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity>;

  /**
   * Add a user to an event chat room
   * @param eventId The ID of the event
   * @param userId The ID of the user to add
   * @param tenantId The tenant ID
   * @returns void
   */
  addUserToEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<void>;

  /**
   * Remove a user from an event chat room
   * @param eventId The ID of the event
   * @param userId The ID of the user to remove
   * @param tenantId The tenant ID
   * @returns void
   */
  removeUserFromEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<void>;

  /**
   * Check if a user is a member of an event chat room
   * @param eventId The ID of the event
   * @param userId The ID of the user
   * @param tenantId The tenant ID
   * @returns boolean indicating if the user is a member
   */
  isUserInEventChatRoom(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Get chat rooms for an event
   * @param eventId The ID of the event
   * @param tenantId The tenant ID
   * @returns Array of chat room entities
   */
  getEventChatRooms(
    eventId: number,
    tenantId: string,
  ): Promise<ChatRoomEntity[]>;

  /**
   * Delete all chat rooms for an event
   * @param eventId The ID of the event
   * @param tenantId The tenant ID
   */
  deleteEventChatRooms(eventId: number, tenantId: string): Promise<void>;

  /**
   * Send a message to a chat room
   * @param roomId The ID of the chat room
   * @param userId The ID of the user sending the message
   * @param message The message text
   * @param tenantId The tenant ID
   * @returns The message ID
   */
  sendMessage(
    roomId: number,
    userId: number,
    message: string,
    tenantId: string,
  ): Promise<string>;

  /**
   * Get messages from a chat room
   * @param roomId The ID of the chat room
   * @param userId The ID of the user retrieving messages
   * @param limit Maximum number of messages to retrieve
   * @param from Pagination token
   * @param tenantId The tenant ID
   * @returns Object containing the messages and pagination token
   */
  getMessages(
    roomId: number,
    userId: number,
    limit: number,
    from: string | undefined,
    tenantId: string,
  ): Promise<{
    messages: any[];
    end: string;
  }>;

  /**
   * Get all members of a chat room
   * @param roomId The ID of the chat room
   * @param tenantId The tenant ID
   * @returns Array of user entities
   */
  getChatRoomMembers(
    roomId: number,
    tenantId: string,
  ): Promise<UserEntity[]>;

  /**
   * Check if an event exists
   * @param eventId The ID of the event
   * @param tenantId The tenant ID
   * @returns Boolean indicating if the event exists
   */
  checkEventExists(eventId: number, tenantId: string): Promise<boolean>;
}