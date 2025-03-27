import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { CreateRoomOptions, RoomInfo } from '../types/matrix.types';
import { IMatrixClient, IMatrixRoomProvider } from '../types/matrix.interfaces';

@Injectable()
export class MatrixRoomService implements IMatrixRoomProvider {
  private readonly logger = new Logger(MatrixRoomService.name);

  constructor(private readonly matrixCoreService: MatrixCoreService) {}

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

    const client = await this.matrixCoreService.acquireClient();

    try {
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
      await this.matrixCoreService.releaseClient(client);
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
  async inviteUser(roomId: string, userId: string): Promise<void> {
    const client = await this.matrixCoreService.acquireClient();

    try {
      // First ensure admin is in the room
      await this.ensureAdminInRoom(roomId, client);

      // Check if user is already in the room before inviting
      const isAlreadyInRoom = await this.isUserInRoom(roomId, userId, client);
      if (isAlreadyInRoom) {
        this.logger.debug(
          `User ${userId} is already in room ${roomId}, skipping invite`,
        );
        return;
      }

      // Then invite the user
      await client.client.invite(roomId, userId);
    } catch (error) {
      // Handle different types of errors with appropriate severity

      // Already in room - not an error
      if (error.message && error.message.includes('already in the room')) {
        this.logger.debug(
          `User ${userId} is already in room ${roomId}, skipping invite`,
        );
        return; // Don't throw - expected case
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
        return;
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
      await this.matrixCoreService.releaseClient(client);
    }
  }

  /**
   * Remove a user from a room
   */
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const client = await this.matrixCoreService.acquireClient();

    try {
      // First ensure admin is in the room
      await this.ensureAdminInRoom(roomId, client);

      await client.client.kick(
        roomId,
        userId,
        'Removed from event/group in OpenMeet',
      );
    } catch (error) {
      this.logger.error(
        `Error removing user ${userId} from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to remove user from Matrix room: ${error.message}`,
      );
    } finally {
      await this.matrixCoreService.releaseClient(client);
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
  ): Promise<void> {
    const client = await this.matrixCoreService.acquireClient();

    try {
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
    } catch (error) {
      this.logger.error(
        `Error setting power levels in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to set power levels in Matrix room: ${error.message}`,
      );
    } finally {
      await this.matrixCoreService.releaseClient(client);
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
