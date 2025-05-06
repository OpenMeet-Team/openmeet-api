import { Injectable, Logger } from '@nestjs/common';
import { MatrixTokenManagerService } from './matrix-token-manager.service';
import { MatrixCoreService } from './matrix-core.service';
import { IMatrixClient } from '../types/matrix.interfaces';
import { MatrixUserService } from './matrix-user.service';

@Injectable()
export class MatrixClientOperationsService {
  private readonly logger = new Logger(MatrixClientOperationsService.name);

  constructor(
    private readonly tokenManager: MatrixTokenManagerService,
    private readonly matrixCoreService: MatrixCoreService,
    private readonly matrixUserService: MatrixUserService,
  ) {}

  /**
   * Get Matrix user ID from a user slug
   * @param userSlug The user slug
   * @param tenantId Optional tenant ID
   * @returns The full Matrix user ID
   */
  private getMatrixUserId(userSlug: string, tenantId?: string): string {
    const username = MatrixUserService.generateMatrixUsername({ slug: userSlug }, tenantId);
    return `@${username}:${this.matrixCoreService.getConfig().serverName}`;
  }

  /**
   * Get Matrix room ID from an event slug
   * @param eventSlug The event slug
   * @returns The Matrix room ID
   */
  private async getMatrixRoomId(eventSlug: string): Promise<string> {
    // In a real implementation, this would query a database to find the room ID
    // For now, we just use the slug as part of a predictable room ID pattern
    // This would be replaced with actual lookup logic
    return `!event_${eventSlug}:${this.matrixCoreService.getConfig().serverName}`;
  }

  /**
   * Execute a Matrix operation with a fresh client that is immediately stopped after use
   * @param userSlug The user slug to create a client for
   * @param operation The operation function to execute with the client
   * @param tenantId Optional tenant ID for multi-tenant support
   * @returns The result of the operation
   */
  async withMatrixClient<T>(
    userSlug: string,
    operation: (client: IMatrixClient) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const matrixUserId = this.getMatrixUserId(userSlug, tenantId);
    this.logger.debug(`Creating temporary Matrix client for user ${matrixUserId} (slug: ${userSlug})`);
    
    let client: IMatrixClient | null = null;
    
    try {
      // Get a valid token for this user
      const token = await this.tokenManager.getValidUserToken(matrixUserId, tenantId);
      
      if (!token) {
        throw new Error(`Could not obtain valid token for user ${matrixUserId}`);
      }
      
      // Create a new Matrix client with the token
      client = this.matrixCoreService.getSdk().createClient({
        baseUrl: this.matrixCoreService.getConfig().baseUrl,
        accessToken: token,
        userId: matrixUserId,
      });
      
      // Perform the operation
      const result = await operation(client);
      
      return result;
    } catch (error) {
      this.logger.error(
        `Error during Matrix operation for ${matrixUserId}: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      // Always stop the client when done
      if (client && client.stopClient) {
        try {
          client.stopClient();
          this.logger.debug(`Stopped Matrix client for user ${matrixUserId}`);
        } catch (stopError) {
          this.logger.warn(`Error stopping Matrix client: ${stopError.message}`);
        }
      }
    }
  }

  /**
   * Execute a Matrix operation with an admin client that is immediately stopped after use
   * @param operation The operation function to execute with the admin client
   * @returns The result of the operation
   */
  async withAdminClient<T>(
    operation: (client: IMatrixClient) => Promise<T>,
  ): Promise<T> {
    this.logger.debug(`Creating temporary Matrix admin client`);
    
    let client: IMatrixClient | null = null;
    
    try {
      // Ensure we have a valid admin token
      const adminConfig = this.matrixCoreService.getConfig();
      const adminToken = this.tokenManager.getAdminToken();
      
      if (!adminToken) {
        throw new Error('No valid admin token available');
      }
      
      // Create a fresh admin client
      client = this.matrixCoreService.getSdk().createClient({
        baseUrl: adminConfig.baseUrl,
        accessToken: adminToken,
        userId: adminConfig.adminUserId,
      });
      
      // Perform the operation
      const result = await operation(client);
      
      return result;
    } catch (error) {
      this.logger.error(
        `Error during Matrix admin operation: ${error.message}`,
        error.stack,
      );
      
      // If we get an unauthorized error, try to refresh the admin token
      if (error.response?.status === 401) {
        this.logger.warn('Admin token appears invalid, triggering regeneration');
        this.tokenManager.reportTokenInvalid();
      }
      
      throw error;
    } finally {
      // Always stop the client when done
      if (client && client.stopClient) {
        try {
          client.stopClient();
          this.logger.debug(`Stopped Matrix admin client`);
        } catch (stopError) {
          this.logger.warn(`Error stopping Matrix admin client: ${stopError.message}`);
        }
      }
    }
  }

  /**
   * Utility method for room operations using event slug and user slug
   * @param eventSlug Event slug
   * @param userSlug User slug
   * @param operation Room operation to perform
   * @param tenantId Optional tenant ID
   */
  async withEventOperation<T>(
    eventSlug: string,
    userSlug: string,
    operation: (client: IMatrixClient, roomId: string) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const roomId = await this.getMatrixRoomId(eventSlug);
    const matrixUserId = this.getMatrixUserId(userSlug, tenantId);
    
    return this.withMatrixClient(
      userSlug,
      async (client) => {
        return operation(client, roomId);
      },
      tenantId,
    );
  }
  
  /**
   * Utility method for admin room operations using event slug
   * @param eventSlug Event slug
   * @param operation Room operation to perform
   */
  async withAdminEventOperation<T>(
    eventSlug: string,
    operation: (client: IMatrixClient, roomId: string) => Promise<T>,
  ): Promise<T> {
    const roomId = await this.getMatrixRoomId(eventSlug);
    
    return this.withAdminClient(async (client) => {
      return operation(client, roomId);
    });
  }

  /**
   * Utility method for message operations using event slug and user slug
   * @param eventSlug Event slug
   * @param userSlug User slug
   * @param operation Message operation to perform
   * @param tenantId Optional tenant ID
   */
  async withMessageOperation<T>(
    eventSlug: string,
    userSlug: string,
    operation: (client: IMatrixClient, roomId: string) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const roomId = await this.getMatrixRoomId(eventSlug);
    
    return this.withMatrixClient(
      userSlug,
      async (client) => {
        return operation(client, roomId);
      },
      tenantId,
    );
  }

  /** 
   * Legacy methods that accept room IDs directly - kept for backward compatibility
   */
  
  async withRoomOperation<T>(
    roomId: string,
    userSlug: string,
    operation: (client: IMatrixClient, roomId: string) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    return this.withMatrixClient(
      userSlug,
      async (client) => {
        return operation(client, roomId);
      },
      tenantId,
    );
  }
  
  async withAdminRoomOperation<T>(
    roomId: string,
    operation: (client: IMatrixClient, roomId: string) => Promise<T>,
  ): Promise<T> {
    return this.withAdminClient(async (client) => {
      return operation(client, roomId);
    });
  }
} 