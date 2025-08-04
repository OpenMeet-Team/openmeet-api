import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatrixConfig } from '../config/matrix-config.type';
import { IMatrixClient, IMatrixSdk } from '../types/matrix.interfaces';
import { MatrixClientWithContext } from '../types/matrix.types';

@Injectable()
export class MatrixCoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatrixCoreService.name);
  private readonly baseUrl: string;
  private readonly serverName: string;

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
    private readonly eventEmitter: EventEmitter2,
  ) {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    // Extract basic configuration for Matrix SDK
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

    this.baseUrl = baseUrl;
    this.serverName = serverName;

    this.logger.log(
      `Matrix Core Service configured with server: ${serverName}`,
    );
  }

  async onModuleInit() {
    try {
      // Load the Matrix SDK for use by other services
      await this.loadMatrixSdk();
      this.logger.log(
        'Matrix Core Service initialized - SDK loaded successfully',
      );
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

  /**
   * Helper function for implementing delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onModuleDestroy() {
    this.logger.log('Matrix Core Service destroyed');
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
   * Get the event emitter for Matrix-related events
   * Used for system-wide notifications about token refreshes, etc.
   */
  getEventEmitter(): EventEmitter2 {
    return this.eventEmitter;
  }

  /**
   * Get the Matrix SDK
   */
  getSdk(): IMatrixSdk {
    return this.matrixSdk;
  }

  /**
   * Get the Matrix server configuration
   * Note: Some deprecated properties are included for compatibility
   */
  getConfig(): {
    baseUrl: string;
    serverName: string;
    adminUserId?: string;
    defaultDeviceId?: string;
    defaultInitialDeviceDisplayName?: string;
  } {
    return {
      baseUrl: this.baseUrl,
      serverName: this.serverName,
      // Deprecated properties - kept for compatibility
      adminUserId: '@deprecated:use-bot-service.net',
      defaultDeviceId: 'DEPRECATED_USE_BOT_SERVICE',
      defaultInitialDeviceDisplayName: 'Deprecated - Use Bot Service',
    };
  }

  // Deprecated methods - kept for compatibility but log warnings
  getAdminClient(): IMatrixClient {
    this.logger.warn(
      'getAdminClient() is deprecated. These services should be migrated to use MatrixBotService for proper application service authentication.',
    );
    // Return a minimal mock client to prevent crashes
    return this.createMockClient();
  }

  getAdminClientForTenant(tenantId: string): Promise<IMatrixClient> {
    this.logger.warn(
      `getAdminClientForTenant(${tenantId}) is deprecated. This service should be migrated to use MatrixBotService.authenticateBot().`,
    );
    // Return a minimal mock client to prevent crashes
    return Promise.resolve(this.createMockClient());
  }

  acquireClient(): Promise<MatrixClientWithContext> {
    this.logger.warn(
      'acquireClient() is deprecated. Services should use MatrixBotService to create authenticated bot clients.',
    );
    // Return a mock client context to prevent crashes
    return Promise.resolve({
      client: this.createMockClient(),
      userId: '@deprecated:use-bot-service.net',
    });
  }

  releaseClient(_client: MatrixClientWithContext): Promise<void> {
    this.logger.warn(
      'releaseClient() is deprecated. Bot clients are managed by MatrixBotService per tenant.',
    );
    // No-op for compatibility
    return Promise.resolve();
  }

  ensureMatrixReady(): Promise<boolean> {
    this.logger.warn(
      'ensureMatrixReady() is deprecated. Use MatrixBotService.authenticateBot() and isBotAuthenticated() instead.',
    );
    // Return true to prevent blocking, but services should migrate
    return Promise.resolve(true);
  }

  private createMockClient(): IMatrixClient {
    return {
      getAccessToken: () => 'deprecated-use-bot-service',
      getStateEvent: () => Promise.resolve({}),
      sendStateEvent: () => Promise.resolve({ event_id: 'deprecated' }),
      sendEvent: () => Promise.resolve({ event_id: 'deprecated' }),
      kick: () => Promise.resolve({}),
      getProfileInfo: () => Promise.resolve({ displayname: 'Deprecated' }),
      // Add other methods as needed by the services
    } as any;
  }
}
