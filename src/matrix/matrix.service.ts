import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import * as sdk from 'matrix-js-sdk';
import * as pool from 'generic-pool';
import axios from 'axios';

import {
  ActiveClient,
  CreateRoomOptions,
  CreateUserOptions,
  InviteUserOptions,
  MatrixClientWithContext,
  MatrixUserInfo,
  Message,
  RoomInfo,
  SendMessageOptions,
  StartClientOptions,
} from './types/matrix.types';
import { MatrixConfig } from './config/matrix-config.type';
import { MatrixGateway } from './matrix.gateway';

@Injectable()
export class MatrixService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatrixService.name);
  private readonly adminClient: sdk.MatrixClient;
  public readonly adminUserId: string;
  private readonly baseUrl: string;
  private readonly serverName: string;
  private readonly defaultDeviceId: string;
  private readonly defaultInitialDeviceDisplayName: string;
  private readonly adminAccessToken: string;

  // Reference to the MatrixGateway for broadcasting events
  private matrixGateway: any = null;

  // Connection pool for admin API operations
  private clientPool: pool.Pool<MatrixClientWithContext>;

  // Active client instances for real-time events/sync
  private activeClients: Map<string, ActiveClient> = new Map();

  // Map to store user-specific Matrix clients
  private userMatrixClients: Map<
    number,
    {
      client: sdk.MatrixClient;
      matrixUserId: string;
      lastActivity: Date;
    }
  > = new Map();

  // Interval for cleaning up inactive clients
  private cleanupInterval: NodeJS.Timeout;

  // Add moduleRef property
  private readonly moduleRef: ModuleRef;

  constructor(
    private readonly configService: ConfigService,
    moduleRef: ModuleRef,
  ) {
    this.moduleRef = moduleRef;
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    if (!matrixConfig) {
      throw new Error('Matrix configuration is missing');
    }

    // Log environment variables to debug configuration issues
    this.logger.debug('Matrix-related environment variables:', {
      MATRIX_BASE_URL: process.env.MATRIX_BASE_URL,
      MATRIX_SERVER_URL: process.env.MATRIX_SERVER_URL,
      MATRIX_ADMIN_USER: process.env.MATRIX_ADMIN_USER,
      MATRIX_ADMIN_USERNAME: process.env.MATRIX_ADMIN_USERNAME,
      MATRIX_SERVER_NAME: process.env.MATRIX_SERVER_NAME,
    });

    this.baseUrl = matrixConfig.baseUrl;
    this.adminUserId = `@${matrixConfig.adminUser}:${matrixConfig.serverName}`;
    this.serverName = matrixConfig.serverName;
    this.defaultDeviceId = matrixConfig.defaultDeviceId;
    this.defaultInitialDeviceDisplayName =
      matrixConfig.defaultInitialDeviceDisplayName;
    this.adminAccessToken = matrixConfig.adminAccessToken;

    // Log Matrix configuration for debugging
    this.logger.debug('Matrix configuration:', {
      baseUrl: this.baseUrl,
      adminUserId: this.adminUserId,
      serverName: this.serverName,
      adminAccessToken: this.adminAccessToken
        ? '***' + this.adminAccessToken.slice(-5)
        : 'NOT SET',
    });

    // Create admin client for API operations only
    this.adminClient = sdk.createClient({
      baseUrl: this.baseUrl,
      userId: this.adminUserId,
      accessToken: matrixConfig.adminAccessToken || '',
      useAuthorizationHeader: true,
    });

    // Initialize connection pool
    this.clientPool = pool.createPool<MatrixClientWithContext>(
      {
        // eslint-disable-next-line @typescript-eslint/require-await
        create: async () => {
          // Use the same userId and accessToken for consistency
          const client = sdk.createClient({
            baseUrl: this.baseUrl,
            userId: this.adminUserId,
            accessToken: matrixConfig.adminAccessToken || '',
            useAuthorizationHeader: true,
          });
          return {
            client,
            userId: this.adminUserId,
          };
        },
        destroy: async (client) => {
          client.client.stopClient();
          return Promise.resolve();
        },
      },
      {
        max: matrixConfig.connectionPoolSize || 10,
        min: 2,
        acquireTimeoutMillis: matrixConfig.connectionPoolTimeout || 30000,
        idleTimeoutMillis: 30000,
        evictionRunIntervalMillis: 60000,
      },
    );
  }

  async onModuleInit() {
    this.logger.log(
      `Matrix service initialized with admin user ${this.adminUserId}`,
    );

    // Warm up the connection pool for admin operations
    try {
      const clients = await Promise.all(
        Array(2)
          .fill(0)
          .map(() => this.clientPool.acquire()),
      );

      for (const client of clients) {
        await this.clientPool.release(client);
      }

      this.logger.log('Matrix client pool initialized');

      // Get reference to the MatrixGateway for broadcasting room events
      setTimeout(() => {
        try {
          // Dynamically find the MatrixGateway instance
          // This is needed because we can't directly inject it due to circular dependencies
          if (!this.moduleRef) {
            this.logger.warn(
              'ModuleRef not available, cannot get MatrixGateway reference',
            );
            return;
          }

          // Get the MatrixGateway directly from the moduleRef
          try {
            // First, try getting by token name
            this.matrixGateway = this.moduleRef.get('MatrixGateway', {
              strict: false,
            });
            if (this.matrixGateway) {
              this.logger.log(
                'Successfully obtained reference to MatrixGateway by name token',
              );
            }
          } catch (innerError) {
            this.logger.warn(
              'Error getting MatrixGateway by token name',
              innerError,
            );
          }

          // If first method failed, try getting by constructor reference
          if (!this.matrixGateway) {
            try {
              this.matrixGateway = this.moduleRef.get(MatrixGateway, {
                strict: false,
              });
              if (this.matrixGateway) {
                this.logger.log(
                  'Successfully obtained reference to MatrixGateway by constructor',
                );
              }
            } catch (innerError) {
              this.logger.warn(
                'Error getting MatrixGateway by constructor',
                innerError,
              );
            }
          }

          if (!this.matrixGateway) {
            this.logger.warn(
              'Could not find MatrixGateway instance, room broadcasting will not work',
            );
          }
        } catch (error) {
          this.logger.error(
            `Error getting MatrixGateway reference: ${error.message}`,
          );
        }
      }, 1000); // Short delay to ensure all modules are initialized
    } catch (error) {
      this.logger.error('Error initializing Matrix client pool', error.stack);
    }

    // Set up a cleanup interval for inactive clients (30 minutes)
    this.cleanupInterval = setInterval(
      () => this.cleanupInactiveClients(),
      30 * 60 * 1000,
    );
  }

  async onModuleDestroy() {
    // Stop the admin client
    this.adminClient.stopClient();

    // Stop all active clients
    for (const [userId, activeClient] of this.activeClients.entries()) {
      this.logger.log(`Stopping Matrix client for user ${userId}`);
      activeClient.client.stopClient();
    }
    this.activeClients.clear();

    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Drain and clear the connection pool
    await this.clientPool.drain();
    await this.clientPool.clear();

    this.logger.log('Matrix service destroyed');
  }

  /**
   * Clean up inactive clients (no activity for 2 hours)
   */
  private cleanupInactiveClients() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Cleanup activeClients (admin operations)
    for (const [userId, activeClient] of this.activeClients.entries()) {
      if (activeClient.lastActivity < twoHoursAgo) {
        this.logger.log(
          `Cleaning up inactive Matrix client for user ${userId}`,
        );
        activeClient.client.stopClient();
        this.activeClients.delete(userId);
      }
    }

    // Cleanup user-specific Matrix clients
    for (const [userId, clientInfo] of this.userMatrixClients.entries()) {
      if (clientInfo.lastActivity < twoHoursAgo) {
        this.logger.log(
          `Cleaning up inactive user Matrix client for user ${userId}`,
        );
        try {
          clientInfo.client.stopClient();
        } catch (error) {
          this.logger.warn(
            `Error stopping client for user ${userId}: ${error.message}`,
          );
        }
        this.userMatrixClients.delete(userId);
      }
    }
  }

  /**
   * Get or create a Matrix client for a specific user
   * This method fetches user credentials from the database
   */
  async getClientForUser(
    userId: number,
    userService?: any,
    tenantId?: string,
  ): Promise<sdk.MatrixClient> {
    // Check if we already have an active client for this user
    const existingClient = this.userMatrixClients.get(userId);
    if (existingClient) {
      // Update last activity timestamp
      existingClient.lastActivity = new Date();
      this.logger.debug(`Using existing Matrix client for user ${userId}`);
      return existingClient.client;
    }

    this.logger.debug(
      `Creating new Matrix client for user ${userId} with tenant ID: ${tenantId || 'undefined'}`,
    );

    // We need to fetch the user with Matrix credentials
    let user;
    try {
      if (userService) {
        // If userService was passed, use it (more efficient)
        // Pass tenant ID to findById
        user = await userService.findById(userId, tenantId);
      } else {
        // Otherwise, get a UserService instance through the module system
        const contextId = ContextIdFactory.create();

        // Get UserService dynamically - requires moduleRef to be properly set up
        if (!this.moduleRef) {
          throw new Error('ModuleRef not available in MatrixService');
        }

        // Import UserService
        const UserServiceClass = (await import('../user/user.service'))
          .UserService;
        const userServiceInstance = await this.moduleRef.resolve(
          UserServiceClass,
          contextId,
          { strict: false },
        );

        // Pass tenant ID to findById
        user = await userServiceInstance.findById(userId, tenantId);
      }
    } catch (error) {
      this.logger.error(
        `Error fetching user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to get user data: ${error.message}`);
    }

    if (!user || !user.matrixUserId || !user.matrixAccessToken) {
      this.logger.warn(`User ${userId} has no Matrix credentials`);
      throw new Error('User has no Matrix credentials');
    }

    try {
      // Create a Matrix client with the user's credentials
      const client = sdk.createClient({
        baseUrl: this.baseUrl,
        userId: user.matrixUserId,
        accessToken: user.matrixAccessToken,
        deviceId: user.matrixDeviceId || undefined,
        useAuthorizationHeader: true,
      });

      // Store the client
      this.userMatrixClients.set(userId, {
        client,
        matrixUserId: user.matrixUserId,
        lastActivity: new Date(),
      });

      this.logger.log(
        `Created Matrix client for user ${userId} (${user.matrixUserId})`,
      );

      return client;
    } catch (error) {
      this.logger.error(
        `Error creating Matrix client for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to create Matrix client: ${error.message}`);
    }
  }

  /**
   * Release a Matrix client when it's no longer needed
   */
  releaseClientForUser(userId: number): void {
    const clientInfo = this.userMatrixClients.get(userId);
    if (clientInfo) {
      try {
        this.logger.debug(`Stopping Matrix client for user ${userId}`);
        clientInfo.client.stopClient();
      } catch (error) {
        this.logger.warn(
          `Error stopping client for user ${userId}: ${error.message}`,
        );
      }

      this.userMatrixClients.delete(userId);
      this.logger.log(`Released Matrix client for user ${userId}`);
    }
  }

  /**
   * Create a new Matrix user using the Admin API
   */
  async createUser(options: CreateUserOptions): Promise<MatrixUserInfo> {
    const { username, password, displayName, adminUser = false } = options;

    this.logger.debug('Creating Matrix user:', {
      username,
      displayName,
      adminUser,
      serverName: this.serverName,
      baseUrl: this.baseUrl,
      adminUserId: this.adminUserId,
      hasAdminToken: !!this.adminAccessToken,
    });

    try {
      // Variable to hold successful response data
      let registrationResponse;

      // First approach: Use the register_new_matrix_user script via direct API call
      try {
        // Matrix server provides an API endpoint to create users using a simple registration approach
        const matrixRegisterUrl = `${this.baseUrl}/_matrix/client/v3/register`;
        this.logger.debug(
          `Attempting Matrix user registration with client API: ${matrixRegisterUrl}`,
        );

        // First, get registration flows available
        const flowsResponse = await axios.get(matrixRegisterUrl);
        this.logger.debug('Available registration flows:', {
          flows: flowsResponse.data?.flows,
        });

        // Then try registering with 'dummy' auth (if allowed)
        const registerData = {
          username: username,
          password: password,
          auth: {
            type: 'm.login.dummy',
          },
          inhibit_login: true,
        };

        const registerResponse = await axios.post(
          matrixRegisterUrl,
          registerData,
        );

        this.logger.debug(
          'Matrix user registration successful with dummy auth:',
          {
            status: registerResponse.status,
            data: registerResponse.data,
          },
        );

        registrationResponse = registerResponse;
      } catch (dummyAuthError) {
        // Log the dummy auth error details
        this.logger.warn('Matrix dummy auth registration failed:', {
          message: dummyAuthError.message,
          status: dummyAuthError.response?.status,
          data: dummyAuthError.response?.data,
        });

        // Try v2 admin API (standard in most Matrix servers)
        try {
          const url = `${this.baseUrl}/_synapse/admin/v2/users/@${username}:${this.serverName}`;
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
                Authorization: `Bearer ${this.adminAccessToken}`,
              },
            },
          );

          this.logger.debug(
            'Matrix user registration successful with v2 Admin API:',
            {
              status: registrationResponse.status,
              data: registrationResponse.data,
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
            // Try POST with user_id in URL to create a new user
            const url = `${this.baseUrl}/_synapse/admin/v1/users/@${username}:${this.serverName}`;
            this.logger.debug(`Trying v1 Matrix Admin API endpoint: ${url}`);

            registrationResponse = await axios.put(
              url,
              {
                password,
                admin: adminUser,
              },
              {
                headers: {
                  Authorization: `Bearer ${this.adminAccessToken}`,
                },
              },
            );

            this.logger.debug(
              'Matrix user registration successful with v1 API:',
              {
                status: registrationResponse.status,
                data: registrationResponse.data,
              },
            );
          } catch (v1Error) {
            // Try using the register endpoint with a server admin access token
            try {
              const registerUrl = `${this.baseUrl}/_synapse/admin/v1/register`;
              this.logger.debug(
                `Trying Matrix admin register endpoint: ${registerUrl}`,
              );

              // First, get a nonce (required for register API)
              const nonceResponse = await axios.get(registerUrl, {
                headers: {
                  Authorization: `Bearer ${this.adminAccessToken}`,
                },
              });

              const nonce = nonceResponse.data?.nonce;
              this.logger.debug(`Got Matrix registration nonce: ${nonce}`);

              if (!nonce) {
                throw new Error('No nonce returned from Matrix server');
              }

              // Register with the nonce
              registrationResponse = await axios.post(
                registerUrl,
                {
                  nonce,
                  username,
                  password,
                  admin: adminUser,
                  displayname: displayName,
                },
                {
                  headers: {
                    Authorization: `Bearer ${this.adminAccessToken}`,
                  },
                },
              );

              this.logger.debug(
                'Matrix user registration successful with nonce:',
                {
                  status: registrationResponse.status,
                  data: registrationResponse.data,
                },
              );
            } catch (nonceError) {
              // Try using the register endpoint with shared secret
              try {
                const registerUrl = `${this.baseUrl}/_matrix/client/api/v1/register`;
                this.logger.debug(
                  `Trying Matrix client register endpoint: ${registerUrl}`,
                );

                // This is the last resort - this might work if admin registration is enabled
                registrationResponse = await axios.post(registerUrl, {
                  user: username,
                  password: password,
                  type: 'm.login.password',
                });

                this.logger.debug(
                  'Matrix user registration successful with client API:',
                  {
                    status: registrationResponse.status,
                    data: registrationResponse.data,
                  },
                );
              } catch (clientRegError) {
                this.logger.error('All Matrix registration methods failed:', {
                  dummyAuthError: dummyAuthError.message,
                  v2Error: v2Error.message,
                  v1Error: v1Error.message,
                  nonceError: nonceError.message,
                  clientRegError: clientRegError.message,
                  adminToken: this.adminAccessToken
                    ? 'Present (hidden)'
                    : 'Missing',
                  serverName: this.serverName,
                  baseUrl: this.baseUrl,
                });

                throw new Error(
                  `Failed to create Matrix user. Please check your Matrix server configuration and ensure registration is properly set up.`,
                );
              }
            }
          }
        }
      }

      // The Admin API doesn't return access token/device ID, so we need to log in as the user
      this.logger.debug(
        `Logging in as the newly created Matrix user: ${username}`,
      );

      // Try both client API versions r0 and v3
      let loginResponse;
      try {
        // Try the legacy r0 client API first
        const loginUrl = `${this.baseUrl}/_matrix/client/r0/login`;
        this.logger.debug(`Attempting Matrix login with r0 API: ${loginUrl}`);

        loginResponse = await axios.post(loginUrl, {
          type: 'm.login.password',
          identifier: {
            type: 'm.id.user',
            user: username,
          },
          password,
          device_id: this.defaultDeviceId,
          initial_device_display_name: this.defaultInitialDeviceDisplayName,
        });
      } catch (r0Error) {
        // Try the newer v3 client API
        this.logger.warn(
          `Matrix r0 login failed, trying v3 API: ${r0Error.message}`,
        );

        const loginUrlV3 = `${this.baseUrl}/_matrix/client/v3/login`;
        this.logger.debug(`Attempting Matrix login with v3 API: ${loginUrlV3}`);

        loginResponse = await axios.post(loginUrlV3, {
          type: 'm.login.password',
          identifier: {
            type: 'm.id.user',
            user: username,
          },
          password,
          device_id: this.defaultDeviceId,
          initial_device_display_name: this.defaultInitialDeviceDisplayName,
        });
      }

      this.logger.debug('Matrix login successful:', {
        status: loginResponse.status,
        userId: loginResponse.data?.user_id,
        deviceId: loginResponse.data?.device_id,
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

          const userClient = sdk.createClient({
            baseUrl: this.baseUrl,
            userId,
            accessToken,
            deviceId,
            useAuthorizationHeader: true,
          });

          // Just use the client for this one operation without syncing
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
   * Create a new Matrix room
   */
  async createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
    const {
      name,
      topic,
      isPublic = false,
      isDirect = false,
      inviteUserIds = [],
      powerLevelContentOverride,
    } = options;

    const client = await this.clientPool.acquire();

    try {
      // Power levels will be set during room creation
      // and are inherited from server defaults

      this.logger.debug(
        `Creating room "${name}" with admin user ${this.adminUserId}`,
      );

      // Try without power level overrides
      const createRoomResponse = await client.client.createRoom({
        name,
        topic,
        visibility: isPublic ? sdk.Visibility.Public : sdk.Visibility.Private,
        preset: isPublic ? sdk.Preset.PublicChat : sdk.Preset.PrivateChat,
        is_direct: isDirect,
        invite: inviteUserIds,
        // Omit power_level_content_override to use Matrix defaults
        // power_level_content_override: undefined,
        initial_state: [
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
        ],
      });

      // Get room details
      const roomId = createRoomResponse.room_id;

      // Now that the room is created, set power levels for the creator if specified
      if (powerLevelContentOverride && powerLevelContentOverride.users) {
        try {
          // Get current power levels
          const currentPowerLevels = await client.client.getStateEvent(
            roomId,
            'm.room.power_levels' as any,
            '',
          );

          // Update with user-specific power levels, keeping Matrix defaults
          const updatedPowerLevels = {
            ...currentPowerLevels,
            users: {
              ...currentPowerLevels.users,
              ...powerLevelContentOverride.users,
            },
          };

          this.logger.debug(
            `Setting power levels for room ${roomId}: ${JSON.stringify(updatedPowerLevels)}`,
          );

          // Update the power levels
          await client.client.sendStateEvent(
            roomId,
            'm.room.power_levels' as any,
            updatedPowerLevels,
            '',
          );
        } catch (err) {
          this.logger.warn(
            `Failed to set power levels for room ${roomId}: ${err.message}`,
          );
          // Non-fatal error, room is still created
        }
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
      await this.clientPool.release(client);
    }
  }

  /**
   * Invite a user to a room
   */
  async inviteUser(options: InviteUserOptions): Promise<void> {
    const { roomId, userId } = options;

    const client = await this.clientPool.acquire();

    try {
      await client.client.invite(roomId, userId);
    } catch (error) {
      this.logger.error(
        `Error inviting user ${userId} to room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to invite user to Matrix room: ${error.message}`);
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Remove a user from a room
   */
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    const client = await this.clientPool.acquire();

    try {
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
      await this.clientPool.release(client);
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

      // Create a temporary client for the user
      const tempClient = sdk.createClient({
        baseUrl: this.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || this.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      // Join the room
      await tempClient.joinRoom(roomId);

      // Get current display name
      try {
        // Get the profile info directly from the client
        const profile = await tempClient.getProfileInfo(userId);
        this.logger.debug(
          `Current display name for ${userId}: ${profile?.displayname || 'Not set'}`,
        );

        // Check if display name is the Matrix ID and clear it if it is
        // This will force the client to refresh/fetch the display name
        if (!profile?.displayname || profile.displayname.startsWith('@om_')) {
          this.logger.debug(`Clearing client display name cache for ${userId}`);
          // This is a hack to force the client to refresh the display name
          // by clearing the internal cache
          if (tempClient.getClientWellKnown) {
            tempClient.getClientWellKnown();
          }
        }
      } catch (profileError) {
        this.logger.warn(
          `Error getting profile for ${userId}: ${profileError.message}`,
        );
        // Not critical, continue
      }

      this.logger.debug(`User ${userId} successfully joined room ${roomId}`);
    } catch (error) {
      this.logger.error(
        `Error joining room ${roomId} as user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to join Matrix room: ${error.message}`);
    }
  }

  /**
   * Set a user's display name in Matrix using the SDK
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

      // Create a temporary client for the user
      const tempClient = sdk.createClient({
        baseUrl: this.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || this.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      // Set the display name using the SDK
      await tempClient.setDisplayName(displayName);

      this.logger.debug(`Successfully set display name for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error setting display name for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to set Matrix display name: ${error.message}`);
    }
  }

  /**
   * Get a user's display name from Matrix
   */
  async getUserDisplayName(userId: string): Promise<string | null> {
    try {
      const client = await this.clientPool.acquire();

      try {
        this.logger.debug(`Getting display name for user ${userId}`);

        // Get the profile info
        const response = await client.client.getProfileInfo(
          userId,
          'displayname',
        );

        return response?.displayname || null;
      } finally {
        await this.clientPool.release(client);
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
   * Start a client for a specific user and register for events
   */
  // This method is replaced by the startClient implementation at line ~1162
  private async startClientWithEvents(
    options: StartClientOptions,
  ): Promise<void> {
    const { userId, accessToken, deviceId } = options;

    // Check if client is already active
    if (this.activeClients.has(userId)) {
      const existingClient = this.activeClients.get(userId);

      if (existingClient) {
        // Update last activity timestamp
        existingClient.lastActivity = new Date();

        // Client is already running, just update activity timestamp
        this.logger.debug(
          `Matrix client for user ${userId} is already active, updating activity timestamp`,
        );
      }
      return;
    }

    try {
      this.logger.log(`Starting Matrix client for user ${userId}`);

      // Create a new Matrix client instance for this user
      const client = sdk.createClient({
        baseUrl: this.baseUrl,
        userId,
        accessToken,
        deviceId: deviceId || this.defaultDeviceId,
        useAuthorizationHeader: true,
      });

      // Set up event handlers before starting the client
      client.on('sync' as any, (state: string, prevState: string) => {
        this.logger.debug(
          `Matrix sync state for user ${userId}: ${prevState} -> ${state}`,
        );

        // When the client is first synced, get initial data
        if (state === 'PREPARED') {
          this.logger.log(`Matrix client for user ${userId} is ready`);

          // Create event object
          const eventObj = {
            type: 'ready',
            userId,
            timestamp: Date.now(),
          };

          // Send via WebSocket if client is connected
          this.sendEventToWebSocket(userId, '', eventObj);
        }
      });

      // Handle room messages
      client.on(
        'Room.timeline' as any,
        (event: sdk.MatrixEvent, room: sdk.Room) => {
          // Skip events that aren't messages
          if (event.getType() !== 'm.room.message') {
            return;
          }

          const sender = event.getSender();
          const isLocalEcho = sender === userId;

          // Log all events for debugging
          this.logger.log(
            `Room.timeline event in ${room.roomId} from ${sender}` + 
            (isLocalEcho ? ' (local echo)' : ''),
            { eventId: event.getId() }
          );

          // Get message content
          const content = event.getContent();

          // Create event object
          const eventObj = {
            type: 'm.room.message',
            room_id: room.roomId,
            event_id: event.getId(),
            sender,
            content,
            origin_server_ts: event.getTs(),
          };

          // Send via WebSocket if client is connected
          this.sendEventToWebSocket(userId, room.roomId, eventObj);
        },
      );

      // Handle typing notifications
      client.on(
        'RoomMember.typing' as any,
        (event: sdk.MatrixEvent, member: sdk.RoomMember) => {
          const roomId = member.roomId;
          const room = client.getRoom(roomId);

          if (!room) {
            return;
          }

          // Get typing users through API since getTypingUsers() doesn't exist
          const typingUserIds = room
            .getJoinedMembers()
            .filter((m) => m.typing)
            .map((m) => m.userId);

          // Create event object
          const eventObj = {
            type: 'm.typing',
            room_id: roomId,
            user_ids: typingUserIds,
          };

          // Send via WebSocket if client is connected
          this.sendEventToWebSocket(userId, roomId, eventObj);
        },
      );

      // Handle read receipts
      client.on(
        'Room.receipt' as any,
        (event: sdk.MatrixEvent, room: sdk.Room) => {
          // Extract read receipt data
          const receiptData = event.getContent();
          const roomId = room.roomId;

          // Create event object
          const eventObj = {
            type: 'm.receipt',
            room_id: roomId,
            content: receiptData,
          };

          // Send via WebSocket if client is connected
          this.sendEventToWebSocket(userId, roomId, eventObj);
        },
      );

      // Start the client with sync enabled
      await client.startClient({ initialSyncLimit: 10 });

      // Store the client in active clients
      this.activeClients.set(userId, {
        client,
        userId, // Include userId per interface
        lastActivity: new Date(),
        eventCallbacks: [], // Initialize empty array for callbacks
      });

      this.logger.log(`Matrix client started for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error starting Matrix client for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to start Matrix client: ${error.message}`);
    }
  }

  /**
   * Send typing notification
   */
  async sendTypingNotification(
    roomId: string,
    userId: string,
    accessToken: string,
    isTyping: boolean,
    deviceId?: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Sending typing notification for user ${userId} in room ${roomId}, typing: ${isTyping}`,
      );

      // Check if we have an active client for this user
      let client: sdk.MatrixClient;

      if (this.activeClients.has(userId)) {
        // Get the active client
        const activeClient = this.activeClients.get(userId);

        if (activeClient) {
          // Use the existing client
          client = activeClient.client;

          // Update last activity timestamp
          activeClient.lastActivity = new Date();
        } else {
          // If activeClient doesn't exist despite the Map saying it should, create a new one
          client = sdk.createClient({
            baseUrl: this.baseUrl,
            userId,
            accessToken,
            deviceId: deviceId || this.defaultDeviceId,
            useAuthorizationHeader: true,
          });
        }
      } else {
        // Create a temporary client
        client = sdk.createClient({
          baseUrl: this.baseUrl,
          userId,
          accessToken,
          deviceId: deviceId || this.defaultDeviceId,
          useAuthorizationHeader: true,
        });
      }

      // Send typing notification
      // The timeout is how long the typing indicator should be shown (in milliseconds)
      // Use 20 seconds for active typing, or 0 for stopped typing
      const timeout = isTyping ? 20000 : 0;

      await client.sendTyping(roomId, isTyping, timeout);

      this.logger.debug(`Typing notification sent successfully`);
    } catch (error) {
      this.logger.error(
        `Error sending typing notification in room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to send typing notification: ${error.message}`);
    }
  }

  /**
   * Set a user's display name in Matrix using direct API call
   * This is a backup method if the SDK method fails
   */
  async setUserDisplayNameDirect(
    userId: string,
    accessToken: string,
    displayName: string,
  ): Promise<void> {
    try {
      this.logger.debug(
        `Setting display name directly for user ${userId} to "${displayName}"`,
      );

      // Encode the user ID for the URL
      const encodedUserId = encodeURIComponent(userId);

      // Make a direct API call to set the display name
      const url = `${this.baseUrl}/_matrix/client/v3/profile/${encodedUserId}/displayname`;

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
    } catch (error) {
      this.logger.error(
        `Error setting display name directly for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to set Matrix display name directly: ${error.message}`,
      );
    }
  }

  /**
   * Send a message to a room
   *
   * If senderUserId is provided, the message will be sent as that user.
   * If senderAccessToken is provided, it will be used instead of getting the user from activeClients.
   */
  async sendMessage(options: SendMessageOptions): Promise<string> {
    const {
      roomId,
      body,
      msgtype = 'm.room.message',
      formatted_body,
      format,
      senderUserId,
      senderAccessToken,
      senderDeviceId,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      relationshipType,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      relationshipEventId,
    } = options;

    try {
      // Create the basic message content
      const content: any = {
        msgtype: 'm.text',
        body,
      };

      // Add formatted content if provided
      if (formatted_body && format) {
        content.format = format;
        content.formatted_body = formatted_body;
      }

      // Removing thread relations entirely for simplified message model
      // We don't use threading in our simplified model
      // Keeping this comment as a placeholder for future reference

      // If a specific sender is provided, try to send as that user
      if (
        senderUserId &&
        (senderAccessToken || this.activeClients.has(senderUserId))
      ) {
        this.logger.debug(`Sending message as user ${senderUserId}`);

        // Use the active client if it exists
        if (this.activeClients.has(senderUserId)) {
          const activeClient = this.activeClients.get(senderUserId);

          if (activeClient) {
            // Update last activity
            activeClient.lastActivity = new Date();

            // Send message with the user's client
            const response = await activeClient.client.sendEvent(
              roomId,
              msgtype,
              content,
              '',
            );

            return response.event_id;
          }
        }

        // If we have an access token but no active client, create a temporary client
        if (senderAccessToken) {
          const tempClient = sdk.createClient({
            baseUrl: this.baseUrl,
            userId: senderUserId,
            accessToken: senderAccessToken,
            deviceId: senderDeviceId || this.defaultDeviceId,
            useAuthorizationHeader: true,
          });

          // Send the message
          const response = await tempClient.sendEvent(
            roomId,
            msgtype,
            content,
            '',
          );

          // We don't need to stop this client since it's not syncing
          return response.event_id;
        }
      }

      // Fall back to using the admin client
      this.logger.debug(`Sending message as admin user ${this.adminUserId}`);
      const client = await this.clientPool.acquire();

      try {
        const response = await client.client.sendEvent(
          roomId,
          msgtype,
          content,
          '',
        );

        return response.event_id;
      } finally {
        await this.clientPool.release(client);
      }
    } catch (error) {
      this.logger.error(
        `Error sending message to room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to send message to Matrix room: ${error.message}`,
      );
    }
  }

  /**
   * Start a Matrix client for a specific user with real-time sync
   */
  async startClient(options: StartClientOptions): Promise<void> {
    const { userId, accessToken, deviceId, onEvent, onSync, wsClient } =
      options;

    // Check if client already exists
    if (this.activeClients.has(userId)) {
      const existingClient = this.activeClients.get(userId);

      if (existingClient) {
        // Update last activity
        existingClient.lastActivity = new Date();

        // Update WebSocket client if provided
        if (wsClient && !existingClient.wsClient) {
          existingClient.wsClient = wsClient;
          this.logger.log(`Updated WebSocket client for Matrix user ${userId}`);
        }

        // Add new event callback if provided
        if (onEvent && !existingClient.eventCallbacks.includes(onEvent)) {
          existingClient.eventCallbacks.push(onEvent);
          existingClient.client.on('event' as any, onEvent);
        }

        // Add sync callback if provided
        if (onSync) {
          existingClient.client.on('sync' as any, onSync);
        }
      }

      return;
    }

    // Create a new client for this user
    const client = sdk.createClient({
      baseUrl: this.baseUrl,
      userId,
      accessToken,
      deviceId: deviceId || this.defaultDeviceId,
      useAuthorizationHeader: true,
    });

    // Set up event handling
    const eventCallbacks = onEvent ? [onEvent] : [];
    if (onEvent) {
      client.on('event' as any, onEvent);
    }

    // Set up sync handling
    if (onSync) {
      client.on('sync' as any, onSync);
    }

    // Set up Room.timeline event handling for message capturing
    client.on('Room.timeline' as any, (event: sdk.MatrixEvent, room: sdk.Room) => {
      // Skip events that aren't messages
      if (event.getType() !== 'm.room.message') {
        return;
      }

      const sender = event.getSender();
      const roomId = room.roomId;
      const isLocalEcho = sender === userId;
      
      // Keep track of processed event IDs to avoid duplicates
      const eventId = event.getId();
      
      // Don't reprocess the same event from the same user
      const key = `${roomId}:${eventId}:${userId}`;
      
      // Skip if this is a duplicate event
      if (this._processedEvents.has(key)) {
        this.logger.debug(`Skipping duplicate event ${eventId} from ${sender} in room ${roomId}`);
        return;
      }
      
      // Remember that we've processed this event
      this._processedEvents.add(key);
      
      // Clean up old events after 30 seconds to prevent memory leaks
      setTimeout(() => {
        this._processedEvents.delete(key);
      }, 30000);

      // Log all events for debugging
      this.logger.log(
        `Room.timeline event in ${roomId} from ${sender}` + 
        (isLocalEcho ? ' (local echo)' : ''),
        { eventId: eventId, eventType: event.getType() }
      );

      // Get message content
      const content = event.getContent();
      
      // Get the sender's display name 
      let senderName: string | null = null;
      try {
        // Try to get from room member
        if (sender) {
          const member = room.getMember(sender);
          if (member && member.name) {
            senderName = member.name;
            this.logger.debug(`Found sender name from room member: ${senderName}`);
          }
        }
      } catch (e) {
        this.logger.warn(`Could not get sender name from room member: ${e.message}`);
      }

      // Create event object
      const eventObj = {
        type: 'm.room.message',
        room_id: roomId,
        event_id: eventId,
        sender,
        sender_name: senderName, // Include the display name
        content,
        origin_server_ts: event.getTs(),
        timestamp: Date.now(),
      };

      // Send via WebSocket if client is connected
      if (roomId) {
        this.sendEventToWebSocket(userId, roomId, eventObj);
      }
    });

    // Start the client with minimal initial sync
    await client.startClient({ initialSyncLimit: 10 });

    // Store the active client
    this.activeClients.set(userId, {
      client,
      userId,
      lastActivity: new Date(),
      eventCallbacks,
      wsClient
    });

    this.logger.log(`Started Matrix client for user ${userId}`);
  }

  /**
   * Stop a Matrix client for a specific user
   */
  async stopClient(userId: string): Promise<void> {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return;
    }

    // Stop the client - wrap in Promise.resolve to satisfy 'await' requirement
    await Promise.resolve(activeClient.client.stopClient());
    this.activeClients.delete(userId);

    this.logger.log(`Stopped Matrix client for user ${userId}`);
  }

  /**
   * Register an event callback for a specific user's client
   */
  addEventCallback(userId: string, callback: (event: any) => void): boolean {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return false;
    }

    // Add callback if not already registered
    if (!activeClient.eventCallbacks.includes(callback)) {
      activeClient.eventCallbacks.push(callback);
      activeClient.client.on('event' as any, callback);
    }

    // Update last activity
    activeClient.lastActivity = new Date();

    return true;
  }

  /**
   * Remove an event callback for a specific user's client
   */
  removeEventCallback(userId: string, callback: (event: any) => void): boolean {
    const activeClient = this.activeClients.get(userId);
    if (!activeClient) {
      return false;
    }

    // Remove callback if registered
    const index = activeClient.eventCallbacks.indexOf(callback);
    if (index !== -1) {
      activeClient.eventCallbacks.splice(index, 1);
      activeClient.client.removeListener('event' as any, callback);
    }

    // Update last activity
    activeClient.lastActivity = new Date();

    return true;
  }

  /**
   * Get room messages
   * This uses the client's sync state if available, otherwise falls back to REST API
   */
  async getRoomMessages(
    roomId: string,
    limit = 50,
    from?: string,
    userId?: string,
  ): Promise<{
    messages: Message[];
    end: string;
  }> {
    // If userId is provided, try to use their synced client first
    if (userId && this.activeClients.has(userId)) {
      try {
        const activeClient = this.activeClients.get(userId);

        if (activeClient) {
          // Update activity timestamp
          activeClient.lastActivity = new Date();

          // Use the client's timeline if available
          const room = activeClient.client.getRoom(roomId);

          if (room) {
            // Get timeline events from the client's sync data
            const timelineEvents = room.timeline || [];

            const messages = timelineEvents
              .filter((event) => event.getType() === 'm.room.message')
              .slice(-limit)
              .map((event) => ({
                eventId: event.getId() || '', // Ensure never undefined
                roomId,
                sender: event.getSender() || '', // Ensure never undefined
                content: event.getContent(),
                timestamp: event.getTs(),
              }));

            return {
              messages,
              end: '', // No pagination token when using timeline
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          `Error getting room messages from synced client: ${error.message}`,
          error.stack,
        );
        // Fall back to REST API
      }
    }

    // Fall back to REST API for historical messages
    const client = await this.clientPool.acquire();

    try {
      // Use direct API access
      const url = `${this.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`;
      const params = new URLSearchParams({
        dir: 'f',
        limit: limit.toString(),
        ...(from ? { from } : {}),
      });

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${client.client.getAccessToken()}`,
        },
      });

      const messages = response.data.chunk
        .filter((event) => event.type === 'm.room.message')
        .map((event) => ({
          eventId: event.event_id || '', // Ensure never undefined
          roomId: event.room_id || roomId,
          sender: event.sender || '', // Ensure never undefined
          content: event.content,
          timestamp: event.origin_server_ts,
        }));

      return {
        messages,
        end: response.data.end || '',
      };
    } catch (error) {
      this.logger.error(
        `Error getting messages from room ${roomId}: ${error.message}`,
        error.stack,
      );
      throw new Error(
        `Failed to get messages from Matrix room: ${error.message}`,
      );
    } finally {
      await this.clientPool.release(client);
    }
  }

  /**
   * Set room power levels
   */
  async setRoomPowerLevels(
    roomId: string,
    userPowerLevels: Record<string, number>,
  ): Promise<void> {
    const client = await this.clientPool.acquire();

    try {
      // Get current power levels
      const stateEvent = await client.client.getStateEvent(
        roomId,
        'm.room.power_levels' as any,
        '',
      );

      // Update user power levels
      const updatedContent = {
        ...stateEvent,
        users: {
          ...stateEvent.users,
          ...userPowerLevels,
        },
      };

      // Set updated power levels
      // Cast the event type to any to work around TypeScript limitations
      await client.client.sendStateEvent(
        roomId,
        'm.room.power_levels' as any,
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
      await this.clientPool.release(client);
    }
  }

  /**
   * Get the WebSocket endpoint for Matrix events
   */
  getWebSocketEndpoint(): string {
    // Try to get the WebSocket endpoint from environment variable
    const wsEndpoint =
      process.env.MATRIX_WEBSOCKET_ENDPOINT || process.env.API_BASE_URL;

    if (wsEndpoint) {
      // Use the configured WebSocket endpoint
      let endpoint = wsEndpoint;

      // Convert HTTP to WS if needed
      endpoint = endpoint
        .replace(/^http:\/\//i, 'ws://')
        .replace(/^https:\/\//i, 'wss://');

      // Add the matrix namespace
      if (!endpoint.endsWith('/')) {
        endpoint += '/';
      }
      endpoint += 'matrix';

      this.logger.log(`Using configured WebSocket endpoint: ${endpoint}`);
      return endpoint;
    }

    // Fall back to Matrix server URL if no WebSocket endpoint is configured
    // Replace http/https with ws/wss
    let endpoint = this.baseUrl
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://');

    // Add the matrix namespace
    if (!endpoint.endsWith('/')) {
      endpoint += '/';
    }
    endpoint += 'matrix';

    this.logger.log(
      `Using fallback WebSocket endpoint based on Matrix baseUrl: ${endpoint}`,
    );
    return endpoint;
  }

  /**
   * Get rooms for a Matrix user (DEPRECATED: Use getUserRoomsWithClient instead)
   */
  async getUserRooms(userId: string, accessToken: string): Promise<RoomInfo[]> {
    try {
      this.logger.warn(
        'getUserRooms with explicit credentials is deprecated - use getUserRoomsWithClient instead',
      );
      this.logger.log(`Getting rooms for Matrix user: ${userId}`);

      // Note: We're not using the SDK client for this operation
      // We'll use Axios directly to call the REST API

      // Fetch the user's rooms (we can't use the sync API here)
      // For rooms API we need to use the REST API
      try {
        // Use the Matrix client's API to get joined rooms
        const response = await axios.get(
          `${this.baseUrl}/_matrix/client/v3/joined_rooms`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const roomIds = response.data.joined_rooms || [];
        this.logger.log(`Found ${roomIds.length} rooms for user ${userId}`);

        // Get more info about each room
        const rooms: RoomInfo[] = [];

        for (const roomId of roomIds) {
          try {
            // Get room state to get name and topic
            const stateResponse = await axios.get(
              `${this.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.name/`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );

            const roomName = stateResponse.data?.name || roomId;

            // Get room members
            const membersResponse = await axios.get(
              `${this.baseUrl}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/joined_members`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );

            const joinedMembers = Object.keys(
              membersResponse.data?.joined || {},
            );

            rooms.push({
              roomId,
              name: roomName,
              joinedMembers,
            });
          } catch (roomError) {
            this.logger.warn(
              `Error getting details for room ${roomId}: ${roomError.message}`,
            );
            // Still add the room with just its ID
            rooms.push({
              roomId,
              name: roomId,
              joinedMembers: [],
            });
          }
        }

        return rooms;
      } catch (error) {
        this.logger.error(
          `Error getting rooms for user ${userId}: ${error.message}`,
        );
        return [];
      }
    } catch (error) {
      this.logger.error(
        `Failed to get rooms for user ${userId}: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get the rooms for a specific Matrix user using a Matrix client
   * This method uses the provided client to fetch rooms, avoiding
   * sending sensitive credentials over the network.
   */
  async getUserRoomsWithClient(
    matrixClient: sdk.MatrixClient,
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

      // For invited rooms, we'll use a different approach
      // Since the Matrix JS SDK doesn't expose a direct method for invited rooms,
      // we'll skip this for now and only show joined rooms
      this.logger.warn(
        'Fetching invited rooms is not supported in the current implementation',
      );

      // Note: To properly implement this, we would need to:
      // 1. Use the Matrix REST API directly (not through the SDK)
      // 2. Make a direct HTTP call to /_matrix/client/v3/sync with filter for invited rooms
      // 3. Process the response manually

      // For now, we'll just return the joined rooms we have

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

  // Set to track processed events to avoid duplicates
  private _processedEvents = new Set<string>();

  /**
   * Send Matrix event to connected WebSocket clients
   */
  private sendEventToWebSocket(
    userId: string,
    roomId: string,
    event: any,
  ): void {
    try {
      // Enhanced logging to debug the path events take
      this.logger.log(`Matrix event from ${userId} for room ${roomId}, event type: ${event.type}`, {
        eventId: event.event_id || 'unknown',
        sender: event.sender || 'unknown',
      });
      
      // Skip if no room ID or gateway
      if (!roomId || !this.matrixGateway) {
        if (roomId) {
          this.logger.warn(`Cannot broadcast to room ${roomId} - gateway not available`);
        }
        return;
      }
      
      // Check for duplicate broadcasts at the service level
      // Create a unique event identifier
      const eventId = event.event_id || event.id || 'unknown';
      const broadcastKey = `${roomId}:${eventId}`;
      
      // Don't broadcast the same event twice
      if (eventId !== 'unknown' && this._processedEvents.has(broadcastKey)) {
        this.logger.debug(`Skipping duplicate broadcast of event ${eventId} to room ${roomId}`);
        return;
      }
      
      // Remember this event for 30 seconds to prevent duplicates
      if (eventId !== 'unknown') {
        this._processedEvents.add(broadcastKey);
        setTimeout(() => {
          this._processedEvents.delete(broadcastKey);
        }, 30000);
      }
      
      // Use the gateway to broadcast to all clients in the room
      this.logger.log(`Broadcasting Matrix event to room ${roomId}, event ID: ${eventId}`);
      
      // Make sure event has all required fields
      if (!event.timestamp) {
        event.timestamp = Date.now();
      }
      
      // If sender_name is not already set, try to get the display name for this sender
      if (!event.sender_name && event.sender) {
        try {
          // Just use Matrix ID parsing for sender_name
          // Matrix display names should be set correctly when users register
          const senderStr = event.sender;
          if (senderStr.startsWith('@om_')) {
            // Extract ULID from OpenMeet Matrix ID
            const userRef = senderStr.split(':')[0].substring(4);
            event.sender_name = `OpenMeet User`;  // More generic display name
          } else {
            event.sender_name = senderStr.split(':')[0].substring(1);
          }
          this.logger.debug(`Set sender_name "${event.sender_name}" for ${event.sender}`);
          
          // Try to get actual display name in background to update for next message
          this.getUserDisplayName(event.sender)
            .then(displayName => {
              if (displayName) {
                this.logger.debug(`Found Matrix display name for ${event.sender}: ${displayName}`);
              }
            })
            .catch(err => {
              this.logger.warn(`Error fetching display name for ${event.sender}: ${err.message}`);
            });
        } catch (err) {
          this.logger.warn(`Error setting sender name for ${event.sender}: ${err.message}`);
        }
      }
      
      // Broadcast to all clients in the room
      this.matrixGateway.broadcastRoomEvent(roomId, event);
    } catch (error) {
      this.logger.error(`Error sending event to WebSocket: ${error.message}`, error.stack);
    }
  }
}
