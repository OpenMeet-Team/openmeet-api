import { DiscussionMessagesResponseDto } from '../dto/discussion-message.dto';

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
   * @returns DiscussionMessagesResponseDto with messages, pagination token, and room ID
   */
  getEventDiscussionMessages(
    slug: string,
    userId: number,
    limit?: number,
    from?: string,
  ): Promise<DiscussionMessagesResponseDto>;

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
   * Similar to addMemberToEventDiscussionBySlug but returns room information
   * @param eventSlug The slug of the event
   * @param userSlug The slug of the user to add
   * @param explicitTenantId Optional tenant ID for multi-tenant environments
   * @returns Object containing roomId information
   */
  addMemberToEventDiscussionBySlugAndGetRoomId(
    eventSlug: string,
    userSlug: string,
    explicitTenantId?: string,
  ): Promise<{ roomId?: string }>;

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
   * @returns DiscussionMessagesResponseDto with messages, pagination token, and room ID
   */
  getGroupDiscussionMessages(
    slug: string,
    userId: number,
    limit?: number,
    from?: string,
  ): Promise<DiscussionMessagesResponseDto>;

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
   * @returns DiscussionMessagesResponseDto with messages, pagination token, and room ID
   */
  getDirectMessages(
    userId1: number,
    userId2: number,
    limit?: number,
    from?: string,
  ): Promise<DiscussionMessagesResponseDto>;
}
