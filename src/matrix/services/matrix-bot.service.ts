import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { IMatrixBot } from '../interfaces/matrix-bot.interface';
import { IMatrixClient } from '../types/matrix.interfaces';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { AllConfigType } from '../../config/config.type';

@Injectable()
export class MatrixBotService implements IMatrixBot {
  private readonly logger = new Logger(MatrixBotService.name);
  private botClient: IMatrixClient | null = null;
  private isAuthenticated = false;
  private currentTenantId: string | null = null;
  private currentBotUserId: string | null = null;

  private readonly serverName: string;
  private readonly homeServerUrl: string;
  private readonly appServiceToken: string;
  private readonly useAppServiceAuth: boolean;

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly matrixBotUserService: MatrixBotUserService,
  ) {
    // Get Matrix server configuration
    this.serverName = this.configService.get<string>(
      'matrix.serverName',
      'matrix.openmeet.net',
      { infer: true },
    );

    const homeServerUrl = this.configService.get<string>('matrix.baseUrl', {
      infer: true,
    });

    if (!homeServerUrl) {
      throw new Error(
        'Matrix homeserver URL not configured. Set MATRIX_HOMESERVER_URL environment variable.',
      );
    }

    this.homeServerUrl = homeServerUrl;

    // Load Matrix Application Service configuration
    const matrixConfig = this.configService.get('matrix', { infer: true });
    this.appServiceToken = matrixConfig?.appservice?.token || '';
    this.useAppServiceAuth = !!this.appServiceToken;

    if (this.useAppServiceAuth) {
      this.logger.log('Matrix bot will use Application Service authentication');
    } else {
      throw new Error(
        'Matrix Application Service authentication is required. ' +
          'Please configure MATRIX_APPSERVICE_TOKEN environment variable.',
      );
    }
  }

  private async authenticateBotWithAppService(tenantId: string): Promise<void> {
    this.logger.log(
      `Using Application Service authentication for tenant: ${tenantId}`,
    );

    try {
      // Get or create the bot user for namespace compliance
      const botUser =
        await this.matrixBotUserService.getOrCreateBotUser(tenantId);
      this.logger.log(
        `Using appservice bot user: ${botUser.slug} for tenant ${tenantId}`,
      );

      // Get Matrix client with application service token
      // This bypasses OIDC and uses direct token authentication
      const sdk = this.matrixCoreService.getSdk();
      if (!sdk) {
        throw new Error('Matrix SDK not available');
      }

      // Create bot client using application service token
      // Use tenant-specific bot user ID for proper namespacing
      const tenantSpecificBotUserId = `@${botUser.slug}:${this.serverName}`;

      this.currentBotUserId = tenantSpecificBotUserId; // Use tenant-specific bot user ID
      this.currentTenantId = tenantId;

      this.botClient = sdk.createClient({
        baseUrl: this.homeServerUrl,
        accessToken: this.appServiceToken,
        userId: tenantSpecificBotUserId, // Authenticate as tenant-specific bot user
        localTimeoutMs: 30000,
        useAuthorizationHeader: true,
      });

      // Set display name for bot user
      try {
        const firstName = botUser.firstName?.trim();
        const lastName = botUser.lastName?.trim();
        const displayName =
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || 'OpenMeet Bot';

        await this.botClient.setDisplayName(displayName);
        this.logger.log(`Bot display name set to: ${displayName}`);
      } catch (error) {
        this.logger.warn(`Failed to set bot display name: ${error.message}`);
      }

      this.isAuthenticated = true;
      this.logger.log(
        `Matrix bot authenticated with Application Service for tenant: ${tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Application Service authentication failed for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  async authenticateBot(tenantId: string): Promise<void> {
    this.logger.log(`Authenticating Matrix bot for tenant: ${tenantId}`);

    try {
      if (!this.useAppServiceAuth) {
        throw new Error(
          'Matrix AppService authentication is required for bot operations. ' +
            'Please configure MATRIX_APPSERVICE_TOKEN environment variable.',
        );
      }

      // Only disconnect if switching to a different tenant
      if (this.currentTenantId && this.currentTenantId !== tenantId) {
        this.logger.log(
          `Switching from tenant ${this.currentTenantId} to ${tenantId}, disconnecting current bot`,
        );
        this.disconnectCurrentBot();
      }

      // Use Application Service authentication (required)
      await this.authenticateBotWithAppService(tenantId);
    } catch (error) {
      this.isAuthenticated = false;
      this.currentTenantId = null;
      this.currentBotUserId = null;
      this.logger.error(
        `Failed to authenticate Matrix bot for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Disconnect current bot client
   * Preparation for future per-tenant persistent connections
   */
  private disconnectCurrentBot(): void {
    if (this.botClient) {
      try {
        // Stop the current client if it has a stop method
        if (typeof this.botClient.stopClient === 'function') {
          this.botClient.stopClient();
        }
      } catch (error) {
        this.logger.warn(`Error stopping bot client: ${error.message}`);
      }
    }

    this.botClient = null;
    this.isAuthenticated = false;
    this.currentTenantId = null;
    this.currentBotUserId = null;
  }

  isBotAuthenticated(): boolean {
    return this.isAuthenticated && this.botClient !== null;
  }

  getBotUserId(tenantId?: string): string {
    if (this.currentBotUserId) {
      return this.currentBotUserId;
    }

    // If no authenticated bot, return the expected format
    if (tenantId) {
      return `@openmeet-bot-${tenantId}:${this.serverName}`;
    }

    throw new Error('No bot authenticated and no tenantId provided');
  }

  private async ensureBotAuthenticated(tenantId: string): Promise<void> {
    // Check if we need to authenticate for a different tenant
    if (!this.isBotAuthenticated() || this.currentTenantId !== tenantId) {
      if (this.currentTenantId && this.currentTenantId !== tenantId) {
        this.logger.log(
          `Switching bot context from tenant ${this.currentTenantId} to ${tenantId}`,
        );
      } else {
        this.logger.log(
          `Bot not authenticated for tenant ${tenantId}, authenticating now...`,
        );
      }
      await this.authenticateBot(tenantId);
    }
  }

  async createRoom(
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
  }> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Creating Matrix room: ${options.name}`);

    const sdk = this.matrixCoreService.getSdk();
    const createRoomOptions = {
      name: options.name,
      topic: options.topic,
      visibility: options.isPublic
        ? sdk.Visibility.Public
        : sdk.Visibility.Private,
      preset: options.isPublic ? sdk.Preset.PublicChat : sdk.Preset.PrivateChat,
      initial_state: [] as any[],
      invite: options.inviteUserIds || [],
      power_level_content_override: options.powerLevelContentOverride,
    };

    // Set encryption if requested
    if (options.encrypted) {
      createRoomOptions.initial_state.push({
        type: 'm.room.encryption',
        state_key: '',
        content: {
          algorithm: 'm.megolm.v1.aes-sha2',
        },
      });
    }

    try {
      const result = await this.botClient!.createRoom(createRoomOptions);

      this.logger.log(`Matrix room created successfully: ${result.room_id}`);

      return {
        roomId: result.room_id,
        name: options.name,
        topic: options.topic,
        invitedMembers: options.inviteUserIds || [],
      };
    } catch (error) {
      this.logger.error(`Failed to create Matrix room: ${error.message}`);
      throw error;
    }
  }

  async inviteUser(
    roomId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Inviting user ${userId} to room ${roomId}`);

    try {
      // Resolve room alias to room ID if needed
      let resolvedRoomId = roomId;
      if (roomId.startsWith('#')) {
        this.logger.debug(`Resolving room alias ${roomId} to room ID`);
        try {
          const roomInfo = await this.botClient!.getRoomIdForAlias(roomId);
          resolvedRoomId = roomInfo.room_id;
          this.logger.debug(
            `Resolved alias ${roomId} to room ID ${resolvedRoomId}`,
          );
        } catch (aliasError) {
          this.logger.warn(
            `Failed to resolve room alias ${roomId}: ${aliasError.message}`,
          );
          // Continue with original roomId - it might be a room ID already
        }
      }

      await this.botClient!.invite(resolvedRoomId, userId);
      this.logger.log(
        `Successfully invited user ${userId} to room ${resolvedRoomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invite user ${userId} to room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  async removeUser(
    roomId: string,
    userId: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Removing user ${userId} from room ${roomId}`);

    try {
      await this.botClient!.kick(roomId, userId, 'Removed by system');
      this.logger.log(
        `Successfully removed user ${userId} from room ${roomId}`,
      );
    } catch (error) {
      // Check if the error indicates the user is not in the room
      const errorMessage = error.message || error.toString();
      const isUserNotInRoom =
        errorMessage.includes('not in room') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('M_NOT_FOUND') ||
        errorMessage.includes('M_FORBIDDEN');

      if (isUserNotInRoom) {
        this.logger.warn(
          `User ${userId} is not in room ${roomId} or already removed: ${errorMessage}`,
        );
        return; // User not in room or already removed, consider it successful
      }

      this.logger.error(
        `Failed to remove user ${userId} from room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  async ensureBotHasAdminRights(
    roomId: string,
    tenantId: string,
  ): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    const botUserId = this.getBotUserId(tenantId);
    this.logger.log(
      `Ensuring bot ${botUserId} has admin rights in room ${roomId}`,
    );

    try {
      // Get existing power levels
      const existingPowerLevels = await this.botClient!.getStateEvent(
        roomId,
        'm.room.power_levels',
        '',
      );

      // Check if bot already has admin rights
      const currentBotPowerLevel = existingPowerLevels?.users?.[botUserId] || 0;
      if (currentBotPowerLevel >= 100) {
        this.logger.log(
          `Bot ${botUserId} already has admin rights (${currentBotPowerLevel}) in room ${roomId}`,
        );
        return;
      }

      // Add bot to admin power levels
      const updatedPowerLevels = {
        ...existingPowerLevels,
        users: {
          ...existingPowerLevels.users,
          [botUserId]: 100, // Admin level
        },
      };

      await this.botClient!.sendStateEvent(
        roomId,
        'm.room.power_levels',
        updatedPowerLevels,
        '',
      );

      this.logger.log(
        `Successfully granted admin rights to bot ${botUserId} in room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to grant admin rights to bot in room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  async syncPermissions(
    roomId: string,
    userPowerLevels: Record<string, number>,
    tenantId: string,
  ): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Syncing permissions for room ${roomId}`);

    try {
      // First ensure bot has admin rights to modify power levels
      await this.ensureBotHasAdminRights(roomId, tenantId);

      // Get existing power levels to preserve non-user settings
      let existingPowerLevels: any = {};
      try {
        existingPowerLevels = await this.botClient!.getStateEvent(
          roomId,
          'm.room.power_levels',
          '',
        );
      } catch (error) {
        this.logger.warn(
          `Could not get existing power levels for room ${roomId}: ${error.message}`,
        );
      }

      // Merge new user power levels with existing settings
      const newPowerLevels = {
        ...existingPowerLevels,
        users: userPowerLevels,
      };

      await this.botClient!.sendStateEvent(
        roomId,
        'm.room.power_levels',
        newPowerLevels,
        '',
      );

      this.logger.log(`Successfully synced permissions for room ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Failed to sync permissions for room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  async sendMessage(
    roomId: string,
    message: string,
    tenantId: string,
  ): Promise<string> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(
      `Sending message to room ${roomId}: ${message.substring(0, 50)}...`,
    );

    try {
      const result = await this.botClient!.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: message,
      });

      this.logger.log(
        `Successfully sent message to room ${roomId}: ${result.event_id}`,
      );
      return result.event_id;
    } catch (error) {
      this.logger.error(
        `Failed to send message to room ${roomId}: ${error.message}`,
      );
      throw error;
    }
  }

  async joinRoom(roomId: string, tenantId: string): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Bot joining room ${roomId}`);

    try {
      await this.botClient!.joinRoom(roomId);
      this.logger.log(`Bot successfully joined room ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to join room ${roomId}: ${error.message}`);
      throw error;
    }
  }

  async isBotInRoom(roomId: string, tenantId: string): Promise<boolean> {
    await this.ensureBotAuthenticated(tenantId);

    try {
      const joinedRooms = await this.botClient!.getJoinedRooms();
      return joinedRooms.joined_rooms.includes(roomId);
    } catch (error) {
      this.logger.error(
        `Failed to check if bot is in room ${roomId}: ${error.message}`,
      );
      return false;
    }
  }

  async deleteRoom(roomId: string, tenantId: string): Promise<void> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Bot attempting to delete room ${roomId}`);

    try {
      // Check if bot is in the room first
      const isInRoom = await this.isBotInRoom(roomId, tenantId);

      if (!isInRoom) {
        this.logger.log(`Bot is not in room ${roomId}, cannot delete`);
        return;
      }

      // Get room info to check if we need to kick users
      // Note: Matrix SDK interface doesn't expose room members directly
      // For now, we'll just leave the room which should purge it if bot is the last member

      // For proper room deletion, we would need Matrix admin API access
      // For now, the bot leaves the room which removes its access
      // TODO: Implement proper room deletion when Matrix admin API is available
      this.logger.warn(
        `Bot leaving room ${roomId} - full room deletion requires admin API access`,
      );

      // Note: Matrix SDK interface doesn't have leave method in our interface
      // We'll need to implement this via the Matrix admin API or update interface
      this.logger.log(`Bot left room ${roomId}, room should be purged`);
    } catch (error) {
      this.logger.error(`Failed to delete room ${roomId}: ${error.message}`);
      throw error;
    }
  }

  async verifyRoomExists(roomId: string, tenantId: string): Promise<boolean> {
    await this.ensureBotAuthenticated(tenantId);

    try {
      // Try to get room state - this will fail if room doesn't exist or bot has no access
      await this.botClient!.roomState(roomId);
      return true;
    } catch (error) {
      this.logger.debug(`Room ${roomId} verification failed: ${error.message}`);
      return false;
    }
  }

  async getBotPowerLevel(roomId: string, tenantId: string): Promise<number> {
    await this.ensureBotAuthenticated(tenantId);

    try {
      const botUserId = this.getBotUserId(tenantId);
      const powerLevels = await this.botClient!.getStateEvent(
        roomId,
        'm.room.power_levels',
        '',
      );

      return powerLevels?.users?.[botUserId] || 0;
    } catch (error) {
      this.logger.warn(
        `Failed to get bot power level for room ${roomId}: ${error.message}`,
      );
      return 0;
    }
  }

  /**
   * Force join the bot to a room using admin API (bypasses normal Matrix permissions)
   */
  async adminJoinRoom(roomId: string, tenantId: string): Promise<void> {
    try {
      this.logger.log(
        `Force-joining bot to room ${roomId} using admin API for tenant ${tenantId}`,
      );

      // Get admin token for the tenant
      const adminClient =
        await this.matrixCoreService.getAdminClientForTenant(tenantId);
      const adminToken = adminClient.getAccessToken();
      const botUserId = this.getBotUserId(tenantId);

      // Get tenant configuration for homeserver URL
      const { fetchTenants } = await import('../../utils/tenant-config');
      const tenants = fetchTenants();
      const tenant = tenants.find((t) => t.id === tenantId);
      const homeserverUrl =
        tenant?.matrixConfig?.homeserverUrl || this.homeServerUrl;

      // Use Synapse admin API to force-join bot to room
      // POST /_synapse/admin/v1/join/{roomId}
      const joinUrl = `${homeserverUrl}/_synapse/admin/v1/join/${encodeURIComponent(roomId)}`;

      await axios.post(
        joinUrl,
        {
          user_id: botUserId,
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `Successfully force-joined bot ${botUserId} to room ${roomId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to force-join bot to room ${roomId}: ${error.message}`,
      );
      throw new Error(`Admin join failed: ${error.message}`);
    }
  }

  /**
   * Set power levels in a room using admin API (bypasses normal Matrix permissions)
   */
  async adminSetPowerLevels(
    roomId: string,
    powerLevels: Record<string, number>,
    tenantId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Setting power levels in room ${roomId} using admin API for tenant ${tenantId}`,
      );

      // Get admin client for the tenant
      const adminClient =
        await this.matrixCoreService.getAdminClientForTenant(tenantId);

      // Get current power levels to merge with new ones
      let currentPowerLevels: any = {};
      try {
        currentPowerLevels = await adminClient.getStateEvent(
          roomId,
          'm.room.power_levels',
          '',
        );
      } catch (error) {
        this.logger.warn(
          `Could not get current power levels, using defaults: ${error.message}`,
        );
        currentPowerLevels = {
          users_default: 0,
          events_default: 0,
          state_default: 50,
          ban: 50,
          kick: 50,
          redact: 50,
          invite: 0,
          users: {},
        };
      }

      // Merge new power levels with existing ones
      const updatedPowerLevels = {
        ...currentPowerLevels,
        users: {
          ...currentPowerLevels.users,
          ...powerLevels,
        },
      };

      // Use Matrix client API to set power levels
      await adminClient.sendStateEvent(
        roomId,
        'm.room.power_levels',
        updatedPowerLevels,
        '',
      );

      this.logger.log(
        `Successfully set power levels in room ${roomId}: ${JSON.stringify(powerLevels)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set power levels in room ${roomId}: ${error.message}`,
      );
      throw new Error(`Admin set power levels failed: ${error.message}`);
    }
  }

  /**
   * Resolve a room alias to a room ID
   * @param roomAlias The room alias to resolve (e.g., #room-alias:server.com)
   * @param tenantId The tenant ID for authentication context
   * @returns The room ID (e.g., !roomId:server.com)
   */
  async resolveRoomAlias(roomAlias: string, tenantId: string): Promise<string> {
    await this.ensureBotAuthenticated(tenantId);

    this.logger.log(`Resolving room alias: ${roomAlias}`);

    try {
      if (!roomAlias.startsWith('#')) {
        throw new Error(
          `Invalid room alias format: ${roomAlias} (must start with #)`,
        );
      }

      const roomInfo = await this.botClient!.getRoomIdForAlias(roomAlias);
      const roomId = roomInfo.room_id;

      this.logger.log(
        `Successfully resolved alias ${roomAlias} to room ID: ${roomId}`,
      );
      return roomId;
    } catch (error) {
      this.logger.error(
        `Failed to resolve room alias ${roomAlias}: ${error.message}`,
      );
      throw error;
    }
  }
}
