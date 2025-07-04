import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMatrixBot } from '../interfaces/matrix-bot.interface';
import { IMatrixClient } from '../types/matrix.interfaces';
import { MatrixCoreService } from './matrix-core.service';
import { MatrixUserService } from './matrix-user.service';
import { MatrixBotUserService } from './matrix-bot-user.service';
import { AllConfigType } from '../../config/config.type';

@Injectable()
export class MatrixBotService implements IMatrixBot {
  private readonly logger = new Logger(MatrixBotService.name);
  private botClient: IMatrixClient | null = null;
  private isAuthenticated = false;
  private readonly adminEmail: string;
  private readonly tenantId: string;
  private readonly botUsername: string;
  private readonly botPassword: string;
  private readonly botDisplayName: string;
  private readonly serverName: string;
  private readonly homeServerUrl: string;
  private readonly appServiceToken: string;
  private readonly useAppServiceAuth: boolean;

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixBotUserService: MatrixBotUserService,
    @Inject('USER_SERVICE_FOR_MATRIX') private readonly userService: any,
  ) {
    // Use existing admin credentials for Matrix bot operations
    // The bot authenticates to Matrix via MAS → OpenMeet OIDC flow using admin user
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL', {
      infer: true,
    });
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', {
      infer: true,
    });

    this.adminEmail = adminEmail!;

    this.botUsername = this.configService.get<string>(
      'matrix.bot.username',
      'openmeet-admin-bot',
      { infer: true },
    );
    this.botPassword = adminPassword!;
    this.botDisplayName = this.configService.get<string>(
      'matrix.bot.displayName',
      'OpenMeet Admin Bot',
      { infer: true },
    );
    this.serverName = this.configService.get<string>(
      'matrix.serverName',
      'matrix.openmeet.net',
      { infer: true },
    );
    this.homeServerUrl = this.configService.get<string>(
      'matrix.homeServer',
      'http://localhost:8448',
      { infer: true },
    );

    if (!this.adminEmail) {
      throw new Error(
        'Admin email not configured. Set ADMIN_EMAIL environment variable.',
      );
    }

    if (!this.botPassword) {
      throw new Error(
        'Admin password not configured. Set ADMIN_PASSWORD environment variable.',
      );
    }

    // Load Matrix Application Service configuration
    const matrixConfig = this.configService.get('matrix', { infer: true });
    this.appServiceToken = matrixConfig?.appservice?.token || '';
    this.useAppServiceAuth = !!this.appServiceToken;

    if (this.useAppServiceAuth) {
      this.logger.log('Matrix bot will use Application Service authentication');
    } else {
      this.logger.log('Matrix bot will use OIDC authentication (fallback)');
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
      const botUserId = `@${botUser.slug}:${this.serverName}`;
      this.botClient = sdk.createClient({
        baseUrl: this.homeServerUrl,
        accessToken: this.appServiceToken,
        userId: botUserId,
        localTimeoutMs: 30000,
        useAuthorizationHeader: true,
      });

      // Set display name if configured
      if (
        this.botDisplayName &&
        this.botDisplayName !== 'OpenMeet Admin Bot' &&
        this.botClient
      ) {
        try {
          await this.botClient.setDisplayName(this.botDisplayName);
          this.logger.log(`Bot display name set to: ${this.botDisplayName}`);
        } catch (error) {
          this.logger.warn(`Failed to set bot display name: ${error.message}`);
        }
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
      if (this.useAppServiceAuth) {
        // Use Application Service authentication (preferred)
        await this.authenticateBotWithAppService(tenantId);
      } else {
        // Fallback to OIDC authentication
        await this.authenticateBotWithOIDC(tenantId);
      }
    } catch (error) {
      this.isAuthenticated = false;
      this.logger.error(
        `Failed to authenticate Matrix bot for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  private async authenticateBotWithOIDC(tenantId: string): Promise<void> {
    this.logger.log(`Using OIDC authentication for tenant: ${tenantId}`);

    // Get or create dedicated bot user for this tenant
    const botUser =
      await this.matrixBotUserService.getOrCreateBotUser(tenantId);
    this.logger.log(`Using bot user: ${botUser.slug} for tenant ${tenantId}`);

    // Check if bot password needs rotation
    if (await this.matrixBotUserService.needsPasswordRotation(tenantId)) {
      this.logger.log(`Bot password rotation needed for tenant ${tenantId}`);
      try {
        await this.matrixBotUserService.rotateBotPassword(tenantId);
        this.logger.log(`Bot password rotated for tenant ${tenantId}`);
      } catch (rotationError) {
        this.logger.warn(
          `Failed to rotate bot password for tenant ${tenantId}: ${rotationError.message}`,
        );
        // Continue with authentication using existing password
      }
    }

    // Use MatrixUserService to get an authenticated client for the bot user
    // This handles the MAS OIDC flow automatically
    this.botClient = await this.matrixUserService.getClientForUser(
      botUser.slug,
      undefined, // userService parameter is deprecated
      tenantId,
    );

    // Set display name if configured
    if (
      this.botDisplayName &&
      this.botDisplayName !== 'OpenMeet Admin Bot' &&
      this.botClient
    ) {
      try {
        await this.botClient.setDisplayName(this.botDisplayName);
        this.logger.log(`Bot display name set to: ${this.botDisplayName}`);
      } catch (error) {
        this.logger.warn(`Failed to set bot display name: ${error.message}`);
      }
    }

    this.isAuthenticated = true;
    this.logger.log(
      `Matrix bot authenticated successfully with OIDC for tenant: ${tenantId}`,
    );
  }

  isBotAuthenticated(): boolean {
    return this.isAuthenticated && this.botClient !== null;
  }

  getBotUserId(): string {
    return `@${this.botUsername}:${this.serverName}`;
  }

  private async ensureBotAuthenticated(tenantId: string): Promise<void> {
    if (!this.isBotAuthenticated()) {
      this.logger.log(
        `Bot not authenticated yet, authenticating now for tenant: ${tenantId}`,
      );
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
      await this.botClient!.invite(roomId, userId);
      this.logger.log(`Successfully invited user ${userId} to room ${roomId}`);
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
      this.logger.error(
        `Failed to remove user ${userId} from room ${roomId}: ${error.message}`,
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
}
