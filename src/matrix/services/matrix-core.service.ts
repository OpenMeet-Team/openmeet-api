import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as pool from 'generic-pool';
import { MatrixConfig } from '../config/matrix-config.type';
import { IMatrixClient, IMatrixSdk } from '../types/matrix.interfaces';
import { MatrixClientWithContext } from '../types/matrix.types';
import { MatrixTokenManagerService } from './matrix-token-manager.service';

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

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenManager: MatrixTokenManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {
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

    // We'll get the adminAccessToken from the token manager during initialization
    this.adminAccessToken = '';
  }

  async onModuleInit() {
    try {
      // Dynamically import the matrix-js-sdk
      await this.loadMatrixSdk();

      // Get the admin token from the token manager
      this.adminAccessToken = this.tokenManager.getAdminToken();

      if (!this.adminAccessToken) {
        this.logger.warn(
          'No admin token available from token manager, waiting for regeneration',
        );
        // Force token regeneration and wait for it to complete
        const success = await this.tokenManager.forceTokenRegeneration();
        if (!success) {
          this.logger.error('Failed to generate initial admin token');
        } else {
          // Get the newly generated token
          this.adminAccessToken = this.tokenManager.getAdminToken();
        }
      }

      // Create admin client
      this.createAdminClient();

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

  /**
   * Helper function for implementing delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Removed verifyAdminAccess method as it's now handled by the token manager

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
   * Get the event emitter for Matrix-related events
   * Used for system-wide notifications about token refreshes, etc.
   */
  getEventEmitter(): EventEmitter2 {
    return this.eventEmitter;
  }

  /**
   * Acquire a client from the connection pool
   * Ensures admin token is valid before returning a client
   */
  async acquireClient(): Promise<MatrixClientWithContext> {
    // Check if we have a valid token
    const tokenValid = await this.ensureValidAdminToken();

    // If token is not valid, get the current token from the token manager
    // This could happen if the token was recently regenerated by the token manager
    if (!tokenValid) {
      this.logger.debug('Token not valid, getting latest from token manager');
      this.adminAccessToken = this.tokenManager.getAdminToken();

      // Report the invalid token to trigger background regeneration
      this.tokenManager.reportTokenInvalid();
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
      // If the token has been regenerated, we need to recreate the pool
      // to ensure all new clients use the correct token
      const poolClient = await this.clientPool.acquire();
      if (poolClient.client.getAccessToken() !== this.adminAccessToken) {
        this.logger.warn('Token has changed, reinitializing the client pool');

        try {
          // Release this client
          await this.clientPool.release(poolClient);

          // Drain and clear the pool
          await this.clientPool.drain();
          await this.clientPool.clear();

          // Reinitialize with new token
          this.initializeClientPool();

          // Get a fresh client from the reinitialized pool
          return await this.clientPool.acquire();
        } catch (error) {
          this.logger.error(
            `Error reinitializing client pool: ${error.message}`,
          );
          throw new Error(
            `Failed to reinitialize client pool: ${error.message}`,
          );
        }
      }

      return poolClient;
    } catch (error) {
      // Check if this is a token error
      if (
        error.message?.includes('M_UNKNOWN_TOKEN') ||
        error.data?.errcode === 'M_UNKNOWN_TOKEN' ||
        error.response?.data?.errcode === 'M_UNKNOWN_TOKEN'
      ) {
        // Report the invalid token to trigger regeneration
        this.tokenManager.reportTokenInvalid();
        this.logger.warn(
          `Token error detected: ${error.message}, reported to token manager`,
        );
      }

      this.logger.error(`Failed to acquire Matrix client: ${error.message}`);
      throw new Error(`Cannot acquire Matrix client: ${error.message}`);
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

    try {
      await this.clientPool.release(client);
    } catch (error) {
      this.logger.warn(`Failed to release Matrix client: ${error.message}`);

      // Attempt to stop the client gracefully even if we can't release it
      if (client?.client?.stopClient) {
        try {
          client.client.stopClient();
          this.logger.debug(
            'Manually stopped Matrix client after failed release',
          );
        } catch (stopError) {
          this.logger.warn(
            `Failed to stop Matrix client: ${stopError.message}`,
          );
        }
      }
    }
  }

  /**
   * Get the Matrix SDK
   */
  getSdk(): IMatrixSdk {
    return this.matrixSdk;
  }

  // Token management is now handled by MatrixTokenManagerService

  /**
   * Check if admin token is valid and regenerate if needed
   * This is useful for operations that require admin access
   * @returns True if admin token is valid or was successfully regenerated
   */
  public async ensureValidAdminToken(): Promise<boolean> {
    try {
      // Use the token manager's state
      const tokenState = this.tokenManager.getAdminTokenState();

      // If the token is regenerating, we'll assume it's valid
      if (tokenState === 'regenerating') {
        return true;
      }

      // If the token is invalid, report it
      if (tokenState === 'invalid') {
        await this.tokenManager.reportTokenInvalid();
        return false;
      }

      // If the token is valid, get the latest token and update our reference
      if (tokenState === 'valid') {
        const latestToken = this.tokenManager.getAdminToken();

        // Update our token if it differs from the token manager's
        if (latestToken && latestToken !== this.adminAccessToken) {
          this.logger.debug(
            'Updating admin token reference from token manager',
          );
          this.adminAccessToken = latestToken;

          // Recreate admin client with new token
          this.createAdminClient();
        }

        return true;
      }

      return false;
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
