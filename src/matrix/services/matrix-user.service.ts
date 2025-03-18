import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import { CreateUserOptions, MatrixUserInfo } from '../types/matrix.types';
import {
  IMatrixClient,
  IMatrixClientProvider,
} from '../types/matrix.interfaces';

@Injectable()
export class MatrixUserService implements IMatrixClientProvider, OnModuleDestroy {
  private readonly logger = new Logger(MatrixUserService.name);

  // Map to store user-specific Matrix clients (using slug as key)
  private userMatrixClients: Map<
    string,
    {
      client: IMatrixClient;
      matrixUserId: string;
      lastActivity: Date;
    }
  > = new Map();

  // Interval for cleaning up inactive clients
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly matrixCoreService: MatrixCoreService,
    private readonly moduleRef: ModuleRef,
  ) {
    // Set up a cleanup interval for inactive clients (30 minutes)
    this.cleanupInterval = setInterval(
      () => this.cleanupInactiveClients(),
      30 * 60 * 1000,
    );
  }

  /**
   * Create a new Matrix user
   */
  async createUser(options: CreateUserOptions): Promise<MatrixUserInfo> {
    const { username, password, displayName, adminUser = false } = options;
    const config = this.matrixCoreService.getConfig();

    this.logger.debug('Creating Matrix user:', {
      username,
      displayName,
      adminUser,
      serverName: config.serverName,
    });

    try {
      // Variable to hold successful response data
      let registrationResponse;

      try {
        // Try v2 admin API (standard in most Matrix servers)
        const url = `${config.baseUrl}/_synapse/admin/v2/users/@${username}:${config.serverName}`;
        this.logger.debug(
          `Attempting Matrix user registration with v2 Admin API: ${url}`,
        );

        registrationResponse = await axios.put(
          url,
          {
            password,
            admin: adminUser,
            deactivated: false,
            ...(displayName ? { displayname: displayName } : {}),
          },
          {
            headers: {
              Authorization: `Bearer ${this.matrixCoreService.getAdminClient().getAccessToken()}`,
            },
          },
        );
      } catch (v2Error) {
        // Log the v2 error details
        this.logger.warn('Matrix v2 API registration failed:', {
          message: v2Error.message,
          status: v2Error.response?.status,
          data: v2Error.response?.data,
        });

        // Try the v1 admin users endpoint
        try {
          const url = `${config.baseUrl}/_synapse/admin/v1/users/@${username}:${config.serverName}`;
          this.logger.debug(`Trying v1 Matrix Admin API endpoint: ${url}`);

          registrationResponse = await axios.put(
            url,
            {
              password,
              admin: adminUser,
            },
            {
              headers: {
                Authorization: `Bearer ${this.matrixCoreService.getAdminClient().getAccessToken()}`,
              },
            },
          );
        } catch (v1Error) {
          // Try using the standard register endpoint as a last resort
          try {
            const registerUrl = `${config.baseUrl}/_matrix/client/v3/register`;

            // Try with dummy auth type
            const registerData = {
              username: username,
              password: password,
              auth: {
                type: 'm.login.dummy',
              },
              inhibit_login: true,
            };

            registrationResponse = await axios.post(registerUrl, registerData);
          } catch (registerError) {
            this.logger.error('All Matrix registration methods failed:', {
              v2Error: v2Error.message,
              v1Error: v1Error.message,
              registerError: registerError.message,
            });

            throw new Error(
              `Failed to create Matrix user. Please check Matrix server configuration.`,
            );
          }
        }
      }

      // The Admin API doesn't return access token/device ID, so we need to log in as the user
      this.logger.debug(
        `Logging in as the newly created Matrix user: ${username}`,
      );

      // Try v3 login API
      const loginUrl = `${config.baseUrl}/_matrix/client/v3/login`;
      const loginResponse = await axios.post(loginUrl, {
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: username,
        },
        password,
        device_id: config.defaultDeviceId,
        initial_device_display_name: config.defaultInitialDeviceDisplayName,
      });

      const userId = loginResponse.data.user_id;
      const accessToken = loginResponse.data.access_token;
      const deviceId = loginResponse.data.device_id;

      // Set display name if provided
      if (displayName) {
        try {
          this.logger.debug(
            `Setting Matrix display name for user ${userId} to "${displayName}"`,
          );

          const sdk = this.matrixCoreService.getSdk();
          const userClient = sdk.createClient({
            baseUrl: config.baseUrl,
            userId,
            accessToken,
            deviceId,
            useAuthorizationHeader: true,
          });

          // Just use the client for this one operation
          await userClient.setDisplayName(displayName);
        } catch (displayNameError) {
          // Non-fatal error, just log it
          this.logger.warn(
            `Failed to set Matrix display name: ${displayNameError.message}`,
          );
        }
      }

      return {
        userId,
        accessToken,
        deviceId,
      };
    } catch (error) {
      this.logger.error(
        `Error creating Matrix user: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create Matrix user: ${error.message}`);
    }
  }

  /**
   * Set a user's display name in Matrix
   */
  async setUserDisplayName(
    userId: string,
    accessToken: string,
    displayName: string,
    deviceId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Setting display name for user ${userId} to "${displayName}"`,
      );
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

      // Set the display name using the SDK
      await tempClient.setDisplayName(displayName);

      this.logger.debug(`Successfully set display name for user ${userId}`);
    } catch (error) {
      // Try direct API call as fallback
      try {
        const config = this.matrixCoreService.getConfig();
        const encodedUserId = encodeURIComponent(userId);
        const url = `${config.baseUrl}/_matrix/client/v3/profile/${encodedUserId}/displayname`;

        await axios.put(
          url,
          { displayname: displayName },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        this.logger.debug(
          `Successfully set display name directly for user ${userId}`,
        );
      } catch (directError) {
        this.logger.error(
          `Error setting display name for user ${userId}: ${error.message}, direct API also failed: ${directError.message}`,
          error.stack,
        );
        throw new Error(`Failed to set Matrix display name: ${error.message}`);
      }
    }
  }

  /**
   * Get a user's display name from Matrix
   */
  async getUserDisplayName(userId: string): Promise<string | null> {
    try {
      const client = await this.matrixCoreService.acquireClient();

      try {
        this.logger.debug(`Getting display name for user ${userId}`);

        // Get the profile info
        const response = await client.client.getProfileInfo(
          userId,
          'displayname',
        );

        return response?.displayname || null;
      } finally {
        await this.matrixCoreService.releaseClient(client);
      }
    } catch (error) {
      this.logger.warn(
        `Error getting display name for user ${userId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Get or create a Matrix client for a specific user
   * This method fetches user credentials from the database
   */
  async getClientForUser(
    userSlug: string,
    userService?: any,
    tenantId?: string,
  ): Promise<IMatrixClient> {
    // Check if we already have an active client for this user
    const existingClient = this.userMatrixClients.get(userSlug);
    if (existingClient) {
      // Update last activity timestamp
      existingClient.lastActivity = new Date();
      this.logger.debug(`Using existing Matrix client for user ${userSlug}`);
      return existingClient.client;
    }

    this.logger.debug(
      `Creating new Matrix client for user ${userSlug} with tenant ID: ${tenantId || 'undefined'}`,
    );

    // We need to fetch the user with Matrix credentials
    let user;
    try {
      if (userService) {
        // If userService was passed, use it (more efficient)
        user = await userService.findBySlug(userSlug, tenantId);
      } else {
        // Otherwise, get a UserService instance through the module system
        const contextId = ContextIdFactory.create();

        // Import UserService
        const UserServiceClass = (await import('../../user/user.service'))
          .UserService;
        const userServiceInstance = await this.moduleRef.resolve(
          UserServiceClass,
          contextId,
          { strict: false },
        );

        // Pass tenant ID to findBySlug
        user = await userServiceInstance.findBySlug(userSlug, tenantId);
      }
    } catch (error) {
      this.logger.error(
        `Error fetching user ${userSlug}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get user data: ${error.message}`);
    }

    if (!user || !user.matrixUserId || !user.matrixAccessToken) {
      this.logger.warn(`User ${userSlug} has no Matrix credentials`);
      throw new Error('User has no Matrix credentials');
    }

    try {
      const config = this.matrixCoreService.getConfig();
      const sdk = this.matrixCoreService.getSdk();

      // Create a Matrix client with the user's credentials
      const client = sdk.createClient({
        baseUrl: config.baseUrl,
        userId: user.matrixUserId,
        accessToken: user.matrixAccessToken,
        deviceId: user.matrixDeviceId || undefined,
        useAuthorizationHeader: true,
      });

      // Store the client using slug
      this.userMatrixClients.set(userSlug, {
        client,
        matrixUserId: user.matrixUserId,
        lastActivity: new Date(),
      });

      this.logger.log(
        `Created Matrix client for user ${userSlug} (${user.matrixUserId})`,
      );

      return client;
    } catch (error) {
      this.logger.error(
        `Error creating Matrix client for user ${userSlug}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create Matrix client: ${error.message}`);
    }
  }

  /**
   * Release a Matrix client when it's no longer needed
   */
  releaseClientForUser(userSlug: string): void {
    const clientInfo = this.userMatrixClients.get(userSlug);
    if (clientInfo) {
      try {
        this.logger.debug(`Stopping Matrix client for user ${userSlug}`);
        clientInfo.client.stopClient();
      } catch (error) {
        this.logger.warn(
          `Error stopping client for user ${userSlug}: ${error.message}`,
        );
      }

      this.userMatrixClients.delete(userSlug);
      this.logger.log(`Released Matrix client for user ${userSlug}`);
    }
  }

  /**
   * Clean up inactive clients (no activity for 2 hours)
   */
  private cleanupInactiveClients() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Cleanup user-specific Matrix clients
    for (const [userSlug, clientInfo] of this.userMatrixClients.entries()) {
      if (clientInfo.lastActivity < twoHoursAgo) {
        this.logger.log(
          `Cleaning up inactive user Matrix client for user ${userSlug}`,
        );
        try {
          clientInfo.client.stopClient();
        } catch (error) {
          this.logger.warn(
            `Error stopping client for user ${userSlug}: ${error.message}`,
          );
        }
        this.userMatrixClients.delete(userSlug);
      }
    }
  }

  /**
   * Exposed method for tests to unregister timers without needing to destroy the module
   * This helps prevent test hangs
   */
  unregisterTimers() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      // Use undefined instead of null for Typescript compatibility
      this.cleanupInterval = undefined as unknown as NodeJS.Timeout;
    }
  }

  /**
   * Destroy service and clean up resources
   */
  async onModuleDestroy() {
    // Clear the cleanup interval
    this.unregisterTimers();

    // Stop all user clients
    for (const [userSlug, clientInfo] of this.userMatrixClients.entries()) {
      try {
        this.logger.debug(`Stopping Matrix client for user ${userSlug}`);
        clientInfo.client.stopClient();
      } catch (error) {
        this.logger.warn(
          `Error stopping client for user ${userSlug}: ${error.message}`,
        );
      }
    }

    // Clear the map
    this.userMatrixClients.clear();
  }
}
