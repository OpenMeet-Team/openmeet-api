import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { Message } from '../../matrix/types/matrix.types';

/**
 * Interface for the Discussion Service, which handles all types of discussions
 * (events, groups, direct messages)
 */
export interface DiscussionServiceInterface {
  /**
   * Send a message to an event's discussion
   * @param slug The slug of the event
   * @param userId The ID of the user sending the message
   * @param body The message content
   * @returns The ID of the sent message
   */
  sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName?: string },
  ): Promise<{ id: string }>;

  /**
   * Get messages from an event's discussion
   * @param slug The slug of the event
   * @param userId The ID of the user requesting messages
   * @param limit The maximum number of messages to return
   * @param from The token to paginate from
   * @returns Messages and end token for pagination
   */
  getEventDiscussionMessages(
    slug: string,
    userId: number,
    limit?: number,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }>;

  /**
   * Add a member to an event's discussion
   * @param eventId The ID of the event
   * @param userId The ID of the user to add
   */
  addMemberToEventDiscussion(eventId: number, userId: number): Promise<void>;

  /**
   * Add a member to an event's discussion using slugs
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to add
   */
  addMemberToEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<void>;

  /**
   * Remove a member from an event's discussion
   * @param eventId The ID of the event
   * @param userId The ID of the user to remove
   */
  removeMemberFromEventDiscussion(
    eventId: number,
    userId: number,
  ): Promise<void>;

  /**
   * Remove a member from an event's discussion using slugs
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to remove
   */
  removeMemberFromEventDiscussionBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<void>;

  /**
   * Send a message to a group's discussion
   * @param slug The slug of the group
   * @param userId The ID of the user sending the message
   * @param body The message content
   * @returns The ID of the sent message
   */
  sendGroupDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName?: string },
  ): Promise<{ id: string }>;

  /**
   * Get messages from a group's discussion
   * @param slug The slug of the group
   * @param userId The ID of the user requesting messages
   * @param limit The maximum number of messages to return
   * @param from The token to paginate from
   * @returns Messages and end token for pagination
   */
  getGroupDiscussionMessages(
    slug: string,
    userId: number,
    limit?: number,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }>;

  /**
   * Add a member to a group's discussion
   * @param groupId The ID of the group
   * @param userId The ID of the user to add
   */
  addMemberToGroupDiscussion(groupId: number, userId: number): Promise<void>;

  /**
   * Remove a member from a group's discussion
   * @param groupId The ID of the group
   * @param userId The ID of the user to remove
   */
  removeMemberFromGroupDiscussion(
    groupId: number,
    userId: number,
  ): Promise<void>;

  /**
   * Send a direct message between users
   * @param recipientId The ID of the recipient
   * @param senderId The ID of the sender
   * @param body The message content
   * @returns The ID of the sent message
   */
  sendDirectMessage(
    recipientId: number,
    senderId: number,
    body: { message: string },
  ): Promise<{ id: string }>;

  /**
   * Get direct messages between users
   * @param userId1 The ID of the first user
   * @param userId2 The ID of the second user
   * @param limit The maximum number of messages to return
   * @param from The token to paginate from
   * @returns Messages and end token for pagination
   */
  getDirectMessages(
    userId1: number,
    userId2: number,
    limit?: number,
    from?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }>;
}
