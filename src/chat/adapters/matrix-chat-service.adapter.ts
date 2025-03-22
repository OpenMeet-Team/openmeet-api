import { Injectable, Logger, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserService } from '../../user/user.service';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import {
  ChatServiceInterface,
  ChatMessage,
  ChatRoomResponse,
  CreateChatRoomOptions,
  SendChatMessageOptions,
} from '../interfaces/chat-service.interface';
import { Message } from '../../matrix/types/matrix.types';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class MatrixChatServiceAdapter implements ChatServiceInterface {
  private readonly logger = new Logger(MatrixChatServiceAdapter.name);
  private readonly tracer = trace.getTracer('matrix-chat-service');

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly matrixMessageService: MatrixMessageService,
  ) {}

  /**
   * Creates a new Matrix room
   */
  @Trace('matrix-chat.createRoom')
  async createRoom(options: CreateChatRoomOptions): Promise<ChatRoomResponse> {
    try {
      // Ensure creator has Matrix credentials
      const creatorWithCredentials = await this.ensureUserHasCredentials(
        options.creatorId,
      );

      // Get member Matrix IDs for invitation
      const memberMatrixIds: string[] = [];

      if (options.memberIds && options.memberIds.length > 0) {
        for (const memberId of options.memberIds) {
          try {
            // Only get existing credentials, don't provision new ones yet
            const member = await this.userService.getUserById(memberId);
            if (member.matrixUserId) {
              memberMatrixIds.push(member.matrixUserId);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to get member ${memberId} for room creation: ${error.message}`,
            );
          }
        }
      }

      // Create Matrix room
      const roomInfo = await this.matrixRoomService.createRoom({
        name: options.name,
        topic: options.topic,
        isPublic: options.isPublic || false,
        isDirect: options.isDirect || false,
        inviteUserIds: [
          ...(creatorWithCredentials.matrixUserId
            ? [creatorWithCredentials.matrixUserId]
            : []),
          ...memberMatrixIds,
        ].filter(Boolean) as string[],
        powerLevelContentOverride: creatorWithCredentials.matrixUserId
          ? {
              users: {
                [creatorWithCredentials.matrixUserId]: 50, // Moderator level
              },
            }
          : undefined,
      });

      return {
        id: roomInfo.roomId,
        name: roomInfo.name,
        topic: roomInfo.topic,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create chat room: ${error.message}`);
    }
  }

  /**
   * Sends a message to a Matrix room
   */
  @Trace('matrix-chat.sendMessage')
  async sendMessage(options: SendChatMessageOptions): Promise<string> {
    try {
      // Ensure user has Matrix credentials
      const user = await this.ensureUserHasCredentials(options.userId);

      // Set user display name for better UX
      try {
        await this.setUserDisplayName(user);
      } catch (error) {
        this.logger.warn(
          `Failed to set display name for user ${options.userId}: ${error.message}`,
        );
        // Continue anyway - display name is not critical
      }

      // Send the message using Matrix service
      return await this.matrixMessageService.sendMessage({
        roomId: options.roomId,
        content: options.message,
        userId: user.matrixUserId!,
        accessToken: user.matrixAccessToken!,
        deviceId: user.matrixDeviceId,
        // Support for formatted messages
        formatted_body: options.formattedMessage,
        format: options.formattedMessage ? 'org.matrix.custom.html' : undefined,
        senderUserId: user.matrixUserId!,
        senderAccessToken: user.matrixAccessToken!,
        senderDeviceId: user.matrixDeviceId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send message to room ${options.roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  /**
   * Gets messages from a Matrix room
   */
  @Trace('matrix-chat.getMessages')
  async getMessages(
    roomId: string,
    userId: number,
    limit = 50,
    before?: string,
  ): Promise<{ messages: ChatMessage[]; nextToken?: string }> {
    try {
      // Ensure user has Matrix credentials
      const user = await this.ensureUserHasCredentials(userId);

      // Get messages from Matrix
      const messageData = await this.matrixMessageService.getRoomMessages(
        roomId,
        limit,
        before,
        user.matrixUserId!,
      );

      // Convert Matrix messages to our common format
      const messages = await Promise.all(
        messageData.messages.map(async (message: Message) =>
          this.convertMatrixMessage(message),
        ),
      );

      return {
        messages,
        nextToken: messageData.end || undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get messages from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  /**
   * Adds a user to a Matrix room
   */
  @Trace('matrix-chat.addUserToRoom')
  async addUserToRoom(roomId: string, userId: number): Promise<void> {
    try {
      // Ensure user has Matrix credentials
      const user = await this.ensureUserHasCredentials(userId);

      // First, invite the user to the room
      await this.matrixRoomService.inviteUser(roomId, user.matrixUserId!);

      // Have the user join the room
      await this.matrixRoomService.joinRoom(
        roomId,
        user.matrixUserId!,
        user.matrixAccessToken!,
        user.matrixDeviceId,
      );

      this.logger.log(`User ${userId} added to room ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to add user ${userId} to room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to add user to chat room: ${error.message}`);
    }
  }

  /**
   * Removes a user from a Matrix room
   */
  @Trace('matrix-chat.removeUserFromRoom')
  async removeUserFromRoom(roomId: string, userId: number): Promise<void> {
    try {
      // Get the user with Matrix credentials
      const user = await this.userService.getUserById(userId);

      if (!user.matrixUserId) {
        this.logger.log(`User ${userId} has no Matrix ID, skipping removal`);
        return;
      }

      // Remove user from Matrix room
      await this.matrixRoomService.removeUserFromRoom(
        roomId,
        user.matrixUserId,
      );

      this.logger.log(`User ${userId} removed from room ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userId} from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to remove user from chat room: ${error.message}`);
    }
  }

  /**
   * Ensures a user has Matrix credentials
   */
  @Trace('matrix-chat.ensureUserHasCredentials')
  async ensureUserHasCredentials(userId: number): Promise<UserEntity> {
    // Get the user
    let user = await this.userService.getUserById(userId);

    // If user has credentials, return the user
    if (user.matrixUserId && user.matrixAccessToken && user.matrixDeviceId) {
      return user;
    }

    this.logger.log(
      `User ${userId} is missing Matrix credentials, provisioning...`,
    );

    try {
      // Use the centralized provisioning method
      const matrixUserInfo = await this.matrixUserService.provisionMatrixUser(
        user,
        this.request.tenantId
      );

      // Update user with Matrix credentials
      await this.userService.update(userId, {
        matrixUserId: matrixUserInfo.userId,
        matrixAccessToken: matrixUserInfo.accessToken,
        matrixDeviceId: matrixUserInfo.deviceId,
      });

      // Get the updated user record
      user = await this.userService.getUserById(userId);
      this.logger.log(
        `Successfully provisioned Matrix user for ${userId}: ${user.matrixUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to provision Matrix user for ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Matrix credentials could not be provisioned. Please try again.`,
      );
    }

    // Start the Matrix client for this user
    try {
      // Find the user's slug from the ulid
      const userWithSlug = await this.userService.findBySlug(user.slug);
      if (userWithSlug) {
        // Get client for the user using the slug (which is required by the new MatrixUserService)
        await this.matrixUserService.getClientForUser(user.slug);
      } else {
        this.logger.warn(
          `Couldn't find user with slug ${user.slug} for Matrix client startup`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to start Matrix client for user ${userId}: ${error.message}`,
      );
      // Non-critical error, we can still use the credentials
    }

    return user;
  }

  /**
   * Sends a typing notification in a Matrix room
   */
  @Trace('matrix-chat.sendTypingNotification')
  async sendTypingNotification(
    roomId: string,
    userId: number,
    isTyping: boolean,
  ): Promise<void> {
    try {
      // Get the user with Matrix credentials
      const user = await this.ensureUserHasCredentials(userId);

      // Send typing notification
      await this.matrixMessageService.sendTypingNotification(
        roomId,
        user.matrixUserId!,
        user.matrixAccessToken!,
        isTyping,
        user.matrixDeviceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send typing notification for user ${userId} in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send typing notification: ${error.message}`);
    }
  }

  /**
   * Helper method to set a user's display name in Matrix
   */
  private async setUserDisplayName(user: UserEntity): Promise<void> {
    if (!user.matrixUserId || !user.matrixAccessToken) {
      return;
    }

    // Create a proper display name using the centralized method
    const displayName = MatrixUserService.generateDisplayName(user);

    // Set the display name
    await this.matrixUserService.setUserDisplayName(
      user.matrixUserId,
      user.matrixAccessToken,
      displayName,
      user.matrixDeviceId,
    );
  }

  /**
   * Helper method to convert Matrix message to common format
   */
  private async convertMatrixMessage(message: Message): Promise<ChatMessage> {
    let senderName: string | undefined = undefined;

    // Try to get user info from our database based on Matrix ID
    try {
      const userWithMatrixId = await this.userService.findByMatrixUserId(
        message.sender,
      );

      if (userWithMatrixId) {
        senderName = MatrixUserService.generateDisplayName(userWithMatrixId);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to get display name for ${message.sender}: ${error.message}`,
      );
    }

    return {
      id: message.eventId,
      roomId: message.roomId,
      sender: message.sender,
      senderName: senderName,
      content: message.content?.body || '',
      formattedContent: message.content?.formatted_body,
      timestamp: message.timestamp,
      type: message.content?.msgtype || 'm.text',
    };
  }
}
