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
    return this.withErrorHandling(
      'create chat room',
      async () => {
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
      },
      {
        name: options.name,
        creatorId: options.creatorId,
        members: options.memberIds?.length || 0,
      },
    );
  }

  /**
   * Generic error handling wrapper for Matrix operations
   * @param operation The name of the operation being performed
   * @param action The async function to execute
   * @param errorContext Additional context for error logging
   * @returns The result of the action
   */
  private async withErrorHandling<T>(
    operation: string,
    action: () => Promise<T>,
    errorContext: Record<string, any> = {},
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      // Format the context for logging
      const contextStr = Object.entries(errorContext)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      this.logger.error(
        `Failed to ${operation}: ${error.message} [${contextStr}]`,
        error.stack,
      );

      throw new Error(`Failed to ${operation}: ${error.message}`);
    }
  }

  /**
   * Sends a message to a Matrix room
   */
  @Trace('matrix-chat.sendMessage')
  async sendMessage(options: SendChatMessageOptions): Promise<string> {
    return this.withErrorHandling(
      'send message',
      async () => {
        // Ensure user has Matrix credentials
        const user = await this.ensureUserHasCredentials(options.userId);

        // Set user display name for better UX (non-critical operation)
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
          format: options.formattedMessage
            ? 'org.matrix.custom.html'
            : undefined,
          senderUserId: user.matrixUserId!,
          senderAccessToken: user.matrixAccessToken!,
          senderDeviceId: user.matrixDeviceId,
        });
      },
      { roomId: options.roomId, userId: options.userId },
    );
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
    return this.withErrorHandling(
      'get messages',
      async () => {
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
      },
      { roomId, userId, limit, before },
    );
  }

  /**
   * Generic method to handle user room membership operations
   * @param operation The operation type ('add' or 'remove')
   * @param roomId The Matrix room ID
   * @param userId The OpenMeet user ID
   */
  private async handleUserRoomMembership(
    operation: 'add' | 'remove',
    roomId: string,
    userId: number,
  ): Promise<void> {
    const operationDesc = `${operation} user ${operation === 'add' ? 'to' : 'from'} room`;

    return this.withErrorHandling(
      operationDesc,
      async () => {
        // For removal operations, we just need basic user info
        const user =
          operation === 'add'
            ? await this.ensureUserHasCredentials(userId) // Ensure with provisioning for add
            : await this.userService.getUserById(userId); // Simple fetch for remove

        // Check if user has Matrix ID (especially for removal)
        if (!user.matrixUserId) {
          this.logger.log(
            `User ${userId} has no Matrix ID, skipping ${operation} operation`,
          );
          return;
        }

        if (operation === 'add') {
          // First, invite the user to the room
          await this.matrixRoomService.inviteUser(roomId, user.matrixUserId);

          // Have the user join the room
          await this.matrixRoomService.joinRoom(
            roomId,
            user.matrixUserId,
            user.matrixAccessToken!,
            user.matrixDeviceId,
          );
        } else {
          // Remove user from Matrix room
          await this.matrixRoomService.removeUserFromRoom(
            roomId,
            user.matrixUserId,
          );
        }

        this.logger.log(
          `User ${userId} ${operation === 'add' ? 'added to' : 'removed from'} room ${roomId}`,
        );
      },
      { roomId, userId, operation },
    );
  }

  /**
   * Adds a user to a Matrix room
   */
  @Trace('matrix-chat.addUserToRoom')
  async addUserToRoom(roomId: string, userId: number): Promise<void> {
    return this.handleUserRoomMembership('add', roomId, userId);
  }

  /**
   * Removes a user from a Matrix room
   */
  @Trace('matrix-chat.removeUserFromRoom')
  async removeUserFromRoom(roomId: string, userId: number): Promise<void> {
    return this.handleUserRoomMembership('remove', roomId, userId);
  }

  /**
   * Ensures a user has Matrix credentials, provisioning them if needed
   */
  @Trace('matrix-chat.ensureUserHasCredentials')
  async ensureUserHasCredentials(userId: number): Promise<UserEntity> {
    return this.withErrorHandling(
      'ensure Matrix credentials',
      async () => {
        // Get the user
        let user = await this.userService.getUserById(userId);

        // If user has credentials, return the user
        if (
          user.matrixUserId &&
          user.matrixAccessToken &&
          user.matrixDeviceId
        ) {
          return user;
        }

        this.logger.log(
          `User ${userId} is missing Matrix credentials, provisioning...`,
        );

        // Use the centralized provisioning method
        const matrixUserInfo = await this.matrixUserService.provisionMatrixUser(
          user,
          this.request.tenantId,
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

        // Start the Matrix client for this user (non-critical operation)
        this.startMatrixClientForUser(user).catch((error) => {
          this.logger.warn(
            `Failed to start Matrix client for user ${userId}: ${error.message}`,
          );
          // Non-critical error, we can still use the credentials
        });

        return user;
      },
      { userId },
    );
  }

  /**
   * Helper method to start a Matrix client for a user
   * Extracted to a separate method to improve readability
   */
  private async startMatrixClientForUser(user: UserEntity): Promise<void> {
    if (!user.slug) {
      throw new Error('User has no slug, cannot start Matrix client');
    }

    // Find the user's slug from the ulid
    const userWithSlug = await this.userService.findBySlug(user.slug);
    if (userWithSlug) {
      // Get client for the user using the slug (which is required by the new MatrixUserService)
      // Get tenant ID from request or use the same tenant ID used to find the user
      const tenantId =
        this.request?.tenantId ||
        (await this.userService.getTenantIdForUser(user.slug));
      await this.matrixUserService.getClientForUser(
        user.slug,
        this.userService,
        tenantId,
      );
    } else {
      throw new Error(
        `Couldn't find user with slug ${user.slug} for Matrix client startup`,
      );
    }
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
    return this.withErrorHandling(
      'send typing notification',
      async () => {
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
      },
      { roomId, userId, isTyping },
    );
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
