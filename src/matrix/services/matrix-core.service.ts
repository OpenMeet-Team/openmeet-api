import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pool from 'generic-pool';
import axios from 'axios';
import { MatrixConfig } from '../config/matrix-config.type';
import { IMatrixClient, IMatrixSdk } from '../types/matrix.interfaces';
import { MatrixClientWithContext } from '../types/matrix.types';

@Injectable()
export class MatrixCoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatrixCoreService.name);
  private adminClient: IMatrixClient;
  private readonly baseUrl: string;
  private readonly serverName: string;
  private readonly defaultDeviceId: string;
  private readonly defaultInitialDeviceDisplayName: string;
  // Not readonly so we can correct it if token doesn't match configured user
  private adminUserId: string;
  // Not readonly so we can update it when regenerated
  private adminAccessToken: string;

  // Connection pool for admin API operations
  private clientPool: pool.Pool<MatrixClientWithContext>;

  // The Matrix SDK - we'll load it dynamically to handle ESM/CJS compatibility
  private matrixSdk: IMatrixSdk = {
    createClient: (_options: any) => {
      throw new Error('Matrix SDK not yet initialized');
    },
    Visibility: {
      Public: 'public',
      Private: 'private',
    },
    Preset: {
      PublicChat: 'public_chat',
      PrivateChat: 'private_chat',
      TrustedPrivateChat: 'trusted_private_chat',
    },
    Direction: {
      Forward: 'f',
      Backward: 'b',
    },
  };

  constructor(private readonly configService: ConfigService) {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    if (!matrixConfig) {
      this.logger.warn(
        'Matrix configuration is missing - Matrix functionality will be limited',
      );
      // Set defaults for required fields to prevent crashes
      const serverName = process.env.MATRIX_SERVER_NAME || 'openmeet.net';
      const baseUrl =
        process.env.MATRIX_BASE_URL ||
        process.env.MATRIX_SERVER_URL ||
        `https://matrix-dev.${serverName}`;

      this.logger.log(
        `Using Matrix server name: ${serverName} with base URL: ${baseUrl}`,
      );

      // Set default configuration
      this.baseUrl = baseUrl;
      const adminUsername = process.env.MATRIX_ADMIN_USERNAME || 'admin';
      this.adminUserId = `@${adminUsername}:${serverName}`;
      this.serverName = serverName;
      this.defaultDeviceId = 'OPENMEET_SERVER';
      this.defaultInitialDeviceDisplayName = 'OpenMeet Server';
      // Initialize with empty token, will be generated in onModuleInit
      this.adminAccessToken = '';
      return; // Skip logging
    }

    this.baseUrl = matrixConfig.baseUrl;
    // Always construct the full matrix ID for the admin user
    const adminUsername = matrixConfig.adminUser;
    this.adminUserId = `@${adminUsername}:${matrixConfig.serverName}`;
    this.serverName = matrixConfig.serverName;
    this.defaultDeviceId = matrixConfig.defaultDeviceId;
    this.defaultInitialDeviceDisplayName =
      matrixConfig.defaultInitialDeviceDisplayName;
    // Initialize with token from config or empty string, will be generated if empty
    this.adminAccessToken = matrixConfig.adminAccessToken || '';

    this.logger.log('Matrix core service initialized with configuration');
  }

  async onModuleInit() {
    try {
      // Dynamically import the matrix-js-sdk
      await this.loadMatrixSdk();

      // Generate admin token if not provided
      if (!this.adminAccessToken) {
        this.logger.log('No admin token provided, generating a new one');
        const newToken = await this.regenerateAdminAccessToken();
        if (!newToken) {
          throw new Error('Failed to generate initial admin token');
        }
        // Token is now set in this.adminAccessToken by regenerateAdminAccessToken
      }

      // Create admin client
      this.createAdminClient();

      // Verify admin access
      await this.verifyAdminAccess();

      // Verify admin access
      await this.verifyAdminAccess();

      // Initialize client pool
      this.initializeClientPool();

      this.logger.log(
        `Matrix core service initialized with admin user ${this.adminUserId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to initialize Matrix core service: ${error.message}`,
        error.stack,
      );
      this.logger.warn(
        'Matrix admin access may be limited - user provisioning might fail',
      );
      // Continue without throwing to allow the service to start
    }
  }

  /**
   * Regenerate admin access token using admin password
   * This method is public to allow external components to request token regeneration
   */
  public async regenerateAdminAccessToken(): Promise<string | null> {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    // Password is now required in the config
    const adminPassword = matrixConfig?.adminPassword;
    if (!adminPassword) {
      this.logger.error(
        'Cannot regenerate admin token: admin password not configured',
      );
      throw new Error('MATRIX_ADMIN_PASSWORD is required for token generation');
    }

    try {
      // Extract username without domain part for login
      const usernameOnly = this.adminUserId.startsWith('@')
        ? this.adminUserId.split(':')[0].substring(1)
        : this.adminUserId;

      this.logger.log(`Generating admin token for user: ${usernameOnly}`);

      // Use Matrix login API to get a new token
      const loginUrl = `${this.baseUrl}/_matrix/client/v3/login`;
      
      // Debug the request data
      const requestData = {
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: usernameOnly,
        },
        password: adminPassword,
        device_id: this.defaultDeviceId,
        initial_device_display_name: this.defaultInitialDeviceDisplayName,
      };
      
      this.logger.debug(`Matrix login request URL: ${loginUrl}`);
      this.logger.debug(`Matrix login request data: ${JSON.stringify({
        ...requestData,
        password: '******' // Don't log the actual password
      })}`);

      const response = await axios.post(loginUrl, requestData);

      if (response.data && response.data.access_token) {
        const newToken = response.data.access_token;
        // Update the admin token in memory
        this.adminAccessToken = newToken;

        this.logger.log(
          `Successfully generated admin token for ${usernameOnly}`,
        );

        // Recreate admin client with new token
        this.createAdminClient();

        return newToken;
      } else {
        this.logger.error(
          'Failed to generate admin token: unexpected response format',
        );
        return null;
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate admin token: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * Verify the admin token has admin privileges
   */
  private async verifyAdminAccess(): Promise<void> {
    try {
      // Use whoami endpoint to verify token works at all
      const whoamiUrl = `${this.baseUrl}/_matrix/client/v3/account/whoami`;

      this.logger.debug(`Verifying admin token with: ${whoamiUrl}`);
      this.logger.debug(`Using admin user ID: ${this.adminUserId}`);
      this.logger.debug(
        `Using admin token: ${this.adminAccessToken ? this.adminAccessToken.substring(0, 6) + '...' : 'null'}`,
      );

      let response;
      try {
        response = await axios.get(whoamiUrl, {
          headers: {
            Authorization: `Bearer ${this.adminAccessToken}`,
          },
        });
      } catch (whoamiError) {
        // If the token is invalid, try to regenerate it
        this.logger.warn(
          `Admin token verification failed: ${whoamiError.message}. Attempting to regenerate.`,
        );

        const newToken = await this.regenerateAdminAccessToken();
        if (!newToken) {
          this.logger.error(
            'Failed to regenerate admin token. User provisioning may fail.',
          );
          throw whoamiError;
        }

        // Try again with the new token
        response = await axios.get(whoamiUrl, {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        });

        this.logger.log(
          'Successfully verified admin access with regenerated token',
        );
      }

      if (response.data && response.data.user_id) {
        this.logger.log(
          `Matrix token verified for user: ${response.data.user_id}`,
        );

        // Check if this is actually the expected admin user
        if (response.data.user_id !== this.adminUserId) {
          this.logger.warn(
            `Token belongs to ${response.data.user_id}, not configured admin ${this.adminUserId}`,
          );
          // Update the admin user ID to match actual token
          this.adminUserId = response.data.user_id;
        }

        // Try multiple admin endpoints to verify privileges

        // Try v2 admin API first
        try {
          const adminUrlV2 = `${this.baseUrl}/_synapse/admin/v2/users?from=0&limit=1`;
          await axios.get(adminUrlV2, {
            headers: {
              Authorization: `Bearer ${this.adminAccessToken}`,
            },
          });

          this.logger.log(
            'Successfully verified Matrix admin privileges using v2 API',
          );
        } catch (adminV2Error) {
          this.logger.debug(
            `Admin v2 API check failed: ${adminV2Error.message}`,
          );

          // Try v1 admin endpoint
          try {
            const adminUrlV1 = `${this.baseUrl}/_synapse/admin/v1/users/${encodeURIComponent(this.adminUserId)}/admin`;
            await axios.get(adminUrlV1, {
              headers: {
                Authorization: `Bearer ${this.adminAccessToken}`,
              },
            });

            this.logger.log(
              'Successfully verified Matrix admin privileges using v1 API',
            );
          } catch (adminV1Error) {
            this.logger.warn(
              'Admin privilege checks failed, trying server info endpoint',
            );

            // Try server info endpoint as last resort
            try {
              const serverInfoUrl = `${this.baseUrl}/_synapse/admin/v1/server_version`;
              const serverInfoResponse = await axios.get(serverInfoUrl, {
                headers: {
                  Authorization: `Bearer ${this.adminAccessToken}`,
                },
              });

              if (serverInfoResponse.status === 200) {
                this.logger.log(
                  'Successfully verified Matrix admin access using server info API',
                );
              }
            } catch (serverInfoError) {
              this.logger.warn(
                'All admin endpoint checks failed, user provisioning might be limited',
                {
                  v2Error: adminV2Error.message,
                  v1Error: adminV1Error.message,
                  serverInfoError: serverInfoError.message,
                },
              );
            }
          }
        }
      } else {
        this.logger.warn(
          'Unexpected whoami response format - admin access uncertain',
        );
      }
    } catch (error) {
      this.logger.error(
        `Matrix admin token verification failed: ${error.message}`,
        {
          status: error.response?.status,
          data: error.response?.data,
        },
      );
      this.logger.warn(
        'Matrix admin token may not be valid - user provisioning might fail',
      );
    }
  }

  async onModuleDestroy() {
    try {
      // Stop the admin client
      if (this.adminClient?.stopClient) {
        this.adminClient.stopClient();
      }

      // Drain and clear connection pool
      if (this.clientPool) {
        await this.clientPool.drain();
        await this.clientPool.clear();
      }

      this.logger.log('Matrix core service destroyed');
    } catch (error) {
      this.logger.error(
        `Error destroying Matrix core service: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Dynamically load the Matrix SDK to handle ESM/CJS compatibility
   */
  private async loadMatrixSdk(): Promise<void> {
    try {
      let sdk;
      try {
        // First try regular require for Node.js CJS environment
        const requireFn = new Function(
          'modulePath',
          'return require(modulePath)',
        );
        sdk = requireFn('matrix-js-sdk');
        this.logger.log('Successfully loaded Matrix SDK via CommonJS require');
      } catch (cjsError) {
        // If CJS import fails, try ESM dynamic import as fallback
        this.logger.warn(
          `CommonJS require failed: ${cjsError.message}, trying ESM import`,
        );
        sdk = await import('matrix-js-sdk');
        this.logger.log(
          'Successfully loaded Matrix SDK via ESM dynamic import',
        );
      }

      // Assign the SDK functions to our interface
      this.matrixSdk.createClient = sdk.createClient;

      // Ensure constants are properly set
      if (sdk.Visibility) this.matrixSdk.Visibility = sdk.Visibility;
      if (sdk.Preset) this.matrixSdk.Preset = sdk.Preset;
      if (sdk.Direction) this.matrixSdk.Direction = sdk.Direction;

      this.logger.log('Matrix SDK loaded successfully');
    } catch (error) {
      this.logger.error(
        `Failed to load Matrix SDK: ${error.message}`,
        error.stack,
      );
      this.createMockSdk();
    }
  }

  /**
   * Create a mock SDK if loading fails to prevent crashes
   */
  private createMockSdk(): void {
    this.logger.warn('Creating mock Matrix SDK to allow application to start');

    this.matrixSdk.createClient = (options) => {
      this.logger.warn(
        'Using mock Matrix client - Matrix functionality will be limited',
      );
      return {
        // Minimal mock methods to prevent crashes
        startClient: () => Promise.resolve(),
        stopClient: () => Promise.resolve(),
        sendEvent: () =>
          Promise.resolve({
            event_id: `mock-event-${Date.now()}`,
          }),
        getStateEvent: () => Promise.resolve({}),
        sendStateEvent: () => Promise.resolve({}),
        invite: () => Promise.resolve(),
        kick: () => Promise.resolve(),
        joinRoom: () => Promise.resolve(),
        getProfileInfo: () => Promise.resolve({ displayname: 'Mock User' }),
        setDisplayName: () => Promise.resolve(),
        getJoinedRooms: () => Promise.resolve({ joined_rooms: [] }),
        getRoom: () => null,
        getAccessToken: () => '',
        getUserId: () => options?.userId || '@mock-user:example.org',
        on: () => {},
        removeListener: () => {},
        roomState: () => Promise.resolve([]),
        sendTyping: () => Promise.resolve(),
        // Add the missing createRoom method to match the IMatrixClient interface
        createRoom: () =>
          Promise.resolve({
            room_id: `mock-room-${Date.now()}`,
          }),
      };
    };
  }

  /**
   * Create the admin client for privileged operations
   */
  private createAdminClient(): void {
    this.adminClient = this.matrixSdk.createClient({
      baseUrl: this.baseUrl,
      userId: this.adminUserId,
      accessToken: this.adminAccessToken,
      useAuthorizationHeader: true,
      logger: {
        // Disable verbose HTTP logging from Matrix SDK
        log: () => {},
        info: () => {},
        warn: () => {},
        debug: () => {},
        error: (msg: string) => this.logger.error(msg) // Keep error logs
      }
    });
  }

  /**
   * Initialize the connection pool for Matrix clients
   */
  private initializeClientPool(): void {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    this.clientPool = pool.createPool<MatrixClientWithContext>(
      {
        create: () => {
          const client = this.matrixSdk.createClient({
            baseUrl: this.baseUrl,
            userId: this.adminUserId,
            accessToken: this.adminAccessToken,
            useAuthorizationHeader: true,
            logger: {
              // Disable verbose HTTP logging from Matrix SDK
              log: () => {},
              info: () => {},
              warn: () => {},
              debug: () => {},
              error: (msg: string) => this.logger.error(msg) // Keep error logs
            }
          });

          return Promise.resolve({
            client,
            userId: this.adminUserId,
          });
        },
        destroy: async (clientWithContext) => {
          if (clientWithContext.client?.stopClient) {
            clientWithContext.client.stopClient();
          }
          return Promise.resolve();
        },
      },
      {
        max: matrixConfig?.connectionPoolSize || 10,
        min: 2,
        acquireTimeoutMillis: matrixConfig?.connectionPoolTimeout || 30000,
        idleTimeoutMillis: 30000,
        evictionRunIntervalMillis: 60000,
      },
    );

    this.logger.log('Matrix client pool initialized');
  }

  /**
   * Get the admin client for privileged operations
   */
  getAdminClient(): IMatrixClient {
    return this.adminClient;
  }

  /**
   * Acquire a client from the connection pool
   * Ensures admin token is valid before returning a client
   */
  async acquireClient(): Promise<MatrixClientWithContext> {
    // Check if token is valid and regenerate if needed
    await this.ensureValidAdminToken();

    // Get a client from the pool
    const client = await this.clientPool.acquire();

    // If the token was regenerated, we need to update the client's token
    // This ensures the client uses the latest token
    if (client.client.getAccessToken() !== this.adminAccessToken) {
      this.logger.debug('Updating client with regenerated admin token');

      // Release the old client
      await this.clientPool.release(client);

      // Drain and clear the pool to ensure all clients use the new token
      await this.clientPool.drain();
      await this.clientPool.clear();

      // Reinitialize the pool with the new token
      this.initializeClientPool();

      // Get a fresh client with the new token
      return this.clientPool.acquire();
    }

    return client;
  }

  /**
   * Release a client back to the connection pool
   */
  async releaseClient(client: MatrixClientWithContext): Promise<void> {
    await this.clientPool.release(client);
  }

  /**
   * Get the Matrix SDK
   */
  getSdk(): IMatrixSdk {
    return this.matrixSdk;
  }

  /**
   * Check if admin token is valid and regenerate if needed
   * This is useful for operations that require admin access
   * @returns True if admin token is valid or was successfully regenerated
   */
  public async ensureValidAdminToken(): Promise<boolean> {
    try {
      // Use whoami endpoint to verify token works
      const whoamiUrl = `${this.baseUrl}/_matrix/client/v3/account/whoami`;

      try {
        await axios.get(whoamiUrl, {
          headers: {
            Authorization: `Bearer ${this.adminAccessToken}`,
          },
        });
        // Token is valid
        return true;
      } catch (whoamiError) {
        this.logger.warn(
          `Admin token appears invalid: ${whoamiError.message}. Attempting to regenerate.`,
        );

        // Try to regenerate the token
        const newToken = await this.regenerateAdminAccessToken();
        if (!newToken) {
          this.logger.error('Failed to regenerate admin token.');
          return false;
        }

        // Token regenerated successfully
        this.logger.log('Admin token regenerated successfully');
        return true;
      }
    } catch (error) {
      this.logger.error(`Error checking admin token: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the Matrix server configuration
   */
  getConfig(): {
    baseUrl: string;
    serverName: string;
    adminUserId: string;
    defaultDeviceId: string;
    defaultInitialDeviceDisplayName: string;
  } {
    return {
      baseUrl: this.baseUrl,
      serverName: this.serverName,
      adminUserId: this.adminUserId,
      defaultDeviceId: this.defaultDeviceId,
      defaultInitialDeviceDisplayName: this.defaultInitialDeviceDisplayName,
    };
  }
}
