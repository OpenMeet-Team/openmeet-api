import { ChatRoomEntity } from '../infrastructure/persistence/relational/entities/chat-room.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';

/**
 * Interface for ChatRoomManagerService that handles chat room operations
 * without depending on REQUEST scope
 *
 * This interface is designed to be provider-agnostic, allowing different
 * chat providers (Matrix, Discord, etc.) to implement these methods.
 */
export interface ChatRoomManagerInterface {
  //
  // Event-related methods
  //

  /**
   * Ensure a chat room exists for an event
   * @param eventSlug The slug of the event
   * @param creatorSlug The slug of the user creating the room
   * @param tenantId The tenant ID
   * @returns The chat room entity
   */
  ensureEventChatRoom(
    eventSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity>;

  /**
   * Add a user to an event chat room
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to add
   * @param tenantId The tenant ID
   * @returns void
   */
  addUserToEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Remove a user from an event chat room
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to remove
   * @param tenantId The tenant ID
   * @returns void
   */
  removeUserFromEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Check if a user is a member of an event chat room
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user
   * @param tenantId The tenant ID
   * @returns boolean indicating if the user is a member
   */
  isUserInEventChatRoom(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Get chat rooms for an event
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   * @returns Array of chat room entities
   */
  getEventChatRooms(
    eventSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity[]>;

  /**
   * Delete all chat rooms for an event
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   */
  deleteEventChatRooms(eventSlug: string, tenantId: string): Promise<void>;

  /**
   * Check if an event exists
   * @param eventSlug The slug of the event
   * @param tenantId The tenant ID
   * @returns Boolean indicating if the event exists
   */
  checkEventExists(eventSlug: string, tenantId: string): Promise<boolean>;

  //
  // Group-related methods
  //

  /**
   * Ensure a chat room exists for a group
   * @param groupSlug The slug of the group
   * @param creatorSlug The slug of the user creating the room
   * @param tenantId The tenant ID
   * @returns The chat room entity
   */
  ensureGroupChatRoom(
    groupSlug: string,
    creatorSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity>;

  /**
   * Add a user to a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user to add
   * @param tenantId The tenant ID
   * @returns void
   */
  addUserToGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Remove a user from a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user to remove
   * @param tenantId The tenant ID
   * @returns void
   */
  removeUserFromGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<void>;

  /**
   * Check if a user is a member of a group chat room
   * @param groupSlug The slug of the group
   * @param userSlug The slug of the user
   * @param tenantId The tenant ID
   * @returns boolean indicating if the user is a member
   */
  isUserInGroupChatRoom(
    groupSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<boolean>;

  /**
   * Get chat rooms for a group
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   * @returns Array of chat room entities
   */
  getGroupChatRooms(
    groupSlug: string,
    tenantId: string,
  ): Promise<ChatRoomEntity[]>;

  /**
   * Delete all chat rooms for a group
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   */
  deleteGroupChatRooms(groupSlug: string, tenantId: string): Promise<void>;

  /**
   * Check if a group exists
   * @param groupSlug The slug of the group
   * @param tenantId The tenant ID
   * @returns Boolean indicating if the group exists
   */
  checkGroupExists(groupSlug: string, tenantId: string): Promise<boolean>;

  //
  // Common methods for any chat room type
  //

  // NOTE: Message sending and retrieval methods removed in Matrix architecture refactor
  // Frontend Matrix clients now handle all user-facing messaging operations directly

  /**
   * Get all members of a chat room
   * @param roomId The ID of the chat room
   * @param tenantId The tenant ID
   * @returns Array of user entities
   */
  getChatRoomMembers(roomId: number, tenantId: string): Promise<UserEntity[]>;
}
