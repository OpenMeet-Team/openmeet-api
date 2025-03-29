import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { CreateRoomOptions, RoomInfo } from '../types/matrix.types';
import { IMatrixClient, IMatrixRoomProvider } from '../types/matrix.interfaces';
import { HttpStatus } from '@nestjs/common';

@Injectable()
export class MatrixRoomService implements IMatrixRoomProvider {
  private readonly logger = new Logger(MatrixRoomService.name);

  constructor(private readonly matrixCoreService: MatrixCoreService) {}

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
  async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    const {
      name,
      topic,
      isPublic = false,
      isDirect = false,
      encrypted = false,
      inviteUserIds = [],
      powerLevelContentOverride,
    } = options;

    let client;
    
    try {
      client = await this.matrixCoreService.acquireClient();
      const matrixSdk = this.matrixCoreService.getSdk();
      const config = this.matrixCoreService.getConfig();
      const matrixClient = client.client;

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
      const accessToken =
        matrixClient.getAccessToken?.() || client.client.getAccessToken?.();

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
   * Ensure the admin user is a member of the room
   * @private
   */
  private async ensureAdminInRoom(roomId: string, client: any): Promise<void> {
    try {
      const adminUserId = this.matrixCoreService.getConfig().adminUserId;
      this.logger.debug(
        `Ensuring admin user ${adminUserId} is in room ${roomId}`,
      );

      // Try to join the room as admin
      try {
        await client.client.joinRoom(roomId);
        this.logger.debug(
          `Admin user ${adminUserId} successfully joined room ${roomId}`,
        );
      } catch (joinError) {
        // If error indicates already in room, that's fine
        if (
          joinError.message &&
          (joinError.message.includes('already in the room') ||
            joinError.message.includes('already a member') ||
            joinError.message.includes('already joined'))
        ) {
          this.logger.debug(
            `Admin user ${adminUserId} is already in room ${roomId}`,
          );
        } else {
          // For other errors, try to get an invite from someone in the room
          // This is a fallback and might not always work depending on permissions
          this.logger.warn(
            `Admin user failed to join room ${roomId}: ${joinError.message}. Will try alternative methods.`,
          );
          throw joinError;
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure admin is in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Admin user could not join room: ${error.message}`);
    }
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
  async inviteUser(roomId: string, userId: string): Promise<{}> {
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
  async removeUserFromRoom(roomId: string, userId: string): Promise<{}> {
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

      // Create a temporary client for the user
      const tempClient = sdk.createClient({
        baseUrl: config.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || config.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      // Join the room
      try {
        await tempClient.joinRoom(roomId);
        this.logger.debug(`User ${userId} successfully joined room ${roomId}`);
      } catch (joinError) {
        // Check if the error is just that the user is already in the room
        if (
          joinError.message &&
          (joinError.message.includes('already in the room') ||
            joinError.message.includes('already a member') ||
            joinError.message.includes('already joined'))
        ) {
          this.logger.debug(
            `User ${userId} is already a member of room ${roomId}`,
          );
          // This is actually not an error for our purposes
        } else {
          this.logger.error(
            `Error joining room ${roomId} as user ${userId}: ${joinError.message}`,
            joinError.stack,
          );
          throw joinError; // Re-throw the error
        }
      }
    } catch (error) {
      this.logger.error(
        `Error joining room ${roomId} as user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to join Matrix room: ${error.message}`);
    }
  }

  /**
   * Set room power levels
   */
  async setRoomPowerLevels(
    roomId: string,
    userPowerLevels: Record<string, number>,
  ): Promise<{}> {
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
