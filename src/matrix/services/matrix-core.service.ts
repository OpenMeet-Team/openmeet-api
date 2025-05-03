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

    // Log actual environment variables for debugging
    this.logger.debug('Matrix environment variables:', {
      MATRIX_HOMESERVER_URL: process.env.MATRIX_HOMESERVER_URL,
      MATRIX_BASE_URL: process.env.MATRIX_BASE_URL,
      MATRIX_SERVER_URL: process.env.MATRIX_SERVER_URL,
      MATRIX_SERVER_NAME: process.env.MATRIX_SERVER_NAME,
      MATRIX_ADMIN_USERNAME: process.env.MATRIX_ADMIN_USERNAME,
    });

    // Always prioritize environment variables over defaults or nestjs config
    const serverName =
      process.env.MATRIX_SERVER_NAME ||
      (matrixConfig?.serverName ? matrixConfig.serverName : 'openmeet.net');

    const baseUrl =
      process.env.MATRIX_HOMESERVER_URL ||
      process.env.MATRIX_BASE_URL ||
      process.env.MATRIX_SERVER_URL ||
      (matrixConfig?.baseUrl
        ? matrixConfig.baseUrl
        : `https://matrix-dev.${serverName}`);

    const adminUsername =
      process.env.MATRIX_ADMIN_USERNAME ||
      (matrixConfig?.adminUser ? matrixConfig.adminUser : 'admin');

    // Log the determined values
    this.logger.log(`Using Matrix configuration:`, {
      serverName,
      baseUrl,
      adminUsername,
    });

    // Set the properties consistently
    this.baseUrl = baseUrl;
    this.serverName = serverName;
    this.adminUserId = `@${adminUsername}:${serverName}`;
    this.defaultDeviceId = matrixConfig?.defaultDeviceId || 'OPENMEET_SERVER';
    this.defaultInitialDeviceDisplayName =
      matrixConfig?.defaultInitialDeviceDisplayName || 'OpenMeet Server';

    // Initialize with token from config or empty string, will be generated if empty
    this.adminAccessToken = matrixConfig?.adminAccessToken || '';
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
      this.logger.error(
        'Matrix functionality will not be available - application may still function with limited features',
      );
      // Continue without throwing to allow the service to start
      // But we won't create a mock SDK - real SDK is required
    }
  }

  // Token regeneration tracking to prevent excessive attempts
  private lastTokenRegenerationAttempt = 0;
  private tokenRegenerationBackoff = 1000; // Start with 1 second

  /**
   * Helper function for implementing delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Regenerate admin access token using admin password
   * This method is public to allow external components to request token regeneration
   * Added rate limit handling with exponential backoff
   */
  public async regenerateAdminAccessToken(): Promise<string | null> {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    // Check if we're trying to regenerate too frequently
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastTokenRegenerationAttempt;

    // If we've attempted recently, enforce a cooldown period
    if (timeSinceLastAttempt < this.tokenRegenerationBackoff) {
      const waitTime = this.tokenRegenerationBackoff - timeSinceLastAttempt;
      this.logger.warn(
        `Rate limiting token regeneration, waiting ${waitTime}ms before retrying`,
      );

      // Wait the required time
      await this.sleep(waitTime);
    }

    // Update the last attempt timestamp
    this.lastTokenRegenerationAttempt = Date.now();

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
      this.logger.debug(
        `Matrix login request data: ${JSON.stringify({
          ...requestData,
          password: '******', // Don't log the actual password
        })}`,
      );

      const response = await axios.post(loginUrl, requestData);

      if (response.data && response.data.access_token) {
        const newToken = response.data.access_token;
        // Update the admin token in memory
        this.adminAccessToken = newToken;

        this.logger.log(
          `Successfully generated admin token for ${usernameOnly}`,
        );

        // Reset backoff on success
        this.tokenRegenerationBackoff = 1000;

        // Recreate admin client with new token
        this.createAdminClient();

        return newToken;
      } else {
        this.logger.error(
          'Failed to generate admin token: unexpected response format',
        );
        // Increase backoff on failure
        this.tokenRegenerationBackoff = Math.min(
          this.tokenRegenerationBackoff * 2,
          60000,
        );
        return null;
      }
    } catch (error) {
      // Log the full error details
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        errorMessage: error.message,
        errorType: error.constructor?.name,
        headers: error.response?.headers,
        stack: error.stack,
      };

      // Special handling for rate limiting errors
      if (error.response && error.response.status === 429) {
        // Get retry time from Matrix response if available
        const retryAfter = error.response.headers['retry-after']
          ? parseInt(error.response.headers['retry-after'], 10) * 1000
          : undefined;

        // Use the Matrix-provided retry time or increase backoff exponentially
        if (retryAfter) {
          this.tokenRegenerationBackoff = retryAfter;
        } else {
          // Double the backoff time for exponential backoff, max 1 minute
          this.tokenRegenerationBackoff = Math.min(
            this.tokenRegenerationBackoff * 2,
            60000,
          );
        }

        this.logger.warn(
          `Matrix rate limit reached (429). Will back off for ${this.tokenRegenerationBackoff}ms before next token attempt`,
          errorDetails,
        );
      } else {
        // For non-rate-limit errors, still increase backoff but log as error
        this.tokenRegenerationBackoff = Math.min(
          this.tokenRegenerationBackoff * 2,
          30000,
        );
        this.logger.error(
          `Failed to generate admin token: ${error.message}`,
          errorDetails,
        );
      }
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
      this.logger.log('Attempting to dynamically import Matrix SDK');

      // Important: Use string literal to prevent TS from transforming this import
      // NestJS compiles this to CommonJS, but matrix-js-sdk is ESM

      const sdk = await new Function('return import("matrix-js-sdk")')();

      this.logger.log('Successfully loaded Matrix SDK via dynamic import');

      // Verify SDK was loaded successfully
      if (!sdk || !sdk.createClient) {
        throw new Error('Matrix SDK loaded but createClient method is missing');
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
      throw new Error(`Matrix SDK failed to load: ${error.message}`);
    }
  }

  // No mock SDK implementation - we will require the real SDK to work properly

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
        error: (msg: string) => this.logger.error(msg), // Keep error logs
      },
    });
  }

  /**
   * Initialize the connection pool for Matrix clients
   */
  private initializeClientPool(): void {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    // Verify SDK is loaded and createClient method is available
    if (!this.matrixSdk || typeof this.matrixSdk.createClient !== 'function') {
      this.logger.error(
        'Cannot initialize client pool: Matrix SDK not properly loaded',
      );
      throw new Error('Matrix SDK not properly initialized');
    }

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
              error: (msg: string) => this.logger.error(msg), // Keep error logs
            },
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
    // Maximum number of token validation retries
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let tokenValid = false;

    // Try to validate/regenerate token with retries and backoff
    while (retryCount < MAX_RETRIES && !tokenValid) {
      if (retryCount > 0) {
        // If this is a retry attempt, add some backoff delay
        const backoffTime = Math.pow(2, retryCount) * 500; // Exponential backoff
        this.logger.debug(
          `Retry ${retryCount}/${MAX_RETRIES}: backing off for ${backoffTime}ms`,
        );
        await this.sleep(backoffTime);
      }

      // Check if token is valid and regenerate if needed
      tokenValid = await this.ensureValidAdminToken();

      if (!tokenValid) {
        this.logger.warn(
          `Token validation attempt ${retryCount + 1} failed, ${MAX_RETRIES - retryCount - 1} retries left`,
        );
      }

      retryCount++;
    }

    // If we still don't have a valid token after retries, but have admin token string,
    // continue anyway and hope for the best - the operation might still work
    if (!tokenValid && this.adminAccessToken) {
      this.logger.warn(
        'Proceeding with potentially invalid token after max retries',
      );
    } else if (!tokenValid) {
      this.logger.error('Failed to obtain valid token after max retries');
      throw new Error(
        'Unable to acquire Matrix client: token validation failed',
      );
    }

    // Verify client pool is initialized
    if (!this.clientPool) {
      this.logger.warn('Client pool not initialized, attempting to initialize');
      try {
        this.initializeClientPool();
      } catch (error) {
        this.logger.error(
          `Failed to initialize client pool on demand: ${error.message}`,
          error.stack,
        );
        throw new Error(
          'Matrix client pool not available: SDK initialization failed',
        );
      }

      // Double-check after attempted initialization
      if (!this.clientPool) {
        throw new Error('Matrix client pool could not be initialized');
      }
    }

    try {
      // Get a client from the pool
      const client = await this.clientPool.acquire();

      // If the token was regenerated, we need to update the client's token
      // This ensures the client uses the latest token
      if (client.client.getAccessToken() !== this.adminAccessToken) {
        this.logger.debug('Updating client with regenerated admin token');

        try {
          // Release the old client
          await this.clientPool.release(client);
        } catch (releaseError) {
          this.logger.warn(
            `Failed to release Matrix client: ${releaseError.message}`,
          );
          // Continue anyway - we'll create a new client
        }

        // Create a new client with the updated token
        const newClient = this.matrixSdk.createClient({
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
            error: (msg: string) => this.logger.error(msg), // Keep error logs
          },
        });

        // Return the new client directly instead of reinitializing the pool
        return {
          client: newClient,
          userId: this.adminUserId,
        };
      }

      return client;
    } catch (error) {
      this.logger.error(`Failed to acquire Matrix client: ${error.message}`);

      // Last resort - create a new client outside the pool
      // This helps recover from pool issues
      const emergencyClient = this.matrixSdk.createClient({
        baseUrl: this.baseUrl,
        userId: this.adminUserId,
        accessToken: this.adminAccessToken,
        useAuthorizationHeader: true,
        logger: {
          log: () => {},
          info: () => {},
          warn: () => {},
          debug: () => {},
          error: (msg: string) => this.logger.error(msg),
        },
      });

      this.logger.warn('Created emergency Matrix client outside pool');

      return {
        client: emergencyClient,
        userId: this.adminUserId,
      };
    }
  }

  /**
   * Release a client back to the connection pool
   */
  async releaseClient(client: MatrixClientWithContext): Promise<void> {
    if (!this.clientPool) {
      this.logger.warn(
        'Attempted to release client but pool is not initialized',
      );
      return;
    }
    await this.clientPool.release(client);
  }

  /**
   * Get the Matrix SDK
   */
  getSdk(): IMatrixSdk {
    return this.matrixSdk;
  }

  // Used to prevent too frequent token checks
  private lastTokenValidityCheck = 0;
  private tokenValidityCache: { valid: boolean; timestamp: number } | null =
    null;
  private readonly TOKEN_VALIDITY_CACHE_TTL = 30000; // 30 seconds

  /**
   * Check if admin token is valid and regenerate if needed
   * This is useful for operations that require admin access
   * @returns True if admin token is valid or was successfully regenerated
   */
  public async ensureValidAdminToken(): Promise<boolean> {
    try {
      const now = Date.now();

      // Use cached token validity if available and recent
      if (
        this.tokenValidityCache &&
        now - this.tokenValidityCache.timestamp < this.TOKEN_VALIDITY_CACHE_TTL
      ) {
        return this.tokenValidityCache.valid;
      }

      // Throttle validity checks to avoid overwhelming the Matrix server
      const timeSinceLastCheck = now - this.lastTokenValidityCheck;
      if (timeSinceLastCheck < 500) {
        // At most 2 checks per second
        this.logger.debug('Token check throttled, using last known state');
        return this.tokenValidityCache?.valid || false;
      }

      this.lastTokenValidityCheck = now;

      // Use whoami endpoint to verify token works
      const whoamiUrl = `${this.baseUrl}/_matrix/client/v3/account/whoami`;

      try {
        await axios.get(whoamiUrl, {
          headers: {
            Authorization: `Bearer ${this.adminAccessToken}`,
          },
        });

        // Token is valid, update cache
        this.tokenValidityCache = { valid: true, timestamp: now };
        return true;
      } catch (whoamiError) {
        // Log detailed error info
        this.logger.warn(
          `Admin token appears invalid: ${whoamiError.message}. Attempting to regenerate.`,
          {
            status: whoamiError.response?.status,
            data: whoamiError.response?.data,
            error: whoamiError.toString(),
            stack: whoamiError.stack,
          },
        );

        // Try to regenerate the token with built-in rate limit handling
        const newToken = await this.regenerateAdminAccessToken();
        if (!newToken) {
          this.logger.error(
            'Failed to regenerate admin token - continuing without valid token',
          );
          this.tokenValidityCache = { valid: false, timestamp: now };
          return false;
        }

        // Token regenerated successfully
        this.logger.debug('Updating client with regenerated admin token');
        this.tokenValidityCache = { valid: true, timestamp: now };
        return true;
      }
    } catch (error) {
      this.logger.error(`Error checking admin token: ${error.message}`);
      this.tokenValidityCache = { valid: false, timestamp: Date.now() };
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
