import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MatrixConfig } from '../config/matrix-config.type';

export type TokenState = 'valid' | 'regenerating' | 'invalid';

@Injectable()
export class MatrixTokenManagerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MatrixTokenManagerService.name);
  private tokenState: TokenState = 'invalid';
  private lastTokenRefresh = 0;
  private tokenRefreshInterval: NodeJS.Timeout;
  private adminAccessToken: string = '';

  private readonly baseUrl: string;
  private readonly serverName: string;
  private readonly adminUserId: string;
  private readonly defaultDeviceId: string;
  private readonly defaultInitialDeviceDisplayName: string;

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

    // Extract configuration parameters (similar to MatrixCoreService)
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

    // Set the properties consistently
    this.baseUrl = baseUrl;
    this.serverName = serverName;
    this.adminUserId = `@${adminUsername}:${serverName}`;
    this.defaultDeviceId = matrixConfig?.defaultDeviceId || 'OPENMEET_SERVER';
    this.defaultInitialDeviceDisplayName =
      matrixConfig?.defaultInitialDeviceDisplayName || 'OpenMeet Server';

    // Initialize with token from config or empty string
    this.adminAccessToken = matrixConfig?.adminAccessToken || '';

    // Log the determined values
    this.logger.log(`Token Manager created with Matrix configuration:`, {
      serverName,
      baseUrl,
      adminUsername,
    });
  }

  async onModuleInit() {
    this.logger.log('Initializing Matrix Token Manager');

    // Initial token generation if needed
    if (!this.adminAccessToken) {
      this.logger.log('No admin token provided, generating a new one');
      await this.triggerTokenRegeneration();
    } else {
      // Verify existing token
      await this.verifyExistingToken();
    }

    // Set up background refresh (every 12 hours)
    this.tokenRefreshInterval = setInterval(
      () => {
        void this.regenerateTokenIfNeeded();
      },
      12 * 60 * 60 * 1000,
    ); // 12 hours

    this.logger.log('Matrix Token Manager initialized');
  }

  onModuleDestroy() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    this.logger.log('Matrix Token Manager destroyed');
  }

  // Public methods for external components

  /**
   * Get the current admin access token
   */
  getAdminToken(): string {
    return this.adminAccessToken;
  }

  /**
   * Get the current token state
   */
  getTokenState(): TokenState {
    return this.tokenState;
  }

  /**
   * Report that the token is invalid - triggers async regeneration
   */
  reportTokenInvalid(): void {
    this.logger.warn('Token reported as invalid, triggering regeneration');
    if (this.tokenState !== 'regenerating') {
      this.tokenState = 'invalid';
      void this.triggerTokenRegeneration();
    }
  }

  /**
   * Force regeneration of the token
   */
  async forceTokenRegeneration(): Promise<boolean> {
    this.logger.log('Forcing token regeneration');
    return this.triggerTokenRegeneration(true);
  }

  // Private methods

  /**
   * Verify if the existing token is valid
   */
  private async verifyExistingToken(): Promise<void> {
    try {
      const whoamiUrl = `${this.baseUrl}/_matrix/client/v3/account/whoami`;

      this.logger.debug(`Verifying existing admin token with: ${whoamiUrl}`);

      const response = await axios.get(whoamiUrl, {
        headers: {
          Authorization: `Bearer ${this.adminAccessToken}`,
        },
      });

      if (response.data && response.data.user_id) {
        this.logger.log(
          `Matrix token verified for user: ${response.data.user_id}`,
        );
        this.tokenState = 'valid';
        this.lastTokenRefresh = Date.now();
      } else {
        this.logger.warn(
          'Unexpected whoami response format - token may be invalid',
        );
        await this.triggerTokenRegeneration();
      }
    } catch (error) {
      this.logger.warn(`Existing token appears invalid: ${error.message}`);
      await this.triggerTokenRegeneration();
    }
  }

  /**
   * Trigger token regeneration in the background
   * @param waitForCompletion If true, returns only when regeneration is complete
   * @returns Promise that resolves to true if regeneration was successful
   */
  private async triggerTokenRegeneration(
    waitForCompletion = false,
  ): Promise<boolean> {
    // Don't run multiple regenerations at once
    if (this.tokenState === 'regenerating') {
      this.logger.debug('Token regeneration already in progress');
      return false;
    }

    this.tokenState = 'regenerating';

    const regenerationTask = async () => {
      try {
        const newToken = await this.regenerateToken();
        if (newToken) {
          this.adminAccessToken = newToken;
          this.tokenState = 'valid';
          this.lastTokenRefresh = Date.now();
          this.logger.log('Matrix admin token regenerated successfully');
          return true;
        } else {
          this.tokenState = 'invalid';
          this.logger.error('Failed to regenerate Matrix admin token');
          return false;
        }
      } catch (error) {
        this.tokenState = 'invalid';
        this.logger.error(
          `Error during token regeneration: ${error.message}`,
          error.stack,
        );
        return false;
      }
    };

    // If we need to wait for completion, run synchronously
    if (waitForCompletion) {
      return await regenerationTask();
    }

    // Otherwise run in the background
    void setTimeout(async () => {
      await regenerationTask();
    }, 0);

    return true;
  }

  /**
   * Periodic token refresh logic
   */
  public async regenerateTokenIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastTokenRefresh;

    // Only refresh if it's been more than 2 hours or token is invalid
    // Reduced from 6 hours to 2 hours to ensure tokens are refreshed more frequently
    if (
      timeSinceLastRefresh > 2 * 60 * 60 * 1000 ||
      this.tokenState === 'invalid'
    ) {
      this.logger.log('Scheduled token refresh triggered');

      // Verify the existing token before triggering regeneration
      try {
        await this.verifyExistingToken();

        // If token verification sets state to invalid, regenerate
        if (this.tokenState === 'invalid') {
          this.logger.warn('Token verification failed, regenerating token');
          await this.triggerTokenRegeneration();
        } else {
          this.logger.log(
            'Token verification successful, no need to regenerate',
          );
          // Update lastTokenRefresh time to prevent immediate re-verification
          this.lastTokenRefresh = now;
        }
      } catch (error) {
        this.logger.warn(
          `Token verification failed with error: ${error.message}`,
        );
        await this.triggerTokenRegeneration();
      }
    }
  }

  /**
   * Actual token regeneration logic - pulled from matrix-core-service but simplified
   */
  private async regenerateToken(): Promise<string | null> {
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

      // Build request data
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
        this.logger.log(
          `Successfully generated admin token for ${usernameOnly}`,
        );
        return newToken;
      } else {
        this.logger.error(
          'Failed to generate admin token: unexpected response format',
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

      this.logger.error(
        `Failed to generate admin token: ${error.message}`,
        errorDetails,
      );
      return null;
    }
  }
}
