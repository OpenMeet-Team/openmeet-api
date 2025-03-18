import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as pool from 'generic-pool';
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
  private readonly adminUserId: string;
  private readonly adminAccessToken: string;

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
      this.adminUserId = `@${process.env.MATRIX_ADMIN_USER || process.env.MATRIX_ADMIN_USERNAME || 'admin'}:${serverName}`;
      this.serverName = serverName;
      this.defaultDeviceId = 'OPENMEET_SERVER';
      this.defaultInitialDeviceDisplayName = 'OpenMeet Server';
      this.adminAccessToken = process.env.MATRIX_ADMIN_ACCESS_TOKEN || '';
      return; // Skip logging
    }

    this.baseUrl = matrixConfig.baseUrl;
    this.adminUserId = `@${matrixConfig.adminUser}:${matrixConfig.serverName}`;
    this.serverName = matrixConfig.serverName;
    this.defaultDeviceId = matrixConfig.defaultDeviceId;
    this.defaultInitialDeviceDisplayName =
      matrixConfig.defaultInitialDeviceDisplayName;
    this.adminAccessToken = matrixConfig.adminAccessToken;

    this.logger.log('Matrix core service initialized with configuration');
  }

  async onModuleInit() {
    try {
      // Dynamically import the matrix-js-sdk
      await this.loadMatrixSdk();

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
      throw error;
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
        startClient: async () => {},
        stopClient: async () => {},
        sendEvent: async () => ({ event_id: `mock-event-${Date.now()}` }),
        getStateEvent: async () => ({}),
        sendStateEvent: async () => ({}),
        invite: async () => {},
        kick: async () => {},
        joinRoom: async () => {},
        getProfileInfo: async () => ({ displayname: 'Mock User' }),
        setDisplayName: async () => {},
        getJoinedRooms: async () => ({ joined_rooms: [] }),
        getRoom: () => null,
        getAccessToken: () => '',
        getUserId: () => options?.userId || '@mock-user:example.org',
        on: () => {},
        removeListener: () => {},
        roomState: async () => [],
        sendTyping: async () => {},
        // Add the missing createRoom method to match the IMatrixClient interface
        createRoom: async () => ({ room_id: `mock-room-${Date.now()}` }),
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
        create: async () => {
          const client = this.matrixSdk.createClient({
            baseUrl: this.baseUrl,
            userId: this.adminUserId,
            accessToken: this.adminAccessToken,
            useAuthorizationHeader: true,
          });

          return {
            client,
            userId: this.adminUserId,
          };
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
   */
  async acquireClient(): Promise<MatrixClientWithContext> {
    return this.clientPool.acquire();
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
