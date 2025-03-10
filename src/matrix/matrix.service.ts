import { Inject, Injectable, Logger } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserService } from '../user/user.service';
import { ulid } from 'ulid';
import * as sdk from 'matrix-js-sdk';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Preset, Visibility } from 'matrix-js-sdk';

@Injectable()
export class MatrixService {
  private readonly logger = new Logger(MatrixService.name);
  private readonly matrixServerUrl: string;
  private readonly matrixAdminUsername: string;
  private readonly matrixAdminPassword: string;
  private adminAccessToken: string | null = null;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    this.matrixServerUrl =
      this.configService.get('MATRIX_SERVER_URL', { infer: true }) ??
      'https://matrix-dev.openmeet.net';
    this.matrixAdminUsername =
      this.configService.get('MATRIX_ADMIN_USERNAME', { infer: true }) ??
      'admin';
    this.matrixAdminPassword =
      this.configService.get('MATRIX_ADMIN_PASSWORD', { infer: true }) ??
      'secret';
  }

  /**
   * Get the admin access token, logging in if necessary
   */
  async getAdminAccessToken(): Promise<string> {
    if (this.adminAccessToken) {
      return this.adminAccessToken;
    }

    try {
      const response = await axios.post(
        `${this.matrixServerUrl}/_matrix/client/r0/login`,
        {
          type: 'm.login.password',
          user: this.matrixAdminUsername,
          password: this.matrixAdminPassword,
        },
      );

      this.adminAccessToken = response.data.access_token;
      return this.adminAccessToken || '';
    } catch (error) {
      this.logger.error('Failed to get admin access token', error);
      throw new Error('Failed to authenticate with Matrix server');
    }
  }

  /**
   * Get an initialized Matrix client for the admin user
   */
  async getAdminClient(): Promise<sdk.MatrixClient> {
    const accessToken = await this.getAdminAccessToken();
    return sdk.createClient({
      baseUrl: this.matrixServerUrl,
      accessToken,
      userId: `@${this.matrixAdminUsername}:${new URL(this.matrixServerUrl).hostname}`,
    });
  }

  /**
   * Get an initialized Matrix client for a user
   */
  async getInitializedClient(user: UserEntity): Promise<sdk.MatrixClient> {
    if (!user.matrixUserId || !user.matrixAccessToken) {
      // Generate a unique username and password for the new Matrix user
      const username = `tenant_${this.request.tenantId}__${user.ulid}`;
      const password = ulid();
      const displayName =
        `${user.firstName} ${user.lastName}`.trim() || 'Anonymous';

      // Create the user in Matrix
      const userId = await this.createUser({
        username,
        password,
        displayName,
      });

      // Log in to get an access token
      const loginResponse = await axios.post(
        `${this.matrixServerUrl}/_matrix/client/r0/login`,
        {
          type: 'm.login.password',
          user: username,
          password,
        },
      );

      const accessToken = loginResponse.data.access_token;
      const deviceId = loginResponse.data.device_id;

      // Store the Matrix credentials in the user entity
      const updatedUser = await this.userService.addMatrixCredentialsToUser(
        user.id,
        {
          matrixUserId: userId,
          matrixAccessToken: accessToken,
          matrixDeviceId: deviceId,
        },
      );

      if (!updatedUser) {
        throw new Error('Failed to update user with Matrix credentials');
      }

      return sdk.createClient({
        baseUrl: this.matrixServerUrl,
        accessToken,
        userId,
        deviceId,
      });
    }

    // Return a client with the existing credentials
    return sdk.createClient({
      baseUrl: this.matrixServerUrl,
      accessToken: user.matrixAccessToken,
      userId: user.matrixUserId,
      deviceId: user.matrixDeviceId,
    });
  }

  /**
   * Create a new Matrix user
   */
  async createUser(params: {
    username: string;
    password: string;
    displayName: string;
  }): Promise<string> {
    try {
      const adminAccessToken = await this.getAdminAccessToken();
      const hostname = new URL(this.matrixServerUrl).hostname;
      const userId = `@${params.username}:${hostname}`;

      // Use the Admin API to create a user
      await axios.put(
        `${this.matrixServerUrl}/_synapse/admin/v2/users/${encodeURIComponent(userId)}`,
        {
          password: params.password,
          displayname: params.displayName,
          admin: false,
          deactivated: false,
        },
        {
          headers: {
            Authorization: `Bearer ${adminAccessToken}`,
          },
        },
      );

      return userId;
    } catch (error) {
      this.logger.error('Failed to create Matrix user', error);
      throw new Error('Failed to create Matrix user');
    }
  }

  /**
   * Delete a Matrix user
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      const adminAccessToken = await this.getAdminAccessToken();

      // Use the Admin API to deactivate a user
      await axios.post(
        `${this.matrixServerUrl}/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`,
        {
          erase: true, // This will remove all personal data
        },
        {
          headers: {
            Authorization: `Bearer ${adminAccessToken}`,
          },
        },
      );
    } catch (error) {
      this.logger.error('Failed to delete Matrix user', error);
      throw new Error('Failed to delete Matrix user');
    }
  }

  /**
   * Create a new Matrix room
   */
  async createRoom(params: {
    name: string;
    topic?: string;
    isPublic?: boolean;
    creatorId?: string;
  }): Promise<string> {
    try {
      const client = params.creatorId
        ? await this.getClientForUserId(params.creatorId)
        : await this.getAdminClient();

      const response = await client.createRoom({
        visibility: params.isPublic ? Visibility.Public : Visibility.Private,
        name: params.name,
        topic: params.topic,
        preset: params.isPublic ? Preset.PublicChat : Preset.PrivateChat,
      });

      return response.room_id;
    } catch (error) {
      this.logger.error('Failed to create Matrix room', error);
      throw new Error('Failed to create Matrix room');
    }
  }

  /**
   * Get a Matrix client for a specific user ID
   */
  private async getClientForUserId(userId: string): Promise<sdk.MatrixClient> {
    const user = await this.userService.findOneByMatrixUserId(userId);
    if (!user) {
      throw new Error(`User with Matrix ID ${userId} not found`);
    }
    return this.getInitializedClient(user);
  }

  /**
   * Invite a user to a room
   */
  async inviteUserToRoom(
    roomId: string,
    userId: string,
    inviterId?: string,
  ): Promise<void> {
    try {
      const client = inviterId
        ? await this.getClientForUserId(inviterId)
        : await this.getAdminClient();

      await client.invite(roomId, userId);
    } catch (error) {
      this.logger.error('Failed to invite user to room', error);
      throw new Error('Failed to invite user to room');
    }
  }

  /**
   * Remove a user from a room
   */
  async kickUserFromRoom(
    roomId: string,
    userId: string,
    reason?: string,
    kickerId?: string,
  ): Promise<void> {
    try {
      const client = kickerId
        ? await this.getClientForUserId(kickerId)
        : await this.getAdminClient();

      await client.kick(roomId, userId, reason || 'Removed from room');
    } catch (error) {
      this.logger.error('Failed to kick user from room', error);
      throw new Error('Failed to kick user from room');
    }
  }

  /**
   * Send a message to a room
   */
  async sendMessage(
    user: UserEntity,
    roomId: string,
    content: string,
    messageType: string = 'm.room.message',
    additionalContent: Record<string, any> = {},
  ): Promise<{ eventId: string }> {
    try {
      const client = await this.getInitializedClient(user);

      // Create the message content
      const messageContent: any = {
        msgtype: 'm.text',
        body: content,
        ...additionalContent,
      };

      // Send the message
      const response = await client.sendEvent(
        roomId,
        messageType,
        messageContent,
        '',
      );

      return { eventId: response.event_id };
    } catch (error) {
      this.logger.error('Failed to send message', error);
      throw new Error('Failed to send message');
    }
  }

  /**
   * Get messages from a room
   */
  async getMessages(
    user: UserEntity,
    roomId: string,
    limit: number = 50,
    from?: string,
  ): Promise<{
    chunk: any[];
    start: string;
    end: string;
  }> {
    try {
      const client = await this.getInitializedClient(user);

      // Use null instead of undefined for the parameters as required by the API
      const response = await client.createMessagesRequest(
        roomId,
        from || null,
        limit,
        sdk.Direction.Forward,
      );

      return {
        chunk: response.chunk || [],
        start: response.start || '',
        end: response.end || '',
      };
    } catch (error) {
      this.logger.error('Failed to get messages', error);
      throw new Error('Failed to get messages');
    }
  }

  /**
   * Get rooms for a user
   */
  async getUserRooms(user: UserEntity): Promise<any[]> {
    try {
      const client = await this.getInitializedClient(user);
      await client.startClient({ initialSyncLimit: 0 });

      // Wait for the client to sync
      await new Promise<void>((resolve) => {
        const onSync = (state: any) => {
          if (state === 'PREPARED') {
            client.removeListener('sync' as any, onSync);
            resolve();
          }
        };
        client.on('sync' as any, onSync);
      });

      const rooms = client.getRooms();
      client.stopClient();

      return rooms.map((room) => {
        // Fix the topic retrieval
        const topicEvents = room.currentState?.getStateEvents(
          'm.room.topic',
          '',
        );
        let topic = '';

        // Check if topicEvents is an array and has elements
        if (
          Array.isArray(topicEvents) &&
          topicEvents.length > 0 &&
          topicEvents[0]
        ) {
          const content = topicEvents[0].getContent();
          topic = content && content.topic ? content.topic : '';
        }

        return {
          id: room.roomId,
          name: room.name,
          topic,
          avatarUrl: room.getAvatarUrl(this.matrixServerUrl, 96, 96, 'crop'),
          isPublic: room.getJoinRule() === 'public',
          memberCount: room.getJoinedMemberCount(),
        };
      });
    } catch (error) {
      this.logger.error('Failed to get user rooms', error);
      throw new Error('Failed to get user rooms');
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    user: UserEntity,
    roomId: string,
    eventId: string,
    newContent: string,
  ): Promise<{ eventId: string }> {
    try {
      const client = await this.getInitializedClient(user);

      const response = await client.sendEvent(roomId, 'm.room.message' as any, {
        msgtype: 'm.text',
        body: newContent,
        'm.new_content': {
          msgtype: 'm.text',
          body: newContent,
        },
        'm.relates_to': {
          rel_type: 'm.replace',
          event_id: eventId,
        },
      });

      return { eventId: response.event_id };
    } catch (error) {
      this.logger.error('Failed to update message', error);
      throw new Error('Failed to update message');
    }
  }

  /**
   * Delete a message (redact in Matrix terms)
   */
  async deleteMessage(
    user: UserEntity,
    roomId: string,
    eventId: string,
    reason?: string,
  ): Promise<{ eventId: string }> {
    try {
      const client = await this.getInitializedClient(user);

      const response = await client.redactEvent(roomId, eventId, reason);

      return { eventId: response.event_id };
    } catch (error) {
      this.logger.error('Failed to delete message', error);
      throw new Error('Failed to delete message');
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(
    user: UserEntity,
    roomId: string,
    eventId: string,
  ): Promise<void> {
    try {
      const client = await this.getInitializedClient(user);

      // Create a MatrixEvent object from the event ID
      const event = {
        getRoomId: () => roomId,
        getId: () => eventId,
        getTs: () => Date.now(),
      };

      await client.sendReadReceipt(event as any);
    } catch (error) {
      this.logger.error('Failed to mark messages as read', error);
      throw new Error('Failed to mark messages as read');
    }
  }
}
