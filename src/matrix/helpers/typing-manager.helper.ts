import { Logger } from '@nestjs/common';

/**
 * Caches and manages typing state to reduce redundant Matrix API calls
 */
export class TypingManager {
  // Store last typing state to avoid redundant Matrix API calls
  private typingCache = new Map<
    string,
    { state: boolean; timestamp: number }
  >();

  private logger: Logger;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Checks if a typing notification should be sent
   * @param userId User ID sending the notification
   * @param roomId Room ID the notification is for
   * @param isTyping Current typing state
   * @returns true if notification should be sent, false if redundant
   */
  shouldSendTypingNotification(
    userId: string | number,
    roomId: string,
    isTyping: boolean,
  ): boolean {
    try {
      const cacheKey = `${userId}:${roomId}`;
      const lastState = this.typingCache.get(cacheKey);
      const now = Date.now();

      // Only send if state changed or it's been more than 15 seconds since last update
      // This prevents excessive Matrix API calls for typing notifications
      if (
        lastState &&
        lastState.state === isTyping &&
        now - lastState.timestamp < 15000
      ) {
        // State hasn't changed and it's been less than 15 seconds, skip this update
        return false;
      }

      // Update the cache with current state
      this.typingCache.set(cacheKey, {
        state: isTyping,
        timestamp: now,
      });

      // Clean up old entries every 100 new ones
      if (this.typingCache.size % 100 === 0) {
        this.cleanupTypingCache();
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error in shouldSendTypingNotification: ${error.message}`,
        error.stack,
      );
      return true; // If error checking cache, proceed with notification
    }
  }

  /**
   * Clean up typing cache entries older than 5 minutes
   * to prevent memory leaks
   */
  cleanupTypingCache(): void {
    try {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

      for (const [key, value] of this.typingCache.entries()) {
        if (value.timestamp < fiveMinutesAgo) {
          this.typingCache.delete(key);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error cleaning up typing cache: ${error.message}`,
        error.stack,
      );
    }
  }
}
