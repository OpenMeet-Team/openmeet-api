import { Injectable, Logger } from '@nestjs/common';
import { MatrixClientOperationsService } from './matrix-client-operations.service';

/**
 * Example service showing how to use the MatrixClientOperationsService
 * for handling Matrix operations with short-lived clients.
 *
 * This is an example only and not for production use.
 */
@Injectable()
export class MatrixMessageOperationsExample {
  private readonly logger = new Logger(MatrixMessageOperationsExample.name);

  constructor(
    private readonly matrixOperations: MatrixClientOperationsService,
  ) {}

  /**
   * Send a message to an event chat using a short-lived client
   *
   * @param eventSlug Event slug
   * @param userSlug User slug
   * @param content Message content
   * @param tenantId Optional tenant ID
   * @returns The event ID of the sent message
   */
  async sendMessage(
    eventSlug: string,
    userSlug: string,
    content: { body: string; msgtype: string },
    tenantId?: string,
  ): Promise<string> {
    this.logger.debug(
      `Sending message to event ${eventSlug} as user ${userSlug}`,
    );

    try {
      // Use the withMessageOperation helper for message-specific operations
      const eventId = await this.matrixOperations.withMessageOperation(
        eventSlug,
        userSlug,
        async (client, roomId) => {
          // Send the message
          const result = await client.sendEvent(
            roomId,
            'm.room.message',
            content,
          );

          return result.event_id;
        },
        tenantId,
      );

      this.logger.debug(`Message sent successfully with event ID: ${eventId}`);
      return eventId;
    } catch (error) {
      this.logger.error(
        `Failed to send message to event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get the most recent messages from an event chat
   *
   * @param eventSlug Event slug
   * @param userSlug User slug
   * @param limit Maximum number of messages to fetch
   * @param tenantId Optional tenant ID
   * @returns Array of messages
   */
  async getRecentMessages(
    eventSlug: string,
    userSlug: string,
    limit = 20,
    tenantId?: string,
  ): Promise<any[]> {
    this.logger.debug(
      `Fetching ${limit} messages from event ${eventSlug} for user ${userSlug}`,
    );

    try {
      return await this.matrixOperations.withEventOperation(
        eventSlug,
        userSlug,
        async (client, roomId) => {
          // First join the room if not already joined
          try {
            await client.joinRoom(roomId);
          } catch (error) {
            // Ignore if already joined
            if (!error.message?.includes('already in the room')) {
              throw error;
            }
          }

          // Then fetch messages (implementation depends on Matrix SDK version)
          const response = await client.roomState(roomId);

          // Here we would normally use a message fetching method
          // but this is simplified for the example
          return response.filter((event) => event.type === 'm.room.message');
        },
        tenantId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fetch messages from event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send a typing notification
   *
   * @param eventSlug Event slug
   * @param userSlug User slug
   * @param isTyping Whether the user is typing
   * @param tenantId Optional tenant ID
   */
  async sendTypingNotification(
    eventSlug: string,
    userSlug: string,
    isTyping: boolean,
    tenantId?: string,
  ): Promise<void> {
    this.logger.debug(
      `Sending typing notification to event ${eventSlug} for user ${userSlug}: ${isTyping ? 'typing' : 'not typing'}`,
    );

    try {
      await this.matrixOperations.withEventOperation(
        eventSlug,
        userSlug,
        async (client, roomId) => {
          await client.sendTyping(roomId, isTyping, 30000); // 30 seconds timeout
        },
        tenantId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send typing notification to event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      // Do not rethrow - typing notifications should not break the app
    }
  }

  /**
   * Example of admin operations on an event room
   *
   * @param eventSlug Event slug
   * @returns Room state events
   */
  async getAdminEventState(eventSlug: string): Promise<any[]> {
    this.logger.debug(`Getting room state for event ${eventSlug} as admin`);

    try {
      return await this.matrixOperations.withAdminEventOperation(
        eventSlug,
        async (client, roomId) => {
          return client.roomState(roomId);
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to get room state for event ${eventSlug}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
