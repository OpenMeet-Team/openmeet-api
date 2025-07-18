import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { MatrixBotService } from './matrix-bot.service';
import { CreateRoomOptions, RoomInfo } from '../types/matrix.types';
import { IMatrixClient, IMatrixRoomProvider } from '../types/matrix.interfaces';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class MatrixRoomService implements IMatrixRoomProvider {
  private readonly logger = new Logger(MatrixRoomService.name);

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly matrixBotUserService: MatrixBotUserService,
    private readonly matrixBotService: MatrixBotService,
    private readonly configService: ConfigService,
  ) {}

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
      await this.leaveRoom(roomId, adminUserId, accessToken);

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
        });

        // Get room details
        const roomId = createRoomResponse.room_id;

        // Set power levels if needed
        if (powerLevelContentOverride && powerLevelContentOverride.users) {
          await this.setRoomPowerLevels(
            roomId,
            powerLevelContentOverride.users,
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
        await this.setRoomPowerLevels(roomId, powerLevelContentOverride.users);
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
            this.handleJoinError(joinError, roomId, adminUserId, 'admin');
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
            this.handleJoinError(joinError, roomId, adminUserId, 'admin');
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
    let client;

    try {
      client = await this.matrixCoreService.acquireClient();

      // First ensure admin is in the room
      await this.ensureAdminInRoom(roomId, client);

      // Check if user is already in the room before inviting
      const isAlreadyInRoom = await this.isUserInRoom(roomId, userId, client);
      if (isAlreadyInRoom) {
        this.logger.debug(
          `User ${userId} is already in room ${roomId}, skipping invite`,
        );
        return {};
      }

      // Then invite the user
      await client.client.invite(roomId, userId);
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
    } finally {
      if (client) {
        try {
          await this.matrixCoreService.releaseClient(client);
        } catch (releaseError) {
          this.logger.warn(
            `Failed to release Matrix client: ${releaseError.message}`,
          );
          // Don't re-throw as this would mask the original error
        }
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
    let client;

    try {
      client = await this.matrixCoreService.acquireClient();

      // First ensure admin is in the room
      await this.ensureAdminInRoom(roomId, client);

      await client.client.kick(
        roomId,
        userId,
        'Removed from event/group in OpenMeet',
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
    } finally {
      if (client) {
        try {
          await this.matrixCoreService.releaseClient(client);
        } catch (releaseError) {
          this.logger.warn(
            `Failed to release Matrix client: ${releaseError.message}`,
          );
          // Don't re-throw as this would mask the original error
        }
      }
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
   * Set room power levels
   */
  async setRoomPowerLevels(
    roomId: string,
    userPowerLevels: Record<string, number>,
  ): Promise<Record<string, never>> {
    let client;

    try {
      client = await this.matrixCoreService.acquireClient();

      // First ensure admin is in the room
      await this.ensureAdminInRoom(roomId, client);

      // Get current power levels
      const stateEvent = await client.client.getStateEvent(
        roomId,
        'm.room.power_levels',
        '',
      );

      // Update user power levels
      const updatedContent = {
        ...stateEvent,
        users: {
          ...(stateEvent?.users || {}),
          ...userPowerLevels,
        },
      };

      // Set updated power levels
      await client.client.sendStateEvent(
        roomId,
        'm.room.power_levels',
        updatedContent,
        '',
      );
      return {};
    } catch (error) {
      this.logger.error(
        `Error setting power levels in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to set power levels in Matrix room: ${error.message}`,
      );
    } finally {
      if (client) {
        try {
          await this.matrixCoreService.releaseClient(client);
        } catch (releaseError) {
          this.logger.warn(
            `Failed to release Matrix client: ${releaseError.message}`,
          );
          // Don't re-throw as this would mask the original error
        }
      }
    }
  }

  /**
   * Verify if a Matrix room exists and is accessible
   * This is the canonical room existence check that should be used throughout the application
   */
  async verifyRoomExists(roomId: string, tenantId: string): Promise<boolean> {
    let client = null;
    
    try {
      this.logger.debug(`Verifying room exists: ${roomId} for tenant ${tenantId}`);
      
      // Create a bot client for the tenant to check room existence
      client = await this.createBotClient(tenantId);
      
      if (!client) {
        this.logger.warn(`Could not create bot client for tenant ${tenantId} to verify room ${roomId}`);
        return false;
      }

      // Try to get room state - this will fail if room doesn't exist or bot has no access
      await client.roomState(roomId);
      this.logger.debug(`Room ${roomId} exists and is accessible`);
      return true;
      
    } catch (error) {
      this.logger.debug(`Room ${roomId} verification failed: ${error.message}`);
      
      // Check for specific error types that indicate room doesn't exist
      if (error.httpStatus === 404 || 
          (error.data && error.data.errcode === 'M_NOT_FOUND') ||
          (error.message && error.message.includes('404')) ||
          (error.message && error.message.includes('not found'))) {
        this.logger.debug(`Room ${roomId} does not exist (404)`);
        return false;
      }
      
      // Check for forbidden errors (room exists but no access)
      if (error.httpStatus === 403 || 
          (error.data && error.data.errcode === 'M_FORBIDDEN')) {
        this.logger.debug(`Room ${roomId} exists but bot has no access (403)`);
        // For our purposes, if bot can't access it, treat as non-existent
        return false;
      }
      
      // Other errors (network, etc.) - assume room doesn't exist
      this.logger.warn(`Room ${roomId} verification failed with error: ${error.message}`);
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
}
