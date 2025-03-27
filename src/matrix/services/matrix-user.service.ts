import {
  Injectable,
  Logger,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import axios from 'axios';
import { MatrixCoreService } from './matrix-core.service';
import {
  CreateUserOptions,
  MatrixUserInfo,
  UpdateMatrixPasswordOptions,
} from '../types/matrix.types';
import {
  IMatrixClient,
  IMatrixClientProvider,
} from '../types/matrix.interfaces';
import { MatrixGateway } from '../matrix.gateway';

@Injectable()
export class MatrixUserService
  implements IMatrixClientProvider, OnModuleDestroy
{
  /**
   * Generate a standardized Matrix username for an OpenMeet user
   * @param user User entity or object with slug property
   * @param tenantId Optional tenant ID to include in the username
   * @returns A standardized Matrix username
   */
  public static generateMatrixUsername(
    user: { slug: string },
    tenantId?: string,
  ): string {
    return tenantId ? `${user.slug}_${tenantId}` : user.slug;
  }

  /**
   * Generate a secure random password for Matrix users
   * @returns A secure random password
   */
  public static generateMatrixPassword(): string {
    return (
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    );
  }

  /**
   * Generate a display name for a Matrix user based on OpenMeet user data
   * @param user User entity or object with firstName, lastName, and email properties
   * @returns A formatted display name
   */
  public static generateDisplayName(user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    slug?: string;
  }): string {
    // First try to use full name
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    if (fullName) {
      return fullName;
    }

    // If no full name, try email username
    if (user.email) {
      const emailUsername = user.email.split('@')[0];
      if (emailUsername) {
        return emailUsername;
      }
    }

    // If nothing else, use the slug or a generic name
    return user.slug || 'OpenMeet User';
  }

  /**
   * Provisions a Matrix user for an OpenMeet user if they don't already have Matrix credentials
   * @param user The OpenMeet user object
   * @param tenantId Optional tenant ID for multi-tenant support
   * @returns Matrix user credentials
   */
  async provisionMatrixUser(
    user: {
      slug: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    },
    tenantId?: string,
  ): Promise<MatrixUserInfo> {
    // Generate username, password, and display name using our static helpers
    const username = MatrixUserService.generateMatrixUsername(user, tenantId);
    const password = MatrixUserService.generateMatrixPassword();
    const displayName = MatrixUserService.generateDisplayName(user);

    // Create the Matrix user
    const matrixUserInfo = await this.createUser({
      username,
      password,
      displayName,
    });

    // Ensure display name is set properly (sometimes it doesn't get set during creation)
    try {
      await this.setUserDisplayName(
        matrixUserInfo.userId,
        matrixUserInfo.accessToken,
        displayName,
        matrixUserInfo.deviceId,
      );
      this.logger.debug(
        `Set Matrix display name for ${matrixUserInfo.userId} to "${displayName}"`,
      );
    } catch (displayNameError) {
      this.logger.warn(
        `Failed to set Matrix display name: ${displayNameError.message}`,
      );
      // Non-fatal error, continue
    }

    return matrixUserInfo;
  }
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
    @Inject(forwardRef(() => MatrixGateway))
    private readonly matrixGateway: any,
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
      try {
        // Try v2 admin API (standard in most Matrix servers)
        const url = `${config.baseUrl}/_synapse/admin/v2/users/@${username}:${config.serverName}`;
        this.logger.debug(
          `Attempting Matrix user registration with v2 Admin API: ${url}`,
        );

        await axios.put(
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

          await axios.put(
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
            this.logger.debug(
              `Trying standard registration endpoint: ${registerUrl}`,
            );

            // Try with dummy auth type - this often works when admin API fails
            const registerData = {
              username: username,
              password: password,
              auth: {
                type: 'm.login.dummy',
              },
              inhibit_login: false, // Changed to false to get access token directly
            };

            const registerResponse = await axios.post(
              registerUrl,
              registerData,
            );

            // If we get here, registration succeeded - extract credentials
            if (registerResponse.data && registerResponse.data.access_token) {
              this.logger.debug(
                'Standard registration succeeded with direct token',
              );

              // Return user credentials directly
              return {
                userId: registerResponse.data.user_id,
                accessToken: registerResponse.data.access_token,
                deviceId: registerResponse.data.device_id,
              };
            }
          } catch (registerError) {
            // Try registration with shared secret as absolute last resort
            try {
              // Check if we have the registration shared secret from the environment
              const sharedSecret =
                process.env.MATRIX_REGISTRATION_SECRET ||
                process.env.SYNAPSE_REGISTRATION_SHARED_SECRET;

              if (sharedSecret) {
                this.logger.debug('Attempting registration with shared secret');

                // First get a nonce from the server
                const nonceResponse = await axios.get(
                  `${config.baseUrl}/_matrix/client/v3/register?kind=user`,
                );

                if (nonceResponse.data && nonceResponse.data.nonce) {
                  const nonce = nonceResponse.data.nonce;

                  // Create HMAC-SHA1 signature
                  const crypto = await import('crypto');
                  const hmac = crypto.createHmac('sha1', sharedSecret);
                  hmac.update(
                    nonce +
                      '\0' +
                      username +
                      '\0' +
                      password +
                      '\0' +
                      (adminUser ? '1' : '0'),
                  );
                  const mac = hmac.digest('hex');

                  // Register with shared secret
                  const sharedSecretResponse = await axios.post(
                    `${config.baseUrl}/_matrix/client/v3/register`,
                    {
                      username,
                      password,
                      nonce,
                      mac,
                      type: 'm.login.shared_secret',
                      admin: adminUser,
                      inhibit_login: false,
                    },
                  );

                  if (
                    sharedSecretResponse.data &&
                    sharedSecretResponse.data.access_token
                  ) {
                    this.logger.debug('Shared secret registration succeeded');

                    return {
                      userId: sharedSecretResponse.data.user_id,
                      accessToken: sharedSecretResponse.data.access_token,
                      deviceId:
                        sharedSecretResponse.data.device_id ||
                        config.defaultDeviceId,
                    };
                  }
                }
              }
            } catch (sharedSecretError) {
              this.logger.warn('Shared secret registration also failed:', {
                error: sharedSecretError.message,
                response: sharedSecretError.response?.data,
              });
            }

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
   * Verify if a Matrix access token is still valid
   * @param userId The Matrix user ID
   * @param accessToken The Matrix access token to verify
   * @returns True if the token is valid, false otherwise
   */
  async verifyAccessToken(
    userId: string,
    accessToken: string,
  ): Promise<boolean> {
    if (!userId || !accessToken) {
      return false;
    }

    try {
      const config = this.matrixCoreService.getConfig();

      // The whoami endpoint is the standard way to verify tokens
      const url = `${config.baseUrl}/_matrix/client/v3/account/whoami`;

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // If we get a valid response with matching user_id, the token is valid
      if (response.status === 200 && response.data?.user_id === userId) {
        this.logger.debug(
          `Matrix token verified successfully for user ${userId}`,
        );
        return true;
      }

      this.logger.warn(
        `Token verification failed: user ID mismatch. Expected ${userId}, got ${response.data?.user_id}`,
      );
      return false;
    } catch (error) {
      // If we get an error, the token is likely invalid
      this.logger.warn(
        `Matrix token invalid for user ${userId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Generate a new access token for an existing Matrix user using admin API
   * @param matrixUserId The full Matrix user ID (@username:server.com)
   * @returns New access token or null if failed
   */
  async generateNewAccessToken(matrixUserId: string): Promise<string | null> {
    try {
      const config = this.matrixCoreService.getConfig();
      const adminToken = this.matrixCoreService
        .getAdminClient()
        .getAccessToken();

      // Use admin API to create a new access token
      const url = `${config.baseUrl}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`;

      const response = await axios.post(
        url,
        {
          valid_until_ms: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days from now
        },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
      );

      if (response.data?.access_token) {
        this.logger.log(
          `Successfully generated new admin token for ${matrixUserId}`,
        );
        return response.data.access_token;
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Error generating new access token: ${error.message}`,
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
    let userServiceInstance;
    try {
      if (userService) {
        // If userService was passed, use it (more efficient)
        userServiceInstance = userService;
        user = await userService.findBySlug(userSlug, tenantId);
      } else {
        // Otherwise, get a UserService instance through the module system
        const contextId = ContextIdFactory.create();

        // Import UserService
        const UserServiceClass = (await import('../../user/user.service'))
          .UserService;
        userServiceInstance = await this.moduleRef.resolve(
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

    if (!user || !user.matrixUserId) {
      this.logger.warn(`User ${userSlug} has no Matrix user ID`);
      throw new Error('User has no Matrix credentials');
    }

    // If there's no access token or it's invalid, try to refresh it
    let accessToken = user.matrixAccessToken;
    let deviceId = user.matrixDeviceId;

    const isTokenValid = accessToken
      ? await this.verifyAccessToken(user.matrixUserId, accessToken)
      : false;

    if (!isTokenValid) {
      this.logger.warn(
        `Matrix token for ${userSlug} is invalid or missing, generating new token...`,
      );

      // Generate a new token using admin API
      const newToken = await this.generateNewAccessToken(user.matrixUserId);

      if (newToken) {
        // Update the user record with the new token
        accessToken = newToken;
        deviceId =
          deviceId || this.matrixCoreService.getConfig().defaultDeviceId;

        // Update in database
        try {
          await userServiceInstance.update(
            user.id,
            {
              matrixAccessToken: newToken,
              matrixDeviceId: deviceId,
              preferences: {
                ...(user.preferences || {}),
                matrix: {
                  ...(user.preferences?.matrix || {}),
                  connected: true,
                },
              },
            },
            tenantId,
          );

          this.logger.log(
            `Successfully updated Matrix token for user ${userSlug}`,
          );
        } catch (updateError) {
          this.logger.error(
            `Failed to update Matrix token in database: ${updateError.message}`,
            updateError.stack,
          );
          // Continue anyway with the new token, even if DB update failed
        }
      } else {
        this.logger.error(
          `Failed to generate new token for ${userSlug}, can't connect to Matrix`,
        );
        throw new Error('Failed to refresh Matrix credentials');
      }
    }

    try {
      const config = this.matrixCoreService.getConfig();
      const sdk = this.matrixCoreService.getSdk();

      // Create a Matrix client with the user's credentials
      const client = sdk.createClient({
        baseUrl: config.baseUrl,
        userId: user.matrixUserId,
        accessToken: accessToken,
        deviceId: deviceId || undefined,
        useAuthorizationHeader: true,
      });

      try {
        // Start the client to enable real-time sync with Matrix server
        this.logger.debug(`Starting Matrix client for user ${userSlug}`);

        // Start the client with appropriate sync params
        await client.startClient({
          // Only care about new messages, no need to load complete history
          initialSyncLimit: 10,
          // Don't filter out messages from ourselves
          disablePresence: false,
          // Increase timeout for better reliability
          requestTimeout: 30000,
        });

        // Get reference to MatrixGateway to broadcast events
        try {
          // Set up event listeners for room timeline (new messages)
          client.on(
            'Room.timeline',
            (event, room, toStartOfTimeline, removed, _data) => {
              // Skip processing if event is for historical messages or removed events
              if (toStartOfTimeline || removed) return;

              // Only broadcast new message events (not state events, typing, etc.)
              if (event.getType() === 'm.room.message') {
                this.logger.debug(
                  `Got new message event in room ${room.roomId} from user ${event.getSender()}`,
                );

                // Use the injected MatrixGateway instance
                if (
                  this.matrixGateway &&
                  this.matrixGateway.broadcastRoomEvent
                ) {
                  // Convert event to plain object for broadcasting
                  const eventData = {
                    type: event.getType(),
                    room_id: room.roomId,
                    sender: event.getSender(),
                    content: event.getContent(),
                    event_id: event.getId(),
                    origin_server_ts: event.getTs(),
                    user_slug: userSlug, // Include user slug for context
                    tenant_id: tenantId || 'default', // Include tenant ID for multi-tenancy
                  };

                  // Broadcast the event to all connected clients
                  this.matrixGateway.broadcastRoomEvent(room.roomId, eventData);
                  this.logger.debug(
                    `Broadcast Matrix message event for room ${room.roomId} (tenant: ${tenantId || 'default'})`,
                  );
                } else {
                  this.logger.warn(
                    'Could not get MatrixGateway instance to broadcast event',
                  );
                }
              }
            },
          );

          this.logger.log('Matrix event listeners set up successfully');
        } catch (listenerError) {
          this.logger.error(
            `Error setting up Matrix event listeners: ${listenerError.message}`,
          );
        }
      } catch (startError) {
        this.logger.error(
          `Error starting Matrix client: ${startError.message}`,
          startError.stack,
        );
        // Continue even if client start fails - we'll still return the client
      }

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
   * Update a Matrix user's password
   */
  async updatePassword(options: UpdateMatrixPasswordOptions): Promise<void> {
    const { matrixUserId, password, tenantId } = options;
    const config = this.matrixCoreService.getConfig();

    try {
      this.logger.debug(
        `Updating password for Matrix user ${matrixUserId} (tenant: ${tenantId || 'default'})`,
      );

      // Try v2 admin API first (standard in most Matrix servers)
      const url = `${config.baseUrl}/_synapse/admin/v2/users/${matrixUserId}`;
      this.logger.debug(`Using API endpoint: ${url}`);

      await axios.put(
        url,
        {
          password,
          deactivated: false,
        },
        {
          headers: {
            Authorization: `Bearer ${this.matrixCoreService.getAdminClient().getAccessToken()}`,
          },
        },
      );

      this.logger.log(`Successfully updated password for user ${matrixUserId}`);
    } catch (v2Error) {
      this.logger.warn('Matrix v2 API password update failed:', {
        message: v2Error.message,
        status: v2Error.response?.status,
        data: v2Error.response?.data,
      });

      // Try v1 admin API as fallback
      try {
        const url = `${config.baseUrl}/_synapse/admin/v1/users/${matrixUserId}`;
        this.logger.debug(`Trying v1 Matrix Admin API endpoint: ${url}`);

        await axios.put(
          url,
          {
            password,
          },
          {
            headers: {
              Authorization: `Bearer ${this.matrixCoreService.getAdminClient().getAccessToken()}`,
            },
          },
        );

        this.logger.log(
          `Successfully updated password via v1 API for user ${matrixUserId}`,
        );
      } catch (v1Error) {
        this.logger.error(
          `All Matrix password update methods failed for user ${matrixUserId}:`,
          {
            v2Error: v2Error.message,
            v1Error: v1Error.message,
          },
        );
        throw new Error(`Failed to update Matrix password: ${v2Error.message}`);
      }
    }
  }

  /**
   * Set Matrix password for a user - handles user verification and matrix password setting
   */
  async setUserMatrixPassword(
    userId: number,
    password: string,
    tenantId?: string,
  ): Promise<void> {
    this.logger.debug(`Setting Matrix password for user ID: ${userId}`);

    // Use dynamic import to get UserService to avoid circular dependency
    let UserServiceClass;
    try {
      UserServiceClass = (await import('../../user/user.service')).UserService;
    } catch (error) {
      this.logger.error(`Error importing UserService: ${error.message}`);
      throw new Error('Internal server error');
    }

    // Get context ID for DI
    const contextId = ContextIdFactory.create();

    // Get UserService from module system
    const userService = await this.moduleRef.resolve(
      UserServiceClass,
      contextId,
      { strict: false },
    );

    // Get the full user information including Matrix credentials
    const user = await userService.findById(userId, tenantId);

    if (!user) {
      this.logger.warn(`User with ID ${userId} not found`);
      throw new Error('User not found');
    }

    if (!user.matrixUserId) {
      this.logger.warn(`User ${userId} has no Matrix account`);
      throw new Error(
        'User has no Matrix account. Please provision a Matrix account first.',
      );
    }

    // Update the Matrix password using admin API
    await this.updatePassword({
      matrixUserId: user.matrixUserId,
      password,
      tenantId,
    });

    this.logger.log(`Matrix password set successfully for user ID: ${userId}`);
  }

  /**
   * Destroy service and clean up resources
   */
  onModuleDestroy() {
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
    return Promise.resolve();
  }
}
