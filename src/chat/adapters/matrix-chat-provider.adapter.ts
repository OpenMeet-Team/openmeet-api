import { Injectable, Logger } from '@nestjs/common';
import { MatrixService } from '../../matrix/matrix.service';
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

/**
 * Matrix implementation of the ChatProviderInterface
 */
@Injectable()
export class MatrixChatProviderAdapter implements ChatProviderInterface {
  private readonly logger = new Logger(MatrixChatProviderAdapter.name);
  private readonly tracer = trace.getTracer('matrix-chat-provider-adapter');

  constructor(private readonly matrixService: MatrixService) {}

  @Trace('matrix-chat-provider.createRoom')
  async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    try {
      return await this.matrixService.createRoom(options);
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
      return await this.matrixService.getRoomMessages(
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
      return await this.matrixService.sendMessage(options);
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
      await this.matrixService.inviteUser(options);
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
      await this.matrixService.joinRoom(roomId, userId, accessToken, deviceId);
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
      await this.matrixService.removeUserFromRoom(roomId, userId);
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
      return await this.matrixService.createUser(options);
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
      await this.matrixService.setUserDisplayName(
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
      return await this.matrixService.getUserDisplayName(userId);
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
  }): Promise<void> {
    try {
      await this.matrixService.startClient(options);
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
      await this.matrixService.sendTypingNotification(
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
