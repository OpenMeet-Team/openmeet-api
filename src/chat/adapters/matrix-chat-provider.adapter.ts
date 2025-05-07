import { Injectable, Logger } from '@nestjs/common';
import {
  ChatProviderInterface,
  CreateRoomOptions,
  CreateUserOptions,
  RoomInfo,
  SendMessageOptions,
  UserInfo,
} from '../interfaces/chat-provider.interface';
import { Message } from '../../matrix/types/matrix.types';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { MatrixUserService } from '../../matrix/services/matrix-user.service';
import { MatrixRoomService } from '../../matrix/services/matrix-room.service';
import { MatrixMessageService } from '../../matrix/services/matrix-message.service';

/**
 * Matrix implementation of the ChatProviderInterface
 */
@Injectable()
export class MatrixChatProviderAdapter implements ChatProviderInterface {
  private readonly logger = new Logger(MatrixChatProviderAdapter.name);
  private readonly tracer = trace.getTracer('matrix-chat-provider-adapter');

  constructor(
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly matrixMessageService: MatrixMessageService,
  ) {}

  @Trace('matrix-chat-provider.createRoom')
  async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    try {
      return await this.matrixRoomService.createRoom(options);
    } catch (error) {
      this.logger.error(
        `Failed to create Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create chat room: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.getRoomMessages')
  async getRoomMessages(
    roomId: string,
    limit: number,
    from?: string,
    userId?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    try {
      return await this.matrixMessageService.getRoomMessages(
        roomId,
        limit,
        from,
        userId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to get Matrix room messages: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.sendMessage')
  async sendMessage(options: SendMessageOptions): Promise<string> {
    try {
      return await this.matrixMessageService.sendMessage(options);
    } catch (error) {
      this.logger.error(
        `Failed to send Matrix message: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.inviteUser')
  async inviteUser(options: { roomId: string; userId: string }): Promise<void> {
    try {
      await this.matrixRoomService.inviteUser(options.roomId, options.userId);
    } catch (error) {
      this.logger.error(
        `Failed to invite user to Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to invite user: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.joinRoom')
  async joinRoom(
    roomId: string,
    userId: string,
    accessToken: string,
    deviceId?: string,
  ): Promise<void> {
    try {
      await this.matrixRoomService.joinRoom(
        roomId,
        userId,
        accessToken,
        deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to join Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to join room: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.removeUserFromRoom')
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    try {
      await this.matrixRoomService.removeUserFromRoom(roomId, userId);
    } catch (error) {
      this.logger.error(
        `Failed to remove user from Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to remove user from room: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.createUser')
  async createUser(options: CreateUserOptions): Promise<UserInfo> {
    try {
      return await this.matrixUserService.createUser(options);
    } catch (error) {
      this.logger.error(
        `Failed to create Matrix user: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.setUserDisplayName')
  async setUserDisplayName(
    userId: string,
    accessToken: string,
    displayName: string,
    deviceId?: string,
  ): Promise<void> {
    try {
      await this.matrixUserService.setUserDisplayName(
        userId,
        accessToken,
        displayName,
        deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set Matrix user display name: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to set user display name: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.getUserDisplayName')
  async getUserDisplayName(userId: string): Promise<string | null> {
    try {
      return await this.matrixUserService.getUserDisplayName(userId);
    } catch (error) {
      this.logger.error(
        `Failed to get Matrix user display name: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get user display name: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.startClient')
  async startClient(options: {
    userId: string;
    accessToken: string;
    deviceId?: string;
    tenantId?: string;
  }): Promise<void> {
    try {
      // Get the user's slug from the Matrix user ID
      // Matrix user IDs are in the format @username:server
      // For our case, we need to extract the username part which includes the slug
      const userIdParts = options.userId.split(':')[0];
      if (!userIdParts) {
        throw new Error('Invalid Matrix user ID format');
      }

      // Extract slug from the username part (@om_SLUG)
      const userSlug = userIdParts.replace('@om_', '');

      // Use tenantId from options parameter
      const tenantId = options.tenantId;

      // Create a temporary client using the extracted userSlug and tenant ID
      const client = await this.matrixUserService.getClientForUser(
        userSlug,
        undefined, // Deprecated parameter, will be removed in future
        tenantId,
      );

      if (client) {
        await client.startClient();
      }
    } catch (error) {
      this.logger.error(
        `Failed to start Matrix client: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to start client: ${error.message}`);
    }
  }

  @Trace('matrix-chat-provider.sendTypingNotification')
  async sendTypingNotification(
    roomId: string,
    userId: string,
    accessToken: string,
    isTyping: boolean,
    deviceId?: string,
  ): Promise<void> {
    try {
      await this.matrixMessageService.sendTypingNotification(
        roomId,
        userId,
        accessToken,
        isTyping,
        deviceId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send typing notification: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send typing notification: ${error.message}`);
    }
  }
}
