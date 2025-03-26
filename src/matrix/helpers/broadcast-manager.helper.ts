import { Logger } from '@nestjs/common';

/**
 * Manages deduplication of Matrix event broadcasts
 */
export class BroadcastManager {
  // Store recently broadcast event IDs to prevent duplicates
  private recentlyBroadcastEvents = new Map<string, number>();
  private logger: Logger;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Checks if an event has been recently broadcast
   * @param roomId Matrix room ID
   * @param event Event to check
   * @returns true if the event should be skipped (is a duplicate), false otherwise
   */
  shouldSkipDuplicateBroadcast(roomId: string, event: any): boolean {
    try {
      if (!roomId) {
        this.logger.warn('Attempted to broadcast to room with no room ID');
        return true;
      }

      // Check if this is a duplicate event we've already broadcast
      // Use both event_id and _broadcastId to identify events
      const eventId = event.event_id || event.id || 'unknown';
      const existingBroadcastId = event._broadcastId || '';

      if (eventId !== 'unknown') {
        // Create a unique key to track this broadcast
        // Include broadcastId if available to make key more specific
        const broadcastKey = existingBroadcastId
          ? `${roomId}:${eventId}:${existingBroadcastId}`
          : `${roomId}:${eventId}`;

        // Check if we've recently broadcast this exact event
        const lastBroadcast = this.recentlyBroadcastEvents.get(broadcastKey);
        if (lastBroadcast && Date.now() - lastBroadcast < 30000) {
          // 30 seconds
          this.logger.debug(
            `Skipping duplicate broadcast of event ${eventId} to room ${roomId}`,
          );
          return true;
        }

        // Also check if we've broadcast this event with a different broadcast ID
        // This handles the case where the same Matrix event comes from different sync responses
        if (!existingBroadcastId) {
          // Look for any keys that contain this roomId:eventId
          const baseKey = `${roomId}:${eventId}`;
          let isDuplicate = false;

          for (const [
            key,
            timestamp,
          ] of this.recentlyBroadcastEvents.entries()) {
            if (key.startsWith(baseKey) && Date.now() - timestamp < 30000) {
              this.logger.debug(
                `Skipping duplicate broadcast of event ${eventId} (matched existing broadcast)`,
              );
              isDuplicate = true;
              break;
            }
          }

          if (isDuplicate) {
            return true;
          }
        }

        // Record this broadcast to prevent duplicates
        this.recentlyBroadcastEvents.set(broadcastKey, Date.now());

        // Cleanup old entries every 10 broadcasts
        if (this.recentlyBroadcastEvents.size % 10 === 0) {
          this.cleanupOldBroadcasts();
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Error in shouldSkipDuplicateBroadcast: ${error.message}`,
        error.stack,
      );
      return false; // If error checking duplicate, proceed with broadcast
    }
  }

  /**
   * Cleanup old broadcast records to prevent memory leaks
   * Only keeps records from the last 10 minutes
   */
  cleanupOldBroadcasts(): void {
    try {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000; // 10 minutes

      // Remove entries older than 10 minutes
      for (const [key, timestamp] of this.recentlyBroadcastEvents.entries()) {
        if (timestamp < tenMinutesAgo) {
          this.recentlyBroadcastEvents.delete(key);
        }
      }

      this.logger.debug(
        `Cleaned up old broadcast records. Current count: ${this.recentlyBroadcastEvents.size}`,
      );
    } catch (error) {
      this.logger.error(
        `Error cleaning up broadcast records: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Generate a broadcast ID unique to this event
   * @returns A unique string ID for tracking broadcasts
   */
  generateBroadcastId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
