import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { MatrixBotService } from './matrix-bot.service';
import { CreateRoomOptions, RoomInfo } from '../types/matrix.types';
import { IMatrixClient, IMatrixRoomProvider } from '../types/matrix.interfaces';
import { MatrixConfig } from '../config/matrix-config.type';

// Room configuration interfaces
export interface RoomEntity {
  name: string;
  slug: string;
  visibility: 'public' | 'private';
}

export interface DirectMessageConfig {
  user1Handle: string;
  user2Handle: string;
  user1MatrixId: string;
  user2MatrixId: string;
}
import { HttpStatus } from '@nestjs/common';
import { RoomAliasUtils } from '../utils/room-alias.utils';
import { fetchTenants, getTenantConfig } from '../../utils/tenant-config';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { MatrixEventListener } from '../matrix-event.listener';
import { EventQueryService } from '../../event/services/event-query.service';

@Injectable()
export class MatrixRoomService implements IMatrixRoomProvider {
  private readonly logger = new Logger(MatrixRoomService.name);

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly matrixBotUserService: MatrixBotUserService,
    private readonly matrixBotService: MatrixBotService,
    private readonly configService: ConfigService,
    private readonly roomAliasUtils: RoomAliasUtils,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly matrixEventListener: MatrixEventListener,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
  ) {}

  /**
   * Generate room configuration options for groups and events
   * @param entity The group or event entity
   * @param localpart The room alias localpart
   * @param entityType Whether this is for a 'group' or 'event'
   * @returns Room creation options with proper encryption settings
   */
  generateRoomOptions(
    entity: RoomEntity,
    localpart: string,
    entityType: 'group' | 'event' = 'group',
  ): CreateRoomOptions {
    // Determine encryption based on visibility
    const shouldEncrypt = entity.visibility === 'private';

    this.logger.log(
      `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${entity.slug} has visibility ${entity.visibility}, encryption: ${shouldEncrypt}`,
    );

    return {
      room_alias_name: localpart,
      name: `${entity.name} Chat`,
      topic: `Chat room for ${entity.name}`,
      isPublic: !shouldEncrypt, // Private entities get private rooms
      encrypted: shouldEncrypt, // Private entities get encrypted rooms
    };
  }

  /**
   * Generate room configuration options for direct messages
   * @param config DM configuration with user details
   * @returns Room creation options for DM
   */
  generateDirectMessageOptions(config: DirectMessageConfig): CreateRoomOptions {
    this.logger.log(
      `Creating DM room between ${config.user1Handle} and ${config.user2Handle}`,
    );

    return {
      room_alias_name: undefined, // DMs don't need aliases
      name: `${config.user1Handle} and ${config.user2Handle}`,
      topic: `Direct message between ${config.user1Handle} and ${config.user2Handle}`,
      isDirect: true,
      isPublic: false, // DMs are always private
      encrypted: true, // Enable encryption for privacy
      inviteUserIds: [config.user1MatrixId, config.user2MatrixId],
    };
  }

  /**
   * Extract room alias localpart from full alias
   * @param roomAlias Full room alias (e.g., "#group-slug-tenant:matrix.domain.com")
   * @returns Localpart (e.g., "group-slug-tenant")
   */
  extractLocalpart(roomAlias: string): string {
    return roomAlias.substring(1).split(':')[0]; // Remove # and get part before :
  }

  /**
   * Log room creation success
   * @param roomId The created room ID
   * @param roomAlias The room alias
   * @param entityType The type of entity (group/event/dm)
   */
  logRoomCreationSuccess(
    roomId: string,
    roomAlias: string,
    entityType: 'group' | 'event' | 'dm' = 'group',
  ): void {
    this.logger.log(
      `Matrix ${entityType} room created successfully: ${roomId} with alias ${roomAlias}`,
    );
  }

  /**
   * Create room for a group or event entity with proper configuration
   * @param entity The group or event entity
   * @param localpart The room alias localpart
   * @param tenantId The tenant ID
   * @param entityType Whether this is for a 'group' or 'event'
   * @returns Room creation result
   */
  async createEntityRoom(
    entity: RoomEntity,
    localpart: string,
    tenantId: string,
    entityType: 'group' | 'event' = 'group',
  ): Promise<RoomInfo> {
    const roomOptions = this.generateRoomOptions(entity, localpart, entityType);
    const result = await this.createRoom(roomOptions, tenantId);

    const serverName =
      this.configService.get<MatrixConfig>('matrix', { infer: true })
        ?.serverName || 'matrix.openmeet.net';
    const roomAlias = `#${localpart}:${serverName}`;

    this.logRoomCreationSuccess(result.roomId, roomAlias, entityType);
    return result;
  }

  /**
   * Create direct message room with proper configuration
   * @param config DM configuration
   * @param tenantId The tenant ID
   * @returns Room creation result
   */
  async createDirectMessageRoom(
    config: DirectMessageConfig,
    tenantId: string,
  ): Promise<RoomInfo> {
    const roomOptions = this.generateDirectMessageOptions(config);
    const result = await this.createRoom(roomOptions, tenantId);

    // DMs use a different alias format or no alias
    this.logRoomCreationSuccess(result.roomId, 'DM Room', 'dm');
    return result;
  }

  /**
   * Create a Matrix client using bot user credentials for a specific tenant
   * Uses MatrixBotService which supports both Application Service and OIDC authentication
   */
  private async createBotClient(
    tenantId: string,
  ): Promise<IMatrixClient | null> {
    try {
      this.logger.log(
        `Creating bot client for tenant ${tenantId} using MatrixBotService`,
      );

      // Authenticate the bot using MatrixBotService (handles both appservice and OIDC)
      await this.matrixBotService.authenticateBot(tenantId);

      if (!this.matrixBotService.isBotAuthenticated()) {
        this.logger.error(`Bot authentication failed for tenant ${tenantId}`);
        return null;
      }

      // Get the authenticated bot client
      // Note: MatrixBotService doesn't expose the client directly, so we need to access it via reflection
      // This is a temporary solution until we refactor the interface
      const botClient = (this.matrixBotService as any).botClient;

      if (!botClient) {
        this.logger.error(
          `Bot client not available after authentication for tenant ${tenantId}`,
        );
        return null;
      }

      this.logger.log(`Successfully created bot client for tenant ${tenantId}`);

      return botClient;
    } catch (error) {
      this.logger.error(
        `Failed to create bot client for tenant ${tenantId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get the admin client for Matrix operations that require admin privileges
   * @returns The Matrix admin client
   */
  getAdminClient(): IMatrixClient {
    return this.matrixCoreService.getAdminClient();
  }

  /**
   * Leave a room as a specific user
   */
  async leaveRoom(
    roomId: string,
    userId: string,
    accessToken: string,
  ): Promise<boolean> {
    try {
      const config = this.matrixCoreService.getConfig();
      // We don't need to create a Matrix client since we're using axios directly

      try {
        // Create axios request to leave the room using Matrix API directly
        // since the Matrix SDK doesn't expose the leave method in our interface
        const leaveUrl = `${config.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`;
        await axios.post(
          leaveUrl,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        this.logger.debug(`User ${userId} successfully left room ${roomId}`);
        return true;
      } catch (leaveError) {
        // If error indicates not in room, that's fine
        if (
          leaveError.message &&
          (leaveError.message.includes('not in room') ||
            leaveError.message.includes('not a member'))
        ) {
          this.logger.debug(
            `User ${userId} is not in room ${roomId}, nothing to leave`,
          );
          return true;
        }
        throw leaveError;
      }
    } catch (error) {
      this.logger.warn(
        `Error leaving room ${roomId} for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Delete a Matrix room using admin API
   */
  async deleteRoom(roomId: string): Promise<boolean> {
    const client = await this.matrixCoreService.acquireClient();

    try {
      const config = this.matrixCoreService.getConfig();
      const baseUrl = config.baseUrl;
      const accessToken = client.client.getAccessToken();
      const adminUserId = config.adminUserId;

      // First get all room members
      const roomMembers = await this.getRoomMembers(roomId, client);

      // Kick all non-admin users from the room
      for (const memberId of roomMembers) {
        // Skip admin user - we'll have them leave last
        if (memberId === adminUserId) {
          continue;
        }

        try {
          // Use admin powers to kick the user
          await client.client.kick(roomId, memberId, 'Room being deleted');
          this.logger.debug(
            `Kicked user ${memberId} from room ${roomId} before deletion`,
          );
        } catch (kickError) {
          this.logger.warn(
            `Could not kick user ${memberId} from room ${roomId}: ${kickError.message}`,
          );
        }
      }

      // Now have admin leave the room to avoid client errors
      if (adminUserId) {
        await this.leaveRoom(roomId, adminUserId, accessToken);
      }

      // Try modern admin API first (Synapse 1.59+)
      try {
        const modernUrl = `${baseUrl}/_synapse/admin/v2/rooms/${encodeURIComponent(roomId)}/delete`;
        await axios.post(
          modernUrl,
          {
            block: true,
            purge: true,
            force_purge: true,
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        this.logger.log(
          `Successfully deleted Matrix room ${roomId} using modern admin API (v2)`,
        );
        return true;
      } catch (modernApiError) {
        // Check if the error is 404 (room not found)
        if (
          modernApiError.response &&
          modernApiError.response.status === HttpStatus.NOT_FOUND
        ) {
          this.logger.warn(
            `Room ${roomId} not found on Matrix server - considering it deleted`,
          );
          return true;
        }

        this.logger.warn(
          `Modern Matrix admin deletion API failed: ${modernApiError.message}, trying legacy API`,
        );

        // Try legacy admin API (pre-1.59)
        try {
          const legacyUrl = `${baseUrl}/_synapse/admin/v1/rooms/${encodeURIComponent(roomId)}/delete`;
          await axios.post(
            legacyUrl,
            {
              block: true,
              purge: true,
            },
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          this.logger.log(
            `Successfully deleted Matrix room ${roomId} using legacy admin API (v1)`,
          );
          return true;
        } catch (legacyApiError) {
          // Check if the error is 404 (room not found)
          if (
            legacyApiError.response &&
            legacyApiError.response.status === HttpStatus.NOT_FOUND
          ) {
            this.logger.warn(
              `Room ${roomId} not found on Matrix server - considering it deleted`,
            );
            return true;
          }

          this.logger.error(
            `All Matrix admin room deletion methods failed: ${legacyApiError.message}`,
          );
          throw legacyApiError;
        }
      }
    } catch (error) {
      this.logger.error(
        `Error deleting Matrix room ${roomId}: ${error.message}`,
        error.stack,
      );
      return false;
    } finally {
      await this.matrixCoreService.releaseClient(client);
    }
  }

  /**
   * Create a new Matrix room
   */
  async createRoom(
    options: CreateRoomOptions,
    tenantId?: string,
  ): Promise<RoomInfo> {
    const {
      name,
      topic,
      isPublic = false,
      isDirect = false,
      encrypted = false,
      inviteUserIds = [],
      powerLevelContentOverride,
      room_alias_name,
    } = options;

    let matrixClient: IMatrixClient | null = null;

    try {
      // Admin client is deprecated - use bot authentication only
      if (!tenantId) {
        throw new Error(
          'Cannot create room: tenant ID is required for bot authentication',
        );
      }

      this.logger.log(
        `Creating room using bot authentication for tenant ${tenantId}`,
      );
      matrixClient = await this.createBotClient(tenantId);

      if (!matrixClient) {
        throw new Error(
          `Failed to authenticate bot user for tenant ${tenantId}`,
        );
      }

      const matrixSdk = this.matrixCoreService.getSdk();
      const config = this.matrixCoreService.getConfig();

      // Build initial state for the room
      // Define the type explicitly to allow for different content structures
      const initialState: Array<{
        type: string;
        state_key: string;
        content: Record<string, any>;
      }> = [
        {
          type: 'm.room.guest_access',
          state_key: '',
          content: {
            guest_access: 'forbidden',
          },
        },
        {
          type: 'm.room.history_visibility',
          state_key: '',
          content: {
            history_visibility: 'shared',
          },
        },
        {
          type: 'm.room.join_rules',
          state_key: '',
          content: {
            join_rule: isPublic ? 'public' : 'invite',
          },
        },
      ];

      // Add encryption state event if room should be encrypted
      if (encrypted) {
        this.logger.log(`Creating encrypted room: ${name}`);
        initialState.push({
          type: 'm.room.encryption',
          state_key: '',
          content: {
            algorithm: 'm.megolm.v1.aes-sha2',
            rotation_period_ms: 604800000, // 1 week
            rotation_period_msgs: 100,
          },
        });
      }

      // First try the SDK method
      if (typeof matrixClient.createRoom === 'function') {
        this.logger.debug('Using Matrix SDK createRoom method');

        const createRoomResponse = await matrixClient.createRoom({
          name,
          topic,
          visibility: isPublic
            ? matrixSdk.Visibility.Public
            : matrixSdk.Visibility.Private,
          preset: isPublic
            ? matrixSdk.Preset.PublicChat
            : matrixSdk.Preset.PrivateChat,
          is_direct: isDirect,
          invite: inviteUserIds,
          initial_state: initialState,
          room_alias_name: room_alias_name, // Add room alias name
        });

        // Get room details
        const roomId = createRoomResponse.room_id;

        // Always ensure tenant-specific bot has admin privileges
        const tenantConfig = getTenantConfig(tenantId);
        const botUser = tenantConfig?.matrixConfig?.botUser;
        const serverName = tenantConfig?.matrixConfig?.serverName;

        if (botUser?.slug && serverName) {
          const tenantBotUserId = `@${botUser.slug}:${serverName}`;

          // Build power levels with tenant bot admin privileges
          const botPowerLevels: Record<string, number> = {
            [tenantBotUserId]: 100, // Tenant bot gets admin privileges
          };

          // Merge with any custom power levels
          if (powerLevelContentOverride && powerLevelContentOverride.users) {
            Object.assign(botPowerLevels, powerLevelContentOverride.users);
          }

          this.logger.log(
            `Setting power levels for newly created room ${roomId}, including tenant bot ${tenantBotUserId} with admin privileges`,
          );

          await this.setRoomPowerLevels(roomId, botPowerLevels, tenantId);
        } else {
          this.logger.warn(
            `Could not determine tenant bot configuration for tenant ${tenantId}, skipping power level setup`,
          );
        }

        return {
          roomId,
          name,
          topic,
          invitedMembers: inviteUserIds,
        };
      }

      // Fallback to direct API call if SDK method is unavailable
      this.logger.debug('Using direct API call fallback for room creation');

      // Use the Matrix client API directly
      const apiUrl = `${config.baseUrl}/_matrix/client/v3/createRoom`;
      const accessToken = matrixClient.getAccessToken?.();

      const roomPayload = {
        name,
        topic,
        visibility: isPublic ? 'public' : 'private',
        preset: isPublic ? 'public_chat' : 'private_chat',
        is_direct: isDirect,
        invite: inviteUserIds,
        initial_state: initialState,
        room_alias_name: room_alias_name, // Add room alias name
      };

      // Try with Bearer token auth
      const response = await axios.post(apiUrl, roomPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const roomId = response.data.room_id;

      // Set power levels if needed
      if (powerLevelContentOverride && powerLevelContentOverride.users) {
        await this.setRoomPowerLevels(
          roomId,
          powerLevelContentOverride.users,
          tenantId,
        );
      }

      return {
        roomId,
        name,
        topic,
        invitedMembers: inviteUserIds,
      };
    } catch (error) {
      this.logger.error(
        `Error creating Matrix room: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create Matrix room: ${error.message}`);
    } finally {
      // Bot clients are not pooled, so no cleanup needed
      // The authenticated client will be garbage collected
      if (matrixClient) {
        this.logger.debug(
          'Room creation completed, bot client will be disposed',
        );
      }
    }
  }

  /**
   * Ensure the admin user is a member of the room
   * Using Matrix SDK consistently with focused error handling
   * @private
   */
  private async ensureAdminInRoom(roomId: string, client: any): Promise<void> {
    try {
      const adminUserId = this.matrixCoreService.getConfig().adminUserId;
      this.logger.debug(
        `Ensuring admin user ${adminUserId} is in room ${roomId}`,
      );

      // Extract the server name from the room ID
      // Room IDs are in the format !roomid:server.name
      const serverName = roomId.split(':')[1];

      this.logger.debug(
        `Admin user ${adminUserId} joining room ${roomId} via server: ${serverName || 'none'}`,
      );

      try {
        // Try to join the room using Matrix SDK - using client passed in from caller
        // Some SDK versions support passing server_name directly for better joining
        if (
          serverName &&
          typeof client.client.joinRoom === 'function' &&
          client.client.joinRoom.length >= 2
        ) {
          try {
            await client.client.joinRoom(roomId);
            this.logger.debug(
              `Admin user joined room ${roomId} using standard SDK join`,
            );
          } catch (joinError) {
            // Check error details
            this.handleJoinError(
              joinError,
              roomId,
              adminUserId || '@unknown:deprecated.net',
              'admin',
            );
          }
        } else {
          // Standard join without server_name parameter
          try {
            await client.client.joinRoom(roomId);
            this.logger.debug(
              `Admin user joined room ${roomId} using standard join`,
            );
          } catch (joinError) {
            // Check error details
            this.handleJoinError(
              joinError,
              roomId,
              adminUserId || '@unknown:deprecated.net',
              'admin',
            );
          }
        }
      } catch (error) {
        // Make sure we preserve specific error messages
        let errorMessage = `Admin user could not join room: ${error.message}`;

        // Check if it's one of our specific error cases
        if (error.message && error.message.includes('Room not found (404)')) {
          errorMessage = error.message;
        } else if (
          error.message &&
          error.message.includes('Rate limit exceeded (429)')
        ) {
          errorMessage = error.message;
        }

        // Log with detailed error information
        this.logger.error(
          `Failed to ensure admin is in room ${roomId}: ${error.message}`,
          {
            status: error.response?.status || error.httpStatus,
            data: error.data || error.response?.data || null,
            body: error.body || error.response?.body || null,
            stack: error.stack,
          },
        );

        throw new Error(errorMessage);
      }
    } catch (error) {
      // Make sure we preserve specific error messages for better error reporting
      let errorMessage = `Admin user could not join room: ${error.message}`;

      // Check if it's one of our specific error cases
      if (error.message && error.message.includes('Room not found (404)')) {
        errorMessage = error.message;
      } else if (
        error.message &&
        error.message.includes('Rate limit exceeded (429)')
      ) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Helper method to handle common join error scenarios across methods
   * @private
   */
  private handleJoinError(
    error: any,
    roomId: string,
    userId: string,
    userType: 'admin' | 'user',
  ): void {
    // Check if already in room - this is success
    if (
      error.message &&
      (error.message.includes('already in the room') ||
        error.message.includes('already a member') ||
        error.message.includes('already joined'))
    ) {
      this.logger.debug(
        `${userType} user ${userId} is already in room ${roomId}`,
      );
      return;
    }

    // For 404 errors, the room doesn't exist
    if (
      error.httpStatus === 404 ||
      (error.data && error.data.errcode === 'M_NOT_FOUND') ||
      (error.response && error.response.status === 404) ||
      (error.message && error.message.includes('404')) ||
      (error.message && error.message.includes('not found'))
    ) {
      const errorDetails = {
        message: error.message,
        status: error.httpStatus || error.response?.status,
        data: error.data || error.response?.data || null,
        errorCode: error.errcode || error.data?.errcode || null,
      };
      this.logger.error(
        `Room ${roomId} not found (404) - it may have been deleted`,
        errorDetails,
      );
      throw new Error(`Room not found (404): ${roomId}`);
    }

    // For 429 errors (rate limiting), give a clear error
    if (
      error.httpStatus === 429 ||
      (error.data && error.data.errcode === 'M_LIMIT_EXCEEDED') ||
      (error.response && error.response.status === 429) ||
      (error.message && error.message.includes('429')) ||
      (error.message && error.message.includes('limit exceeded'))
    ) {
      const errorDetails = {
        message: error.message,
        status: error.httpStatus || error.response?.status,
        data: error.data || error.response?.data || null,
        errorCode: error.errcode || error.data?.errcode || null,
        retryAfter:
          error.data?.retry_after_ms ||
          error.response?.headers?.['retry-after'],
      };
      this.logger.error(
        `Rate limit (429) hit when ${userType} trying to join room ${roomId}`,
        errorDetails,
      );
      throw new Error(`Rate limit exceeded (429) when joining room: ${roomId}`);
    }

    // Log the detailed error for debugging
    this.logger.error(
      `Error ${userType} joining room ${roomId}: ${error.message}`,
      {
        message: error.message,
        status: error.httpStatus || error.response?.status,
        data: error.data || error.response?.data || null,
        errorCode: error.errcode || error.data?.errcode || null,
        stack: error.stack,
      },
    );

    // Re-throw the error to be handled by the caller
    throw error;
  }

  /**
   * Get all members of a room
   * @private
   */
  private async getRoomMembers(roomId: string, client: any): Promise<string[]> {
    try {
      // Try to get room members
      const response = await client.client.getJoinedRoomMembers(roomId);
      if (response && response.joined) {
        return Object.keys(response.joined);
      }

      return [];
    } catch (error) {
      this.logger.debug(
        `Could not get members for room ${roomId}: ${error.message}`,
      );
      return []; // Return empty array if we can't check
    }
  }

  /**
   * Check if a user is already in a room
   * @private
   */
  private async isUserInRoom(
    roomId: string,
    userId: string,
    client: any,
  ): Promise<boolean> {
    try {
      // Try to get room members
      const response = await client.client.getJoinedRoomMembers(roomId);
      if (response && response.joined) {
        return userId in response.joined;
      }

      return false;
    } catch (error) {
      this.logger.debug(
        `Could not check if user ${userId} is in room ${roomId}: ${error.message}`,
      );
      return false; // Assume not in room if we can't check
    }
  }

  /**
   * Invite a user to a room
   */
  async inviteUser(
    roomId: string,
    userId: string,
  ): Promise<Record<string, never>> {
    try {
      // Parse room alias to get tenant ID
      const roomInfo = this.roomAliasUtils.parseRoomAlias(roomId);
      if (!roomInfo) {
        throw new Error(`Invalid room alias format: ${roomId}`);
      }

      // Use MatrixBotService instead of disabled admin client
      await this.matrixBotService.inviteUser(roomId, userId, roomInfo.tenantId);

      this.logger.log(
        `Successfully invited user ${userId} to room ${roomId} using bot service`,
      );
      return {};
    } catch (error) {
      // Handle different types of errors with appropriate severity

      // Already in room - not an error
      if (error.message && error.message.includes('already in the room')) {
        this.logger.debug(
          `User ${userId} is already in room ${roomId}, skipping invite`,
        );
        return {}; // Don't throw - expected case
      }
      // Rate limiting - warning but not error
      else if (
        error.statusCode === 429 ||
        (error.message && error.message.includes('Too Many Requests')) ||
        (error.errcode && error.errcode === 'M_LIMIT_EXCEEDED')
      ) {
        this.logger.warn(
          `Rate limited while inviting user ${userId} to room ${roomId}: ${error.message}`,
        );
        // Don't throw - this is recoverable
        return {};
      }
      // Actual errors
      else {
        this.logger.error(
          `Error inviting user ${userId} to room ${roomId}: ${error.message}`,
          error.stack,
        );
        throw new Error(
          `Failed to invite user to Matrix room: ${error.message}`,
        );
      }
    }
  }

  /**
   * Remove a user from a room
   */
  async removeUserFromRoom(
    roomId: string,
    userId: string,
  ): Promise<Record<string, never>> {
    try {
      // Parse room alias to get tenant ID
      const roomInfo = this.roomAliasUtils.parseRoomAlias(roomId);
      if (!roomInfo) {
        throw new Error(`Invalid room alias format: ${roomId}`);
      }

      // Use MatrixBotService instead of disabled admin client
      await this.matrixBotService.removeUser(roomId, userId, roomInfo.tenantId);

      this.logger.log(
        `Successfully removed user ${userId} from room ${roomId} using bot service`,
      );
      return {};
    } catch (error) {
      this.logger.error(
        `Error removing user ${userId} from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to remove user from Matrix room: ${error.message}`,
      );
    }
  }

  /**
   * Join a room as a specific user
   * With improved error handling for 404 and 429 errors, using SDK methods
   */
  async joinRoom(
    roomId: string,
    userId: string,
    accessToken: string,
    deviceId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(`User ${userId} joining room ${roomId}`);
      const config = this.matrixCoreService.getConfig();
      const sdk = this.matrixCoreService.getSdk();

      // Extract the server name from the room ID
      // Room IDs are in the format !roomid:server.name
      const serverName = roomId.split(':')[1];

      // Create a temporary client for the user
      const tempClient = sdk.createClient({
        baseUrl: config.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || config.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      try {
        this.logger.debug(
          `User ${userId} joining room ${roomId} via server: ${serverName || 'none'}`,
        );

        // When using joinRoom, we can pass server names directly if available
        if (serverName) {
          // For now, just try the basic join without options
          // Your SDK version might not support the options parameter
          try {
            await tempClient.joinRoom(roomId);
            this.logger.debug(
              `User ${userId} joined room ${roomId} using standard SDK join`,
            );
            return;
          } catch (joinError) {
            // Check if already in room - this is success
            if (
              joinError.message &&
              (joinError.message.includes('already in the room') ||
                joinError.message.includes('already a member') ||
                joinError.message.includes('already joined'))
            ) {
              this.logger.debug(
                `User ${userId} is already a member of room ${roomId}`,
              );
              return;
            }

            // For 404 errors, provide clearer information
            if (
              joinError.httpStatus === 404 ||
              (joinError.data && joinError.data.errcode === 'M_NOT_FOUND') ||
              (joinError.message && joinError.message.includes('404')) ||
              (joinError.message && joinError.message.includes('not found'))
            ) {
              this.logger.error(
                `Room ${roomId} not found (404) - it may have been deleted`,
                {
                  error: joinError.message,
                  data: joinError.data || null,
                  errorCode:
                    joinError.errcode || joinError.data?.errcode || null,
                },
              );
              throw new Error(`Room not found (404): ${roomId}`);
            }

            // For 429 errors (rate limiting), give a clear error
            if (
              joinError.httpStatus === 429 ||
              (joinError.data &&
                joinError.data.errcode === 'M_LIMIT_EXCEEDED') ||
              (joinError.message && joinError.message.includes('429')) ||
              (joinError.message &&
                joinError.message.includes('limit exceeded'))
            ) {
              this.logger.error(
                `Rate limit (429) hit when trying to join room ${roomId}`,
                {
                  error: joinError.message,
                  data: joinError.data || null,
                  errorCode:
                    joinError.errcode || joinError.data?.errcode || null,
                  retryAfter: joinError.data?.retry_after_ms,
                },
              );
              throw new Error(
                `Rate limit exceeded (429) when joining room: ${roomId}`,
              );
            }

            // Log the detailed error for debugging
            this.logger.error(
              `Error joining room ${roomId} as user ${userId}`,
              {
                error: joinError.message,
                data: joinError.data || null,
                stack: joinError.stack,
                errorCode: joinError.errcode || joinError.data?.errcode || null,
              },
            );

            throw joinError;
          }
        } else {
          // No server name available, try standard join
          try {
            await tempClient.joinRoom(roomId);
            this.logger.debug(
              `User ${userId} joined room ${roomId} using standard SDK join`,
            );
            return;
          } catch (standardJoinError) {
            // Check if already in room - this is success
            if (
              standardJoinError.message &&
              (standardJoinError.message.includes('already in the room') ||
                standardJoinError.message.includes('already a member') ||
                standardJoinError.message.includes('already joined'))
            ) {
              this.logger.debug(
                `User ${userId} is already a member of room ${roomId}`,
              );
              return;
            }

            // For 404 errors, provide clearer information
            if (
              standardJoinError.httpStatus === 404 ||
              (standardJoinError.data &&
                standardJoinError.data.errcode === 'M_NOT_FOUND') ||
              (standardJoinError.message &&
                standardJoinError.message.includes('404')) ||
              (standardJoinError.message &&
                standardJoinError.message.includes('not found'))
            ) {
              this.logger.error(
                `Room ${roomId} not found (404) - it may have been deleted`,
                {
                  error: standardJoinError.message,
                  data: standardJoinError.data || null,
                  errorCode:
                    standardJoinError.errcode ||
                    standardJoinError.data?.errcode ||
                    null,
                },
              );
              throw new Error(`Room not found (404): ${roomId}`);
            }

            // For 429 errors (rate limiting), give a clear error
            if (
              standardJoinError.httpStatus === 429 ||
              (standardJoinError.data &&
                standardJoinError.data.errcode === 'M_LIMIT_EXCEEDED') ||
              (standardJoinError.message &&
                standardJoinError.message.includes('429')) ||
              (standardJoinError.message &&
                standardJoinError.message.includes('limit exceeded'))
            ) {
              this.logger.error(
                `Rate limit (429) hit when trying to join room ${roomId}`,
                {
                  error: standardJoinError.message,
                  data: standardJoinError.data || null,
                  errorCode:
                    standardJoinError.errcode ||
                    standardJoinError.data?.errcode ||
                    null,
                  retryAfter: standardJoinError.data?.retry_after_ms,
                },
              );
              throw new Error(
                `Rate limit exceeded (429) when joining room: ${roomId}`,
              );
            }

            // Log the detailed error for debugging
            this.logger.error(
              `Error joining room ${roomId} as user ${userId}`,
              {
                error: standardJoinError.message,
                data: standardJoinError.data || null,
                stack: standardJoinError.stack,
                errorCode:
                  standardJoinError.errcode ||
                  standardJoinError.data?.errcode ||
                  null,
              },
            );

            throw standardJoinError;
          }
        }
      } catch (error) {
        // Check if this is an "already in room" type of error which is actually success
        if (
          error.message &&
          (error.message.includes('already in the room') ||
            error.message.includes('already a member') ||
            error.message.includes('already joined'))
        ) {
          this.logger.debug(
            `User ${userId} is already a member of room ${roomId}`,
          );
          return; // This is actually not an error for our purposes
        }

        // Preserve specific error types
        if (error.message && error.message.includes('Room not found (404)')) {
          throw error; // Already formatted nicely
        }

        if (
          error.message &&
          error.message.includes('Rate limit exceeded (429)')
        ) {
          throw error; // Already formatted nicely
        }

        // Re-throw with better logging
        this.logger.error(
          `Failed to join room ${roomId} as user ${userId}: ${error.message}`,
          {
            error: error.message,
            data: error.data || null,
            stack: error.stack,
            errorCode: error.errcode || error.data?.errcode || null,
          },
        );

        throw error;
      }
    } catch (error) {
      // Make sure we preserve specific error messages
      let errorMessage = `Failed to join Matrix room: ${error.message}`;

      // Check if it's one of our specific error cases to preserve the message
      if (error.message && error.message.includes('Room not found (404)')) {
        errorMessage = error.message;
      } else if (
        error.message &&
        error.message.includes('Rate limit exceeded (429)')
      ) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Set room power levels using bot authentication
   */
  async setRoomPowerLevels(
    roomIdOrAlias: string,
    userPowerLevels: Record<string, number>,
    explicitTenantId?: string,
  ): Promise<Record<string, never>> {
    try {
      this.logger.log(
        `Setting power levels in room ${roomIdOrAlias} for ${Object.keys(userPowerLevels).length} users`,
      );

      // Use explicit tenant ID if provided, otherwise parse from room alias
      let tenantId: string | null = explicitTenantId || null;

      if (!tenantId && roomIdOrAlias.startsWith('#')) {
        const parsed = this.roomAliasUtils.parseRoomAlias(roomIdOrAlias);
        if (parsed) {
          tenantId = parsed.tenantId;
        }
      }

      // If we couldn't parse tenant ID from alias, we need to find it by checking all tenants
      if (!tenantId) {
        const tenants = fetchTenants();
        for (const tenant of tenants) {
          try {
            // Try to get canonical alias for this room in this tenant
            const alias = await this.getRoomCanonicalAlias(
              roomIdOrAlias,
              tenant.id,
            );
            if (alias) {
              tenantId = tenant.id;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!tenantId) {
        throw new Error(`Could not determine tenant for room ${roomIdOrAlias}`);
      }

      // Create bot client for the tenant
      const botClient = await this.createBotClient(tenantId);
      if (!botClient) {
        throw new Error(`Failed to create bot client for tenant ${tenantId}`);
      }

      // Ensure the AppService bot is in the room before attempting to set power levels
      // Since we're using AppService authentication, we operate as the main AppService sender
      const appServiceSender = this.matrixBotService.getBotUserId(tenantId);

      try {
        // Check if bot is already in the room by trying to get its membership state
        try {
          await botClient.getStateEvent(
            roomIdOrAlias,
            'm.room.member',
            appServiceSender,
          );
          this.logger.debug(
            `AppService bot ${appServiceSender} is already in room ${roomIdOrAlias}`,
          );
        } catch {
          // Bot is not in room, try to join
          this.logger.debug(
            `AppService bot ${appServiceSender} not in room ${roomIdOrAlias}, attempting to join`,
          );

          try {
            const joinResult = await botClient.joinRoom(roomIdOrAlias);
            this.logger.log(
              `AppService bot successfully joined room ${roomIdOrAlias}, roomId: ${joinResult?.roomId || roomIdOrAlias}`,
            );
          } catch (joinError) {
            // If regular join fails, try admin join using MatrixBotService
            this.logger.warn(
              `Regular join failed for ${roomIdOrAlias}, attempting admin join: ${joinError.message}`,
            );
            await this.matrixBotService.adminJoinRoom(roomIdOrAlias, tenantId);
            this.logger.log(
              `AppService bot successfully admin-joined room ${roomIdOrAlias}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to ensure bot is in room ${roomIdOrAlias}: ${error.message}`,
          error.stack,
        );
        throw new Error(
          `Bot cannot access room ${roomIdOrAlias} to set power levels: ${error.message}`,
        );
      }

      // Get current power levels or create default structure
      let stateEvent;
      try {
        stateEvent = await botClient.getStateEvent(
          roomIdOrAlias,
          'm.room.power_levels',
          '',
        );
      } catch {
        // If no power levels exist, create default structure
        this.logger.debug(
          `No existing power levels found, creating default structure`,
        );
        stateEvent = {};
      }

      // Update user power levels with proper redaction permissions
      const updatedContent = {
        users_default: 0,
        events_default: 0,
        state_default: 50,
        ban: 50,
        kick: 50,
        redact: 50, // Allow users with power level 50+ to redact messages
        ...stateEvent,
        users: {
          ...(stateEvent?.users || {}),
          ...userPowerLevels,
        },
      };

      this.logger.debug(
        `Updating power levels: ${JSON.stringify(userPowerLevels)}`,
      );

      // Set updated power levels
      await botClient.sendStateEvent(
        roomIdOrAlias,
        'm.room.power_levels',
        updatedContent,
        '',
      );

      this.logger.log(`Successfully set power levels in room ${roomIdOrAlias}`);

      return {};
    } catch (error) {
      this.logger.error(
        `Error setting power levels in room ${roomIdOrAlias}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to set power levels in Matrix room: ${error.message}`,
      );
    }
  }

  /**
   * Verify if a Matrix room exists and is accessible
   * This is the canonical room existence check that should be used throughout the application
   */
  async verifyRoomExists(roomId: string, tenantId: string): Promise<boolean> {
    let client: IMatrixClient | null = null;

    try {
      this.logger.debug(
        `Verifying room exists: ${roomId} for tenant ${tenantId}`,
      );

      // Create a bot client for the tenant to check room existence
      client = await this.createBotClient(tenantId);

      if (!client) {
        this.logger.warn(
          `Could not create bot client for tenant ${tenantId} to verify room ${roomId}`,
        );
        return false;
      }

      // Try to get room state - this will fail if room doesn't exist or bot has no access
      await client.roomState(roomId);
      this.logger.debug(`Room ${roomId} exists and is accessible`);
      return true;
    } catch (error) {
      this.logger.debug(`Room ${roomId} verification failed: ${error.message}`);

      // Check for specific error types that indicate room doesn't exist
      if (
        error.httpStatus === 404 ||
        (error.data && error.data.errcode === 'M_NOT_FOUND') ||
        (error.message && error.message.includes('404')) ||
        (error.message && error.message.includes('not found'))
      ) {
        this.logger.debug(`Room ${roomId} does not exist (404)`);
        return false;
      }

      // Check for forbidden errors (room exists but no access)
      if (
        error.httpStatus === 403 ||
        (error.data && error.data.errcode === 'M_FORBIDDEN')
      ) {
        this.logger.debug(`Room ${roomId} exists but bot has no access (403)`);
        // For our purposes, if bot can't access it, treat as non-existent
        return false;
      }

      // Other errors (network, etc.) - assume room doesn't exist
      this.logger.warn(
        `Room ${roomId} verification failed with error: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Get the rooms for a specific Matrix user using a Matrix client
   */
  async getUserRoomsWithClient(
    matrixClient: IMatrixClient,
  ): Promise<RoomInfo[]> {
    try {
      const userId = matrixClient.getUserId();
      this.logger.debug(
        `Getting rooms for Matrix user ${userId} using client instance`,
      );

      // Fetch joined rooms first
      const joinedRooms = await matrixClient.getJoinedRooms();
      const rooms: RoomInfo[] = [];

      // Process joined rooms
      if (joinedRooms?.joined_rooms?.length > 0) {
        for (const roomId of joinedRooms.joined_rooms) {
          try {
            const roomState = await matrixClient.roomState(roomId);
            const nameEvent = roomState.find(
              (event) => event.type === 'm.room.name',
            );
            const topicEvent = roomState.find(
              (event) => event.type === 'm.room.topic',
            );
            const name = nameEvent?.content?.name || '';
            const topic = topicEvent?.content?.topic || '';

            rooms.push({
              roomId,
              name,
              topic,
              membership: 'join',
            });
          } catch (error) {
            this.logger.warn(
              `Error getting room state for ${roomId}: ${error.message}`,
            );
            // Still add the room with basic info
            rooms.push({
              roomId,
              name: '',
              topic: '',
              membership: 'join',
            });
          }
        }
      }

      // Sort rooms by name
      return rooms.sort((a, b) => {
        const nameA = a.name?.toLowerCase() || a.roomId;
        const nameB = b.name?.toLowerCase() || b.roomId;
        return nameA.localeCompare(nameB);
      });
    } catch (error) {
      this.logger.error(
        `Error getting rooms with client: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get rooms: ${error.message}`);
    }
  }

  /**
   * Sync all events with attendees across all tenants (admin function)
   * Returns detailed results for admin dashboard
   */
  async syncAllEventAttendeesToMatrix(maxEventsPerTenant?: number): Promise<{
    totalTenants: number;
    totalEvents: number;
    totalUsersAdded: number;
    totalErrors: number;
    startTime: Date;
    endTime: Date;
    duration: number;
    tenants: Array<{
      tenantId: string;
      tenantName: string;
      eventsProcessed: number;
      totalUsersAdded: number;
      totalErrors: number;
      events: Array<{
        eventSlug: string;
        eventName: string;
        attendeesFound: number;
        usersAdded: number;
        errors: string[];
        success: boolean;
      }>;
      errors: string[];
      success: boolean;
    }>;
  }> {
    const startTime = new Date();
    this.logger.log('🚀 Starting full Matrix attendee sync for all tenants');

    const tenantResults: Array<{
      tenantId: string;
      tenantName: string;
      eventsProcessed: number;
      totalUsersAdded: number;
      totalErrors: number;
      events: Array<{
        eventSlug: string;
        eventName: string;
        attendeesFound: number;
        usersAdded: number;
        errors: string[];
        success: boolean;
      }>;
      errors: string[];
      success: boolean;
    }> = [];
    let totalEvents = 0;
    let totalUsersAdded = 0;
    let totalErrors = 0;

    try {
      // Get all tenants from configuration
      const tenants = fetchTenants();
      this.logger.log(`📋 Found ${tenants.length} tenants to process`);

      for (const tenant of tenants) {
        const tenantResult = await this.syncTenantEvents(
          tenant.id,
          tenant.name || tenant.id,
          maxEventsPerTenant,
        );
        tenantResults.push(tenantResult);

        totalEvents += tenantResult.eventsProcessed;
        totalUsersAdded += tenantResult.totalUsersAdded;
        totalErrors += tenantResult.totalErrors;
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `✨ Full sync completed: ${tenants.length} tenants, ${totalEvents} events processed, ${totalUsersAdded} users added, ${totalErrors} errors in ${duration}ms`,
      );

      return {
        totalTenants: tenants.length,
        totalEvents,
        totalUsersAdded,
        totalErrors,
        startTime,
        endTime,
        duration,
        tenants: tenantResults,
      };
    } catch (error) {
      this.logger.error(
        `💥 Fatal error during full sync: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Sync all events for a specific tenant
   */
  private async syncTenantEvents(
    tenantId: string,
    tenantName?: string,
    maxEvents?: number,
  ): Promise<{
    tenantId: string;
    tenantName: string;
    eventsProcessed: number;
    totalUsersAdded: number;
    totalErrors: number;
    events: Array<{
      eventSlug: string;
      eventName: string;
      attendeesFound: number;
      usersAdded: number;
      errors: string[];
      success: boolean;
    }>;
    errors: string[];
    success: boolean;
  }> {
    this.logger.log(`📋 Processing tenant: ${tenantId}`);

    const eventResults: Array<{
      eventSlug: string;
      eventName: string;
      attendeesFound: number;
      usersAdded: number;
      errors: string[];
      success: boolean;
    }> = [];
    const tenantErrors: string[] = [];
    let totalUsersAdded = 0;
    let totalErrors = 0;

    try {
      // Get all events with confirmed attendees for this tenant
      const allEvents =
        await this.eventQueryService.findEventsWithConfirmedAttendees(tenantId);

      // Apply limit if specified
      const events =
        maxEvents && maxEvents > 0 ? allEvents.slice(0, maxEvents) : allEvents;

      this.logger.log(
        `📅 Found ${allEvents.length} total events, processing ${events.length} events ${maxEvents ? `(limited to ${maxEvents})` : ''} with attendees in tenant ${tenantId}`,
      );

      for (const event of events) {
        try {
          const result =
            await this.matrixEventListener.syncEventAttendeesToMatrix(
              event.slug,
              tenantId,
            );

          const eventResult = {
            eventSlug: event.slug,
            eventName: event.name || event.slug,
            attendeesFound: result.attendeesFound,
            usersAdded: result.usersAdded,
            errors: result.errors,
            success: result.success,
          };

          eventResults.push(eventResult);
          totalUsersAdded += result.usersAdded;
          totalErrors += result.errors.length;
        } catch (eventError) {
          const errorMsg = `Error processing event ${event.slug}: ${eventError.message}`;
          this.logger.error(errorMsg);
          tenantErrors.push(errorMsg);
          totalErrors++;

          eventResults.push({
            eventSlug: event.slug,
            eventName: event.name || event.slug,
            attendeesFound: 0,
            usersAdded: 0,
            errors: [errorMsg],
            success: false,
          });
        }
      }

      return {
        tenantId,
        tenantName: tenantName || tenantId,
        eventsProcessed: events.length,
        totalUsersAdded,
        totalErrors,
        events: eventResults,
        errors: tenantErrors,
        success: tenantErrors.length === 0,
      };
    } catch (tenantError) {
      const errorMsg = `Error processing tenant ${tenantId}: ${tenantError.message}`;
      this.logger.error(errorMsg);

      return {
        tenantId,
        tenantName: tenantName || tenantId,
        eventsProcessed: 0,
        totalUsersAdded: 0,
        totalErrors: 1,
        events: [],
        errors: [errorMsg],
        success: false,
      };
    }
  }

  /**
   * Resolve a room alias to a room ID
   * @param roomAlias The room alias to resolve (e.g., #room-alias:server.com)
   * @returns The room ID (e.g., !roomId:server.com)
   */
  async resolveRoomAlias(roomAlias: string): Promise<string> {
    this.logger.log(`Resolving room alias: ${roomAlias}`);

    // Extract tenant ID from the room alias to get the right tenant context
    const parsed = this.roomAliasUtils.parseRoomAlias(roomAlias);
    if (!parsed) {
      throw new Error(`Invalid room alias format: ${roomAlias}`);
    }

    try {
      // Use MatrixBotService to resolve the alias since it has the bot client with proper auth
      const resolvedRoom = await this.matrixBotService.resolveRoomAlias(
        roomAlias,
        parsed.tenantId,
      );
      this.logger.log(
        `Resolved alias ${roomAlias} to room ID: ${resolvedRoom}`,
      );
      return resolvedRoom;
    } catch (error) {
      this.logger.error(
        `Failed to resolve room alias ${roomAlias}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get the canonical alias for a Matrix room by room ID
   * @param roomId - The Matrix room ID
   * @param tenantId - Tenant ID for tenant-specific bot client
   * @returns Promise<string | null> - The canonical alias or null if not found
   */
  async getRoomCanonicalAlias(
    roomId: string,
    tenantId: string,
  ): Promise<string | null> {
    try {
      this.logger.debug(
        `Getting canonical alias for room ${roomId} (tenant: ${tenantId})`,
      );

      // Get the tenant-specific Matrix client
      const matrixClient = await this.createBotClient(tenantId);
      if (!matrixClient) {
        throw new Error(`Matrix client not available for tenant ${tenantId}`);
      }

      // Get the canonical alias from room state
      const canonicalAliasState = await matrixClient.getStateEvent(
        roomId,
        'm.room.canonical_alias',
        '',
      );

      const canonicalAlias = canonicalAliasState?.alias;

      this.logger.debug(
        `Found canonical alias for room ${roomId}: ${canonicalAlias || 'none'}`,
      );
      return canonicalAlias || null;
    } catch (error) {
      this.logger.error(
        `Failed to get canonical alias for room ${roomId} (tenant: ${tenantId}): ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Update a user's m.direct account data to include a DM room
   * This helps Matrix clients recognize which rooms are direct messages
   */
  async updateUserDirectAccountData(
    userMatrixId: string,
    otherUserMatrixId: string,
    roomId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Updating m.direct account data for ${userMatrixId} to include DM with ${otherUserMatrixId} (room: ${roomId})`,
      );

      // Create bot client for the tenant to perform admin operations
      const botClient = await this.createBotClient(tenantId);
      if (!botClient) {
        throw new Error(`Failed to create bot client for tenant ${tenantId}`);
      }

      // Get current m.direct account data for the user
      let currentDirectData: Record<string, string[]> = {};
      try {
        const existingData = await botClient.getAccountData('m.direct');
        if (existingData) {
          currentDirectData = existingData;
        }
      } catch {
        // If no existing m.direct data, start with empty object
        this.logger.debug(
          `No existing m.direct data for ${userMatrixId}, starting fresh`,
        );
      }

      // Add the room to the user's direct message list for the other user
      if (!currentDirectData[otherUserMatrixId]) {
        currentDirectData[otherUserMatrixId] = [];
      }

      // Only add if not already present
      if (!currentDirectData[otherUserMatrixId].includes(roomId)) {
        currentDirectData[otherUserMatrixId].push(roomId);
      }

      // Update the account data
      await botClient.setAccountData('m.direct', currentDirectData);

      this.logger.log(
        `Successfully updated m.direct account data for ${userMatrixId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update m.direct account data for ${userMatrixId}: ${error.message}`,
      );
      // Don't throw error - DM room can still work without this metadata
    }
  }

  /**
   * Update both users' m.direct account data for a new DM room
   * This should be called after creating a DM room to ensure clients recognize it as a DM
   */
  async configureDMRoomAccountData(
    user1MatrixId: string,
    user2MatrixId: string,
    roomId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Configuring m.direct account data for DM room ${roomId} between ${user1MatrixId} and ${user2MatrixId}`,
      );

      // Update both users' account data in parallel
      await Promise.all([
        this.updateUserDirectAccountData(
          user1MatrixId,
          user2MatrixId,
          roomId,
          tenantId,
        ),
        this.updateUserDirectAccountData(
          user2MatrixId,
          user1MatrixId,
          roomId,
          tenantId,
        ),
      ]);

      this.logger.log(
        `Successfully configured m.direct account data for DM room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to configure DM room account data: ${error.message}`,
      );
      // Don't throw error - DM room can still work without this metadata
    }
  }

  /**
   * Check if a DM room already exists between two users by querying their m.direct account data
   */
  async findExistingDMRoom(
    user1MatrixId: string,
    user2MatrixId: string,
    tenantId: string,
  ): Promise<string | null> {
    try {
      this.logger.debug(
        `Checking for existing DM room between ${user1MatrixId} and ${user2MatrixId}`,
      );

      // Create bot client for the tenant
      const botClient = await this.createBotClient(tenantId);
      if (!botClient) {
        this.logger.warn(`Failed to create bot client for tenant ${tenantId}`);
        return null;
      }

      // Check user1's m.direct account data for rooms with user2
      try {
        const user1DirectData = await botClient.getAccountData('m.direct');
        if (user1DirectData && user1DirectData[user2MatrixId]) {
          const rooms = user1DirectData[user2MatrixId];
          if (rooms && rooms.length > 0) {
            // Return the first room found (there should typically be only one)
            const roomId = rooms[0];
            this.logger.log(
              `Found existing DM room ${roomId} between ${user1MatrixId} and ${user2MatrixId}`,
            );
            return roomId;
          }
        }
      } catch (error) {
        this.logger.debug(
          `Could not check m.direct data for ${user1MatrixId}: ${error.message}`,
        );
      }

      this.logger.debug(
        `No existing DM room found between ${user1MatrixId} and ${user2MatrixId}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Error checking for existing DM room: ${error.message}`,
      );
      return null;
    }
  }
}
