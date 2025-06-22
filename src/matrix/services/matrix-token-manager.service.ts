import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import { MatrixConfig } from '../config/matrix-config.type';

export type TokenState = 'valid' | 'regenerating' | 'invalid';

interface TokenData {
  token: string;
  state: TokenState;
  lastVerified: number;
  deviceId?: string;
}

@Injectable()
export class MatrixTokenManagerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MatrixTokenManagerService.name);

  // Admin token
  private adminTokenState: TokenState = 'invalid';
  private adminAccessToken: string = '';
  private lastAdminTokenRefresh = 0;

  // User tokens (new implementation)
  private userTokens = new Map<string, TokenData>();

  // Configuration properties
  private readonly baseUrl: string;
  private readonly serverName: string;
  private readonly adminUserId: string;
  private readonly defaultDeviceId: string;
  private readonly defaultInitialDeviceDisplayName: string;

  // Refresh interval
  private tokenRefreshInterval: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
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

    // Extract configuration parameters
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
    this.logger.log('Initializing Matrix Token Manager (deferred mode)');

    // Set up background refresh (every 6 hours) but don't start token generation yet
    this.tokenRefreshInterval = setInterval(
      () => {
        void this.periodicTokenRefresh();
      },
      6 * 60 * 60 * 1000,
    );

    // Defer initial token generation to avoid blocking API startup
    // Token will be generated when first needed or after delay
    this.scheduleDelayedTokenInitialization();

    this.logger.log('Matrix Token Manager initialized in deferred mode');
  }

  private scheduleDelayedTokenInitialization() {
    // Try to initialize tokens after a delay, giving Matrix time to start
    setTimeout(async () => {
      this.logger.log('Attempting delayed token initialization...');
      await this.initializeTokensIfNeeded();
    }, 15000); // Wait 15 seconds for Matrix to start
  }

  private async initializeTokensIfNeeded() {
    try {
      // Initial token generation if needed
      if (!this.adminAccessToken) {
        this.logger.log('No admin token available, generating a new one');
        await this.triggerAdminTokenRegeneration();
      } else {
        // Verify existing token
        await this.verifyAdminToken();
      }
    } catch (error) {
      this.logger.warn(
        `Delayed token initialization failed: ${error.message} - will retry when needed`,
      );
    }
  }

  onModuleDestroy() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }
    this.logger.log('Matrix Token Manager destroyed');
  }

  // ADMIN TOKEN METHODS

  /**
   * Get the current admin access token
   */
  getAdminToken(): string {
    return this.adminAccessToken;
  }

  /**
   * Get the current admin token state
   */
  getAdminTokenState(): TokenState {
    return this.adminTokenState;
  }

  /**
   * Report that the admin token is invalid - triggers async regeneration
   * Returns a promise that resolves when regeneration is complete
   */
  async reportTokenInvalid(): Promise<boolean> {
    this.logger.warn('Token reported as invalid, triggering regeneration');

    // If token is already regenerating, log and return to avoid multiple regenerations
    if (this.adminTokenState === 'regenerating') {
      this.logger.debug(
        'Token regeneration already in progress, skipping duplicate request',
      );
      return false;
    }

    // If token was regenerated within the last 30 seconds, skip to avoid thrashing
    const now = Date.now();
    const timeSinceLastRefresh = now - this.lastAdminTokenRefresh;
    if (timeSinceLastRefresh < 30000) {
      // 30 seconds
      this.logger.warn(
        `Token was regenerated ${Math.round(timeSinceLastRefresh / 1000)}s ago, skipping to prevent thrashing`,
      );
      return false;
    }

    // Mark as invalid and trigger regeneration
    this.adminTokenState = 'invalid';
    return await this.triggerAdminTokenRegeneration(true); // Wait for completion for more reliable behavior
  }

  /**
   * Force regeneration of the admin token
   */
  async forceTokenRegeneration(): Promise<boolean> {
    this.logger.log('Forcing token regeneration');
    return this.triggerAdminTokenRegeneration(true);
  }

  /**
   * Verify if the existing admin token is valid
   */
  private async verifyAdminToken(): Promise<boolean> {
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
          `Matrix admin token verified for user: ${response.data.user_id}`,
        );
        this.adminTokenState = 'valid';
        this.lastAdminTokenRefresh = Date.now();
        return true;
      } else {
        this.logger.warn(
          'Unexpected whoami response format - admin token may be invalid',
        );
        await this.triggerAdminTokenRegeneration();
        return false;
      }
    } catch (error) {
      this.logger.warn(
        `Existing admin token appears invalid: ${error.message}`,
      );
      await this.triggerAdminTokenRegeneration();
      return false;
    }
  }

  /**
   * Trigger admin token regeneration in the background
   * @param waitForCompletion If true, returns only when regeneration is complete
   * @returns Promise that resolves to true if regeneration was successful
   */
  private async triggerAdminTokenRegeneration(
    waitForCompletion = false,
  ): Promise<boolean> {
    // Don't run multiple regenerations at once
    if (this.adminTokenState === 'regenerating') {
      this.logger.debug('Admin token regeneration already in progress');
      return false;
    }

    this.adminTokenState = 'regenerating';

    const regenerationTask = async () => {
      try {
        const newToken = await this.regenerateAdminToken();
        if (newToken) {
          this.adminAccessToken = newToken;
          this.adminTokenState = 'valid';
          this.lastAdminTokenRefresh = Date.now();

          // Emit an event that the admin token was updated
          this.eventEmitter.emit('matrix.admin.token.updated', {
            userId: this.adminUserId,
            token: this.adminAccessToken,
          });

          this.logger.log('Matrix admin token regenerated successfully');
          return true;
        } else {
          this.adminTokenState = 'invalid';
          this.logger.error('Failed to regenerate Matrix admin token');
          return false;
        }
      } catch (error) {
        this.adminTokenState = 'invalid';
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
   * Actual admin token regeneration logic
   */
  private async regenerateAdminToken(): Promise<string | null> {
    const matrixConfig = this.configService.get<MatrixConfig>('matrix', {
      infer: true,
    });

    // Password is now required in the config
    const adminPassword =
      process.env.MATRIX_ADMIN_PASSWORD || matrixConfig?.adminPassword;
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

  // USER TOKEN METHODS

  /**
   * Get a valid token for a Matrix user
   * If the token is invalid or not present, it will be generated
   * @param matrixUserId Full Matrix user ID (@user:server)
   * @param tenantId Optional tenant ID for multi-tenant support
   * @returns A valid Matrix access token
   */
  async getValidUserToken(
    matrixUserId: string,
    tenantId?: string,
  ): Promise<string | null> {
    const key = this.getUserTokenKey(matrixUserId, tenantId);
    const tokenData = this.userTokens.get(key);

    // If we have a token and it's valid, return it
    if (tokenData && tokenData.state === 'valid') {
      // Verify if it's still valid (if it hasn't been verified in the last hour)
      const now = Date.now();
      if (now - tokenData.lastVerified < 60 * 60 * 1000) {
        return tokenData.token;
      }

      // Verify the token
      try {
        const isValid = await this.verifyUserToken(
          matrixUserId,
          tokenData.token,
        );
        if (isValid) {
          // Update the lastVerified timestamp
          tokenData.lastVerified = now;
          this.userTokens.set(key, tokenData);
          return tokenData.token;
        }
      } catch (error) {
        this.logger.warn(`Error verifying user token: ${error.message}`);
      }
    }

    // If we get here, we need to generate a new token
    try {
      const newToken = await this.generateUserToken(matrixUserId);
      if (newToken) {
        // Store the new token
        this.userTokens.set(key, {
          token: newToken.token,
          state: 'valid',
          lastVerified: Date.now(),
          deviceId: newToken.deviceId,
        });

        // Emit an event that the user token was updated
        this.eventEmitter.emit('matrix.user.token.updated', {
          userId: matrixUserId,
          token: newToken.token,
          tenantId,
        });

        return newToken.token;
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate token for user ${matrixUserId}: ${error.message}`,
      );
    }

    return null;
  }

  /**
   * Verify if a user token is valid
   * @param matrixUserId Matrix user ID
   * @param accessToken Access token to verify
   * @returns True if the token is valid
   */
  async verifyUserToken(
    matrixUserId: string,
    accessToken: string,
  ): Promise<boolean> {
    try {
      const whoamiUrl = `${this.baseUrl}/_matrix/client/v3/account/whoami`;

      const response = await axios.get(whoamiUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.data && response.data.user_id === matrixUserId) {
        this.logger.debug(`Token verified for user: ${matrixUserId}`);
        return true;
      } else {
        this.logger.warn(
          `Token verification failed - user mismatch: expected=${matrixUserId}, actual=${response.data?.user_id}`,
        );
        return false;
      }
    } catch (error) {
      this.logger.warn(
        `Token verification failed for ${matrixUserId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Generate a new token for a Matrix user
   * @param matrixUserId Matrix user ID
   * @returns New token and device ID
   */
  private async generateUserToken(
    matrixUserId: string,
  ): Promise<{ token: string; deviceId: string } | null> {
    try {
      // Ensure we have a valid admin token
      if (this.adminTokenState !== 'valid') {
        await this.verifyAdminToken();
      }

      // Generate a device ID for this token
      const deviceId = `OPENMEET_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Use the admin API to generate a token for the user
      // POST /_synapse/admin/v1/users/{userId}/login
      const loginUrl = `${this.baseUrl}/_synapse/admin/v1/users/${encodeURIComponent(matrixUserId)}/login`;
      this.logger.debug(
        `Generating admin token for user: ${matrixUserId} using admin API`,
      );
      const response = await axios.post(
        loginUrl,
        {
          valid_until_ms: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 days expiry
        },
        {
          headers: {
            Authorization: `Bearer ${this.adminAccessToken}`,
          },
        },
      );

      if (response.data && response.data.access_token) {
        return {
          token: response.data.access_token,
          deviceId: deviceId, // We still generate our own device ID for tracking
        };
      } else {
        this.logger.error(
          'Failed to generate user token: Unexpected response format',
        );
        return null;
      }
    } catch (error) {
      this.logger.error(
        `Error generating user token for ${matrixUserId}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Invalidate a user's token
   * @param matrixUserId Matrix user ID
   * @param tenantId Optional tenant ID
   */
  invalidateUserToken(matrixUserId: string, tenantId?: string): void {
    const key = this.getUserTokenKey(matrixUserId, tenantId);
    const tokenData = this.userTokens.get(key);

    if (tokenData) {
      tokenData.state = 'invalid';
      this.userTokens.set(key, tokenData);

      // Emit an event that the token was invalidated
      this.eventEmitter.emit('matrix.user.token.invalidated', {
        userId: matrixUserId,
        tenantId,
      });

      this.logger.debug(`Invalidated token for user: ${matrixUserId}`);
    }
  }

  /**
   * Clear all tokens for a user
   * @param matrixUserId Matrix user ID
   * @param tenantId Optional tenant ID
   */
  clearUserTokens(matrixUserId: string, tenantId?: string): void {
    const key = this.getUserTokenKey(matrixUserId, tenantId);
    this.userTokens.delete(key);

    // Emit an event that all tokens were cleared
    this.eventEmitter.emit('matrix.user.tokens.cleared', {
      userId: matrixUserId,
      tenantId,
    });

    this.logger.debug(`Cleared all tokens for user: ${matrixUserId}`);
  }

  // SHARED METHODS

  /**
   * Periodic token refresh logic for all tokens
   */
  private async periodicTokenRefresh(): Promise<void> {
    this.logger.debug('Running periodic token refresh');

    // Refresh admin token if needed
    const now = Date.now();
    const timeSinceLastAdminRefresh = now - this.lastAdminTokenRefresh;

    if (
      timeSinceLastAdminRefresh > 6 * 60 * 60 * 1000 ||
      this.adminTokenState === 'invalid'
    ) {
      this.logger.log('Refreshing admin token');
      await this.verifyAdminToken();
    }

    // Refresh user tokens that are older than 6 hours
    for (const [key, tokenData] of this.userTokens.entries()) {
      if (now - tokenData.lastVerified > 6 * 60 * 60 * 1000) {
        const [matrixUserId] = this.parseUserTokenKey(key);
        this.logger.debug(`Refreshing token for user: ${matrixUserId}`);

        try {
          // Mark as invalid so it will be regenerated next time it's needed
          tokenData.state = 'invalid';
          this.userTokens.set(key, tokenData);
        } catch (error) {
          this.logger.warn(
            `Error refreshing token for ${matrixUserId}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Generate a key for storing user tokens
   */
  private getUserTokenKey(matrixUserId: string, tenantId?: string): string {
    return tenantId ? `${matrixUserId}:${tenantId}` : matrixUserId;
  }

  /**
   * Parse a user token key back into components
   */
  private parseUserTokenKey(key: string): [string, string | undefined] {
    const parts = key.split(':');
    // If we have more than 2 parts, the first two form the matrix ID
    if (parts.length > 2) {
      return [`@${parts[0]}:${parts[1]}`, parts[2]];
    }
    return [key, undefined];
  }
}
