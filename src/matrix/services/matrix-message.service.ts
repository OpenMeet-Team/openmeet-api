import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { IMatrixMessageProvider } from '../types/matrix.interfaces';
import { Message, SendMessageOptions } from '../types/matrix.types';
import { MatrixUserService } from './matrix-user.service';

@Injectable()
export class MatrixMessageService implements IMatrixMessageProvider {
  private readonly logger = new Logger(MatrixMessageService.name);

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    @Inject(forwardRef(() => MatrixUserService))
    private readonly matrixUserService: MatrixUserService,
  ) {}

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

        // Verify the token is valid before sending
        let finalToken = senderToken;
        let isTokenValid = false;

        try {
          isTokenValid = await this.matrixUserService.verifyAccessToken(
            senderId,
            finalToken,
          );
        } catch (error) {
          this.logger.warn(
            `Error verifying token for ${senderId}: ${error.message}`,
          );
          isTokenValid = false;
        }

        // If token is invalid, try to refresh it
        if (!isTokenValid) {
          this.logger.warn(
            `Matrix token for ${senderId} is invalid, attempting to regenerate...`,
          );

          try {
            // Get a new token through admin API
            const newToken =
              await this.matrixUserService.generateNewAccessToken(senderId);
            if (newToken) {
              this.logger.log(`Successfully regenerated token for ${senderId}`);
              finalToken = newToken;

              // Extract username for client cache clearing
              // senderId format: @username_tenantId:server.domain or @username:server.domain
              let username = senderId.startsWith('@')
                ? senderId.split(':')[0].substring(1)
                : senderId;

              // Remove tenant ID suffix if present (username_tenantId -> username)
              // Use the known tenant ID to safely extract the user slug
              if (
                options.tenantId &&
                username.endsWith(`_${options.tenantId}`)
              ) {
                username = username.substring(
                  0,
                  username.length - options.tenantId.length - 1,
                );
              }

              // Clear the client from the cache immediately to force recreation
              try {
                await this.matrixUserService.clearUserClients(
                  username,
                  options.tenantId,
                );
                this.logger.debug(
                  `Cleared cached Matrix clients for user ${username} after token refresh`,
                );
              } catch (clearError) {
                this.logger.warn(
                  `Error clearing cached Matrix clients: ${clearError.message}`,
                );
                // Continue anyway
              }
            } else {
              this.logger.error(`Failed to regenerate token for ${senderId}`);
              throw new Error('Failed to refresh Matrix credentials');
            }
          } catch (refreshError) {
            this.logger.error(
              `Error regenerating token: ${refreshError.message}`,
              refreshError.stack,
            );
            throw new Error('Failed to refresh Matrix credentials');
          }
        } else {
          this.logger.debug(
            `Token for ${senderId} is valid, proceeding with message send`,
          );
        }

        this.logger.debug(`Sending message as user ${senderId}`);

        // Create a temporary client for the user with potentially refreshed token
        const tempClient = sdk.createClient({
          baseUrl: config.baseUrl,
          userId: senderId,
          accessToken: finalToken,
          deviceId: senderDevice,
          useAuthorizationHeader: true,
          logger: {
            // Disable verbose HTTP logging from Matrix SDK
            log: () => {},
            info: () => {},
            warn: () => {},
            debug: () => {},
            error: (msg) => this.logger.error(msg), // Keep error logs
          },
        });

        // Initialize the client before use - this is crucial for token acceptance
        try {
          this.logger.debug(
            `Starting Matrix client for user ${senderId} before sending message`,
          );
          await tempClient.startClient({
            initialSyncLimit: 0, // Minimal sync for message sending
            disablePresence: true, // Don't need presence for message sending
            lazyLoadMembers: true, // Performance optimization
          });
        } catch (startError) {
          this.logger.warn(
            `Non-fatal error starting temporary Matrix client: ${startError.message}`,
          );
          // Continue anyway - some Matrix SDKs allow operations without starting
        }

        // Send the message
        try {
          const response = await tempClient.sendEvent(
            roomId,
            msgtype,
            messageContent,
            '',
          );

          // Stop the client after use to prevent resource leaks
          try {
            tempClient.stopClient();
          } catch (stopError) {
            this.logger.warn(
              `Non-fatal error stopping Matrix client: ${stopError.message}`,
            );
            // Non-fatal error, continue
          }

          return response.event_id;
        } catch (sendError) {
          // If we still get an error after token refresh, it might be a room access issue
          if (sendError.message?.includes('M_FORBIDDEN')) {
            this.logger.error(
              `User ${senderId} does not have permission to send messages to room ${roomId}`,
            );
            throw new Error(
              'You do not have permission to send messages to this room',
            );
          }

          // Handle token issues specially to provide better error messages
          if (
            sendError.message?.includes('M_UNKNOWN_TOKEN') ||
            sendError.message?.includes('Invalid access token')
          ) {
            this.logger.error(
              `Token error for user ${senderId} despite refresh: ${sendError.message}`,
            );
            throw new Error(
              'Matrix authentication failed. Please try again or contact support.',
            );
          }

          throw sendError;
        }
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
   * Send typing notification using slug-based approach with proper tenant context
   * This method handles getting the Matrix credentials and sending typing notifications consistently
   */
  async sendTypingNotificationBySlug(
    roomId: string,
    userSlug: string,
    isTyping: boolean,
    tenantId: string,
  ): Promise<Record<string, never>> {
    this.logger.debug(
      `Sending typing notification for user ${userSlug} in room ${roomId}, typing: ${isTyping}, tenant: ${tenantId}`,
    );

    // Get Matrix client for this user, which ensures credentials are available
    try {
      // Use the MatrixUserService to get a Matrix client - it handles provisioning if needed
      const matrixClient = await this.matrixUserService.getClientForUser(
        userSlug,
        null, // userService is deprecated param, we'll pass null and rely on tenantId
        tenantId,
      );

      // Try to send typing notification using the Matrix client directly
      try {
        await matrixClient.sendTyping(roomId, isTyping, 30000);
        this.logger.debug(
          `Typing notification sent successfully for ${userSlug}`,
        );
        return {};
      } catch (error) {
        // If the error indicates the user is not in the room, log it but don't throw
        // This catches errors like "User X not in room Y" which is a Matrix error
        if (
          error.message?.includes('not in room') ||
          error.message?.includes('not a member of') ||
          error.message?.includes('M_FORBIDDEN')
        ) {
          this.logger.warn(
            `User ${userSlug} not in room ${roomId} when sending typing notification: ${error.message}. Triggering event.attendee.updated to add them.`,
          );

          throw new Error(
            `User ${userSlug} not in Matrix room ${roomId}. Please try again in a moment.`,
          );
        }

        // Handle invalid token errors with helpful message
        if (
          error.message?.includes('M_UNKNOWN_TOKEN') ||
          error.message?.includes('Invalid access token')
        ) {
          this.logger.warn(
            `User ${userSlug} has invalid Matrix credentials: ${error.message}`,
          );

          throw new Error(
            `Chat credentials have expired. Please refresh the page to reconnect to chat.`,
          );
        }

        // For other errors, propagate them
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `Error in sendTypingNotificationBySlug: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send typing notification: ${error.message}`);
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
  ): Promise<Record<string, never>> {
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
        logger: {
          // Disable verbose HTTP logging from Matrix SDK
          log: () => {},
          info: () => {},
          warn: () => {},
          debug: () => {},
          error: (msg) => this.logger.error(msg), // Keep error logs
        },
      });

      // Initialize the client before using it (similar to messaging)
      try {
        this.logger.debug(
          `Starting Matrix client for typing notification as ${userId}`,
        );
        await client.startClient({
          initialSyncLimit: 0,
          disablePresence: true,
          lazyLoadMembers: true,
        });
      } catch (startError) {
        this.logger.warn(
          `Non-fatal error starting Matrix client for typing: ${startError.message}`,
        );
        // Continue anyway
      }

      // Send typing notification
      // The timeout is how long the typing indicator should be shown (in milliseconds)
      // Use 20 seconds for active typing, or 0 for stopped typing
      const timeout = isTyping ? 20000 : 0;

      await client.sendTyping(roomId, isTyping, timeout);

      // Clean up client
      try {
        client.stopClient();
      } catch (stopError) {
        this.logger.warn(
          `Non-fatal error stopping Matrix client: ${stopError.message}`,
        );
      }

      this.logger.debug(`Typing notification sent successfully`);
      return {};
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
    _userId?: string,
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

      try {
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
      } catch (axiosError) {
        // Handle specific HTTP errors more gracefully
        if (axiosError.response) {
          const status = axiosError.response.status;

          // For 400 errors, it could be that the room is new or empty
          // Return empty results instead of throwing
          if (status === 400) {
            this.logger.warn(
              `Got 400 error when getting messages from room ${roomId}. Room may be new or empty. Error: ${axiosError.message}`,
            );

            return {
              messages: [],
              end: '',
            };
          }

          // For 403 errors, user might not have permission - also return empty
          if (status === 403) {
            this.logger.warn(
              `Got 403 error when getting messages from room ${roomId}. User may not have permission. Error: ${axiosError.message}`,
            );

            return {
              messages: [],
              end: '',
            };
          }
        }

        // For other errors, still log but throw
        throw axiosError;
      }
    } catch (error) {
      this.logger.error(
        `Error getting messages from room ${roomId}: ${error.message}`,
        error.stack,
      );

      // Special handling for common errors
      if (error.message && error.message.includes('M_NOT_FOUND')) {
        // Room not found - return empty results
        this.logger.warn(`Room ${roomId} not found, returning empty results`);
        return {
          messages: [],
          end: '',
        };
      }

      throw new Error(
        `Failed to get messages from Matrix room: ${error.message}`,
      );
    } finally {
      await this.matrixCoreService.releaseClient(client);
    }
  }

  /**
   * Redact (delete) a message from a room using user's credentials
   */
  async redactMessage(options: {
    roomId: string;
    eventId: string;
    reason?: string;
    userSlug: string;
    tenantId: string;
  }): Promise<string> {
    const { roomId, eventId, reason, userSlug, tenantId } = options;

    try {
      this.logger.debug(
        `Redacting message ${eventId} in room ${roomId} as user ${userSlug}`,
      );

      // Get Matrix client for this user - this handles all the credential management
      const matrixClient = await this.matrixUserService.getClientForUser(
        userSlug,
        null,
        tenantId,
      );

      // Debug: Check user's power level in the room before attempting redaction
      try {
        const matrixUserId = matrixClient.getUserId();
        if (matrixUserId) {
          const powerLevels = await matrixClient.getStateEvent(
            roomId,
            'm.room.power_levels',
            '',
          );
          const userPowerLevel = powerLevels?.users?.[matrixUserId] || 0;
          const redactLevel = powerLevels?.redact || 50; // Default redact level is usually 50

          this.logger.log(
            `Redaction debug: User ${userSlug} (${matrixUserId}) has power level ${userPowerLevel}, redact level required: ${redactLevel}`,
          );

          if (userPowerLevel < redactLevel) {
            this.logger.warn(
              `User ${userSlug} has insufficient power level (${userPowerLevel}) to redact messages (requires ${redactLevel})`,
            );
          }
        }
      } catch (debugError) {
        this.logger.warn(
          `Could not check power levels for redaction debug: ${debugError.message}`,
        );
      }

      // Redact the message
      const response = await matrixClient.redactEvent(roomId, eventId, reason);

      this.logger.debug(
        `Successfully redacted message ${eventId}, redaction event: ${response.event_id}`,
      );

      return response.event_id;
    } catch (error) {
      // Handle permission errors
      if (error.message?.includes('M_FORBIDDEN')) {
        this.logger.error(
          `User ${userSlug} does not have permission to redact message ${eventId} in room ${roomId}`,
        );
        throw new Error('You do not have permission to redact this message');
      }

      // Handle token issues
      if (
        error.message?.includes('M_UNKNOWN_TOKEN') ||
        error.message?.includes('Invalid access token')
      ) {
        this.logger.error(
          `Authentication error for user ${userSlug}: ${error.message}`,
        );
        throw new Error(
          'Chat authentication failed. Please refresh the page to reconnect.',
        );
      }

      // Handle message not found
      if (error.message?.includes('M_NOT_FOUND')) {
        this.logger.warn(`Message ${eventId} not found in room ${roomId}`);
        throw new Error('Message not found');
      }

      this.logger.error(
        `Error redacting message ${eventId} in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to redact message: ${error.message}`);
    }
  }
}
