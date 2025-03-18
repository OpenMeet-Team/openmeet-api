import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { IMatrixMessageProvider } from '../types/matrix.interfaces';
import { Message, SendMessageOptions } from '../types/matrix.types';

@Injectable()
export class MatrixMessageService implements IMatrixMessageProvider {
  private readonly logger = new Logger(MatrixMessageService.name);

  constructor(private readonly matrixCoreService: MatrixCoreService) {}

  /**
   * Send a message to a room
   */
  async sendMessage(options: SendMessageOptions): Promise<string> {
    const {
      roomId,
      body,
      msgtype = 'm.room.message',
      formatted_body,
      format,
      senderUserId,
      senderAccessToken,
      senderDeviceId,
      content,
      messageType = 'm.text',
      userId,
      accessToken,
      deviceId,
    } = options;

    try {
      // Create the message content
      let messageContent: any;

      // Handle different input formats for backwards compatibility
      if (content) {
        // If content is a string, treat it as the message body
        if (typeof content === 'string') {
          messageContent = {
            msgtype: messageType,
            body: content,
          };
        } else if (typeof content === 'object') {
          // If content is an object, use it directly
          messageContent =
            typeof content === 'string' ? JSON.parse(content) : content;
        }
      } else {
        // Use legacy parameters
        messageContent = {
          msgtype: 'm.text',
          body: body,
        };

        // Add formatted content if provided
        if (formatted_body && format) {
          messageContent.format = format;
          messageContent.formatted_body = formatted_body;
        }
      }

      const config = this.matrixCoreService.getConfig();
      const sdk = this.matrixCoreService.getSdk();

      // If a specific sender is provided, use their credentials
      if ((senderUserId && senderAccessToken) || (userId && accessToken)) {
        const senderId = senderUserId || userId;
        const senderToken = senderAccessToken || accessToken;
        const senderDevice =
          senderDeviceId || deviceId || config.defaultDeviceId;

        this.logger.debug(`Sending message as user ${senderId}`);

        // Create a temporary client for the user
        const tempClient = sdk.createClient({
          baseUrl: config.baseUrl,
          userId: senderId,
          accessToken: senderToken,
          deviceId: senderDevice,
          useAuthorizationHeader: true,
        });

        // Send the message
        const response = await tempClient.sendEvent(
          roomId,
          msgtype,
          messageContent,
          '',
        );

        return response.event_id;
      }

      // Fall back to using the admin client
      this.logger.debug(`Sending message as admin user ${config.adminUserId}`);
      const client = await this.matrixCoreService.acquireClient();

      try {
        const response = await client.client.sendEvent(
          roomId,
          msgtype,
          messageContent,
          '',
        );

        return response.event_id;
      } finally {
        await this.matrixCoreService.releaseClient(client);
      }
    } catch (error) {
      this.logger.error(
        `Error sending message to room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to send message to Matrix room: ${error.message}`,
      );
    }
  }

  /**
   * Send typing notification
   */
  async sendTypingNotification(
    roomId: string,
    userId: string,
    accessToken: string,
    isTyping: boolean,
    deviceId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Sending typing notification for user ${userId} in room ${roomId}, typing: ${isTyping}`,
      );

      const config = this.matrixCoreService.getConfig();
      const sdk = this.matrixCoreService.getSdk();

      // Create a temporary client
      const client = sdk.createClient({
        baseUrl: config.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || config.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      // Send typing notification
      // The timeout is how long the typing indicator should be shown (in milliseconds)
      // Use 20 seconds for active typing, or 0 for stopped typing
      const timeout = isTyping ? 20000 : 0;

      await client.sendTyping(roomId, isTyping, timeout);

      this.logger.debug(`Typing notification sent successfully`);
    } catch (error) {
      this.logger.error(
        `Error sending typing notification in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send typing notification: ${error.message}`);
    }
  }

  /**
   * Get room messages
   */
  async getRoomMessages(
    roomId: string,
    limit = 50,
    from?: string,
    userId?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    const client = await this.matrixCoreService.acquireClient();

    try {
      const config = this.matrixCoreService.getConfig();

      // Use direct API access for reliability and consistency
      const url = `${config.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`;
      const params = new URLSearchParams({
        dir: 'b', // backwards from most recent
        limit: limit.toString(),
        ...(from ? { from } : {}),
      });

      // Get access token from client
      const accessToken = client.client.getAccessToken
        ? client.client.getAccessToken()
        : null;

      if (!accessToken) {
        throw new Error('No access token available to fetch messages');
      }

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const messages = response.data.chunk
        .filter((event) => event.type === 'm.room.message')
        .map((event) => ({
          eventId: event.event_id || '',
          roomId: event.room_id || roomId,
          sender: event.sender || '',
          content: event.content,
          timestamp: event.origin_server_ts,
        }));

      return {
        messages,
        end: response.data.end || '',
      };
    } catch (error) {
      this.logger.error(
        `Error getting messages from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to get messages from Matrix room: ${error.message}`,
      );
    } finally {
      await this.matrixCoreService.releaseClient(client);
    }
  }
}
