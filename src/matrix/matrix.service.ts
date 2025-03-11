import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  // Connection pool for admin API operations
  private clientPool: pool.Pool<MatrixClientWithContext>;

  // Active client instances for real-time events/sync
  private activeClients: Map<string, ActiveClient> = new Map();

  // Interval for cleaning up inactive clients
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
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

    for (const [userId, activeClient] of this.activeClients.entries()) {
      if (activeClient.lastActivity < twoHoursAgo) {
        this.logger.log(
          `Cleaning up inactive Matrix client for user ${userId}`,
        );
        activeClient.client.stopClient();
        this.activeClients.delete(userId);
      }
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
              this.logger.debug(`Trying Matrix admin register endpoint: ${registerUrl}`);
              
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
              
              this.logger.debug('Matrix user registration successful with nonce:', {
                status: registrationResponse.status,
                data: registrationResponse.data,
              });
            } catch (nonceError) {
              // Try using the register endpoint with shared secret
              try {
                const registerUrl = `${this.baseUrl}/_matrix/client/api/v1/register`;
                this.logger.debug(`Trying Matrix client register endpoint: ${registerUrl}`);
                
                // This is the last resort - this might work if admin registration is enabled
                registrationResponse = await axios.post(
                  registerUrl,
                  {
                    user: username,
                    password: password,
                    type: 'm.login.password',
                  }
                );
                
                this.logger.debug('Matrix user registration successful with client API:', {
                  status: registrationResponse.status, 
                  data: registrationResponse.data,
                });
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
      // Define default power levels that can be used for room creation
      const _defaultPowerLevels = {
        users: {
          [this.adminUserId]: 100,
        },
        events: {
          'm.room.name': 50,
          'm.room.power_levels': 100,
          'm.room.history_visibility': 100,
          'm.room.canonical_alias': 50,
          'm.room.avatar': 50,
          'm.room.tombstone': 100,
          'm.room.server_acl': 100,
          'm.room.encryption': 100,
        },
        state_default: 50,
        events_default: 0,
        users_default: 0,
        ban: 50,
        kick: 50,
        redact: 50,
        invite: 50,
      };

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
    deviceId?: string
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
        this.logger.debug(`Current display name for ${userId}: ${profile?.displayname || 'Not set'}`);
        
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
        this.logger.warn(`Error getting profile for ${userId}: ${profileError.message}`);
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
    deviceId?: string
  ): Promise<void> {
    try {
      this.logger.debug(`Setting display name for user ${userId} to "${displayName}"`);
      
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
        const response = await client.client.getProfileInfo(userId, 'displayname');
        
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
   * Set a user's display name in Matrix using direct API call
   * This is a backup method if the SDK method fails
   */
  async setUserDisplayNameDirect(
    userId: string,
    accessToken: string,
    displayName: string
  ): Promise<void> {
    try {
      this.logger.debug(`Setting display name directly for user ${userId} to "${displayName}"`);
      
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
        }
      );
      
      this.logger.debug(`Successfully set display name directly for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Error setting display name directly for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new Error(`Failed to set Matrix display name directly: ${error.message}`);
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
      // Add a relationshipType property to control threading
      relationshipType,
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
      
      // Do NOT add thread relation unless explicitly requested
      // This will prevent automatic threading of messages
      if (relationshipType && relationshipEventId) {
        content['m.relates_to'] = {
          rel_type: relationshipType,
          event_id: relationshipEventId,
        };
      }
      
      // If a specific sender is provided, try to send as that user
      if (senderUserId && (senderAccessToken || this.activeClients.has(senderUserId))) {
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
    const { userId, accessToken, deviceId, onEvent, onSync } = options;

    // Check if client already exists
    if (this.activeClients.has(userId)) {
      const existingClient = this.activeClients.get(userId);

      if (existingClient) {
        // Update last activity
        existingClient.lastActivity = new Date();

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

    // Start the client with minimal initial sync
    await client.startClient({ initialSyncLimit: 10 });

    // Store the active client
    this.activeClients.set(userId, {
      client,
      userId,
      lastActivity: new Date(),
      eventCallbacks,
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
}
