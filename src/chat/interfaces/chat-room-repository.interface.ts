import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { ChatRoomEntity } from '../infrastructure/persistence/relational/entities/chat-room.entity';

/**
 * Interface for the Chat Room Repository
 */
export interface ChatRoomRepositoryInterface {
  /**
   * Get all chat rooms for an event
   * @param eventId The ID of the event
   * @returns Array of chat rooms associated with the event
   */
  getEventChatRooms(eventId: number): Promise<ChatRoomEntity[]>;

  /**
   * Get all chat rooms for a group
   * @param groupId The ID of the group
   * @returns Array of chat rooms associated with the group
   */
  getGroupChatRooms(groupId: number): Promise<ChatRoomEntity[]>;

  /**
   * Create a chat room for an event
   * @param event The event entity
   * @param creator The user creating the room
   * @param matrixRoomId The Matrix room ID
   * @param isPublic Whether the room is public
   * @returns The created chat room entity
   */
  createEventChatRoom(
    event: EventEntity,
    creator: UserEntity,
    matrixRoomId: string,
    isPublic?: boolean,
  ): Promise<ChatRoomEntity>;

  /**
   * Create a chat room for a group
   * @param group The group entity
   * @param creator The user creating the room
   * @param matrixRoomId The Matrix room ID
   * @param isPublic Whether the room is public
   * @returns The created chat room entity
   */
  createGroupChatRoom(
    group: GroupEntity,
    creator: UserEntity,
    matrixRoomId: string,
    isPublic?: boolean,
  ): Promise<ChatRoomEntity>;

  /**
   * Create a direct message chat room
   * @param user1 The first user
   * @param user2 The second user
   * @param matrixRoomId The Matrix room ID
   * @returns The created chat room entity
   */
  createDirectChatRoom(
    user1: UserEntity,
    user2: UserEntity,
    matrixRoomId: string,
  ): Promise<ChatRoomEntity>;

  /**
   * Get a chat room by ID
   * @param roomId The ID of the chat room
   * @returns The chat room entity
   */
  getChatRoomById(roomId: number): Promise<ChatRoomEntity>;

  /**
   * Get a chat room by Matrix room ID
   * @param matrixRoomId The Matrix room ID
   * @returns The chat room entity
   */
  getChatRoomByMatrixRoomId(
    matrixRoomId: string,
  ): Promise<ChatRoomEntity | null>;

  /**
   * Get the direct chat room between two users
   * @param user1Id The ID of the first user
   * @param user2Id The ID of the second user
   * @returns The chat room entity or null if not found
   */
  getDirectChatRoom(
    user1Id: number,
    user2Id: number,
  ): Promise<ChatRoomEntity | null>;

  /**
   * Add a user to a chat room
   * @param roomId The ID of the chat room
   * @param userId The ID of the user to add
   */
  addUserToChatRoom(roomId: number, userId: number): Promise<void>;

  /**
   * Remove a user from a chat room
   * @param roomId The ID of the chat room
   * @param userId The ID of the user to remove
   */
  removeUserFromChatRoom(roomId: number, userId: number): Promise<void>;

  /**
   * Get members of a chat room
   * @param roomId The ID of the chat room
   * @returns Array of users in the room
   */
  getChatRoomMembers(roomId: number): Promise<UserEntity[]>;

  /**
   * Check if a user is a member of a chat room
   * @param roomId The ID of the chat room
   * @param userId The ID of the user
   * @returns True if the user is a member, false otherwise
   */
  isUserMemberOfChatRoom(roomId: number, userId: number): Promise<boolean>;
}
