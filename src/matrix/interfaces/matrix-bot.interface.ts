/**
 * Interface for Matrix AppService Bot operations
 * Defines the contract for AppService-based Matrix administrative operations
 * All operations use AppService authentication tokens, not individual bot credentials
 */

export interface IMatrixBot {
  /**
   * Authenticate the bot with Matrix server for a specific tenant
   * @param tenantId Tenant ID to authenticate for
   * @returns Promise<void> - Resolves when bot is authenticated
   * @throws Error if authentication fails
   */
  authenticateBot(tenantId: string): Promise<void>;

  /**
   * Check if the bot is currently authenticated
   * @returns boolean - True if bot has valid authentication
   */
  isBotAuthenticated(): boolean;

  /**
   * Create a Matrix room with specified configuration
   * @param options Room creation options
   * @param tenantId Tenant ID for authentication context
   * @returns Promise with room information
   */
  createRoom(
    options: {
      name: string;
      topic?: string;
      isPublic: boolean;
      isDirect?: boolean;
      encrypted?: boolean;
      inviteUserIds?: string[];
      powerLevelContentOverride?: Record<string, any>;
    },
    tenantId: string,
  ): Promise<{
    roomId: string;
    name: string;
    topic?: string;
    invitedMembers?: string[];
  }>;

  /**
   * Invite a user to a Matrix room
   * @param roomId Matrix room ID
   * @param userId Matrix user ID to invite
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  inviteUser(roomId: string, userId: string, tenantId: string): Promise<void>;

  /**
   * Remove a user from a Matrix room
   * @param roomId Matrix room ID
   * @param userId Matrix user ID to remove
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  removeUser(roomId: string, userId: string, tenantId: string): Promise<void>;

  /**
   * Sync OpenMeet permissions to Matrix power levels
   * @param roomId Matrix room ID
   * @param userPowerLevels Map of user ID to power level
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  syncPermissions(
    roomId: string,
    userPowerLevels: Record<string, number>,
    tenantId: string,
  ): Promise<void>;

  /**
   * Send a system message as the bot
   * @param roomId Matrix room ID
   * @param message Message content
   * @param tenantId Tenant ID for authentication context
   * @returns Promise with event ID
   */
  sendMessage(
    roomId: string,
    message: string,
    tenantId: string,
  ): Promise<string>;

  /**
   * Join a room as the bot (required before performing admin operations)
   * @param roomId Matrix room ID
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  joinRoom(roomId: string, tenantId: string): Promise<void>;

  /**
   * Get the bot's Matrix user ID
   * @param tenantId Optional tenant ID for tenant-specific bot
   * @returns string - Bot's Matrix user ID (e.g., @openmeet-bot:matrix.openmeet.net)
   */
  getBotUserId(tenantId?: string): string;

  /**
   * Check if the bot is in a specific room
   * @param roomId Matrix room ID
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<boolean>
   */
  isBotInRoom(roomId: string, tenantId: string): Promise<boolean>;

  /**
   * Delete a Matrix room (admin operation)
   * @param roomId Matrix room ID to delete
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  deleteRoom(roomId: string, tenantId: string): Promise<void>;

  /**
   * Verify that a Matrix room exists and is accessible
   * @param roomId Matrix room ID to verify
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<boolean> - True if room exists and is accessible
   */
  verifyRoomExists(roomId: string, tenantId: string): Promise<boolean>;

  /**
   * Get the bot's current power level in a specific room
   * @param roomId Matrix room ID to check
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<number> - Bot's power level (0-100)
   */
  getBotPowerLevel(roomId: string, tenantId: string): Promise<number>;

  /**
   * Force join the bot to a room using admin API (bypasses normal Matrix permissions)
   * @param roomId Matrix room ID to join
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  adminJoinRoom(roomId: string, tenantId: string): Promise<void>;

  /**
   * Set power levels in a room using admin API (bypasses normal Matrix permissions)
   * @param roomId Matrix room ID
   * @param powerLevels Map of user ID to power level
   * @param tenantId Tenant ID for authentication context
   * @returns Promise<void>
   */
  adminSetPowerLevels(
    roomId: string,
    powerLevels: Record<string, number>,
    tenantId: string,
  ): Promise<void>;
}
