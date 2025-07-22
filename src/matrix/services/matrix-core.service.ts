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
      // Only load the Matrix SDK during startup - defer actual connection
      await this.loadMatrixSdk();

      // Set up event listener for token updates
      this.eventEmitter.on(
        'matrix.admin.token.updated',
        this.handleTokenUpdate.bind(this),
      );

      this.logger.log('Matrix core service loaded SDK and event listeners');

      // Initialize Matrix connection immediately
      await this.initializeMatrixConnection();
    } catch (error) {
      this.logger.error(
        `Failed to load Matrix SDK: ${error.message}`,
        error.stack,
      );
      this.logger.error(
        'Matrix functionality will not be available - application may still function with limited features',
      );
    }
  }

  private async initializeMatrixConnection(): Promise<boolean> {
    // Re-enabled admin token approach for room permission fixes
    try {
      const tenantConfig = await this.getTenantConfig();
      if (!tenantConfig?.matrixConfig?.adminUser) {
        this.logger.warn(
          'No admin credentials configured - admin operations will not be available',
        );
        this.adminAccessToken = '';
        return false;
      }

      this.logger.log(
        'Initializing Matrix admin connection for room permission management',
      );

      // Get admin token from token manager
      const adminToken = await this.tokenManager.getAdminTokenForTenant(
        tenantConfig.id,
      );
      if (!adminToken) {
        this.logger.error(
          'Failed to get admin token - admin operations will not be available',
        );
        this.adminAccessToken = '';
        return false;
      }

      this.adminAccessToken = adminToken;
      this.adminUserId = tenantConfig.matrixConfig.adminUser.userId;

      // Create admin client with tenant-specific configuration
      this.createAdminClient(tenantConfig);
      this.initializeClientPool();

      this.logger.log(
        'Matrix core service initialized with admin client for room management',
      );
      return true; // Return true to indicate admin operations are available
    } catch (error) {
      this.logger.error(
        `Failed to initialize Matrix admin connection: ${error.message}`,
      );
      this.adminAccessToken = '';
      return false;
    }
  }

  /**
   * Check if Matrix is ready for operations
   */
  public isMatrixReady(): boolean {
    return !!(this.adminClient && this.clientPool && this.adminAccessToken);
  }

  /**
   * Ensure Matrix is initialized before performing operations
   * Will attempt to initialize if not ready
   */
  public async ensureMatrixReady(): Promise<boolean> {
    if (this.isMatrixReady()) {
      return true;
    }

    this.logger.log('Matrix not ready, attempting initialization...');
    return await this.initializeMatrixConnection();
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
      // Remove event listeners
      this.eventEmitter.removeAllListeners('matrix.admin.token.updated');

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
  private createAdminClient(tenantConfig?: any): void {
    // Check if there's an existing client that needs to be stopped
    if (this.adminClient?.stopClient) {
      try {
        this.adminClient.stopClient();
        this.logger.debug(
          'Stopped existing admin client before creating a new one',
        );
      } catch (err) {
        this.logger.warn(
          `Error stopping existing admin client: ${err.message}`,
        );
      }
    }

    // Use tenant-specific configuration if provided, otherwise fall back to global config
    const baseUrl = tenantConfig?.matrixConfig?.homeserverUrl || this.baseUrl;
    const userId =
      tenantConfig?.matrixConfig?.adminUser?.userId || this.adminUserId;

    // Create a new client with the current token
    this.adminClient = this.matrixSdk.createClient({
      baseUrl: baseUrl,
      userId: userId,
      accessToken: this.adminAccessToken,
      useAuthorizationHeader: true,
      // Disable automatic capabilities refresh which causes error logs when token is invalid
      // This prevents the "Failed to refresh capabilities" errors from appearing
      timeoutCap: 60000, // Set higher timeout to prevent premature failures
      localTimeoutMs: 120000, // Also increase local timeout
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
            // Disable automatic capabilities refresh which causes error logs when token is invalid
            // This prevents the "Failed to refresh capabilities" errors from appearing
            timeoutCap: 60000, // Set higher timeout to prevent premature failures
            localTimeoutMs: 120000, // Also increase local timeout
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
   * Get admin client for specific tenant
   * @param tenantId Tenant ID to get admin client for
   * @returns Promise<IMatrixClient> Admin client for the tenant
   */
  async getAdminClientForTenant(tenantId: string): Promise<IMatrixClient> {
    try {
      const tenantConfig = await this.getTenantConfigById(tenantId);
      if (!tenantConfig?.matrixConfig?.adminUser) {
        throw new Error(
          `No admin credentials configured for tenant: ${tenantId}`,
        );
      }

      // Get fresh admin token for the tenant
      const adminToken =
        await this.tokenManager.getAdminTokenForTenant(tenantId);
      if (!adminToken) {
        throw new Error(`Failed to get admin token for tenant: ${tenantId}`);
      }

      // Create tenant-specific admin client
      const tenantAdminClient = this.matrixSdk.createClient({
        baseUrl: tenantConfig.matrixConfig.homeserverUrl,
        userId: tenantConfig.matrixConfig.adminUser.userId,
        accessToken: adminToken,
        useAuthorizationHeader: true,
        timeoutCap: 60000,
        localTimeoutMs: 120000,
        logger: {
          log: () => {},
          info: () => {},
          warn: () => {},
          debug: () => {},
          error: (msg: string) => this.logger.error(msg),
        },
      });

      return tenantAdminClient;
    } catch (error) {
      this.logger.error(
        `Failed to get admin client for tenant ${tenantId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get tenant configuration for current request context
   */
  private async getTenantConfig(): Promise<any> {
    try {
      const { fetchTenants } = await import('../../utils/tenant-config');
      const tenants = fetchTenants();
      // Return first non-empty tenant for now (will be enhanced for multi-tenant)
      return tenants.find((t) => t.id && t.matrixConfig) || null;
    } catch (error) {
      this.logger.error(`Failed to get tenant config: ${error.message}`);
      return null;
    }
  }

  /**
   * Get tenant configuration by ID
   */
  private async getTenantConfigById(tenantId: string): Promise<any> {
    try {
      const { fetchTenants } = await import('../../utils/tenant-config');
      const tenants = fetchTenants();
      return tenants.find((t) => t.id === tenantId) || null;
    } catch (error) {
      this.logger.error(
        `Failed to get tenant config for ${tenantId}: ${error.message}`,
      );
      return null;
    }
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
   * Admin tokens are disabled - this method will now throw an error
   */
  acquireClient(): Promise<MatrixClientWithContext> {
    // Admin token approach is disabled
    throw new Error(
      'Admin client acquisition disabled - use tenant-scoped bot users instead',
    );
  }

  /**
   * Release a client back to the connection pool (DISABLED)
   */
  releaseClient(_client: MatrixClientWithContext): Promise<void> {
    // Admin token approach is disabled - no client pool to release to
    this.logger.warn('Client pool disabled - cannot release Matrix client');
    return Promise.resolve();
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

  /**
   * Handle token update events from the token manager
   * This ensures all clients are recreated with the new token
   */
  private async handleTokenUpdate(data: {
    userId: string;
    token: string;
  }): Promise<void> {
    if (!data.token) {
      this.logger.warn('Received token update event with empty token');
      return;
    }

    this.logger.log(`Received token update for user ${data.userId}`);

    // Update the local token reference
    if (data.userId === this.adminUserId) {
      const oldToken = this.adminAccessToken;
      const newToken = data.token;

      // Only take action if the token actually changed
      if (oldToken !== newToken) {
        this.logger.log('Updating admin client with new token');
        this.adminAccessToken = newToken;

        // Recreate the admin client with the new token
        this.createAdminClient();

        // Drain and reinitialize the client pool to ensure all new clients use the updated token
        try {
          if (this.clientPool) {
            this.logger.log(
              'Draining and reinitializing client pool with new token',
            );
            await this.clientPool.drain();
            await this.clientPool.clear();
            this.initializeClientPool();
          }
        } catch (error) {
          this.logger.error(
            `Error reinitializing client pool: ${error.message}`,
          );
        }
      }
    }
  }
}
