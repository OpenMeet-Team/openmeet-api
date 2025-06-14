import { Logger } from '@nestjs/common';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { UserService } from '../../user/user.service';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

/**
 * Helper functions for Matrix WebSocket Gateway operations
 */
export class MatrixGatewayHelper {
  /**
   * Creates a UserService instance for the current request context
   * @param moduleRef The NestJS ModuleRef for resolving request-scoped providers
   * @param logger Logger instance for error reporting
   * @returns A Promise resolving to a UserService instance
   */
  static async createUserServiceForRequest(
    moduleRef: ModuleRef,
    logger: Logger,
  ): Promise<UserService> {
    try {
      // Create a contextId for this request to resolve request-scoped services
      const contextId = ContextIdFactory.create();

      // Get the UserService instance for this context
      const userService = await moduleRef.resolve(UserService, contextId, {
        strict: false,
      });

      // Set WebSocket context flag to prevent infinite room verification loops
      // This flag will be checked in ChatRoomService.addUserToEventChatRoom
      // We need to use a hacky approach since request is private in UserService
      if (userService) {
        // Set a property on the userService that will indicate this is a WebSocket context
        (userService as any)._wsContext = true;
      }

      return userService;
    } catch (error) {
      logger.error(`Error creating UserService: ${error.message}`, error.stack);
      throw new Error('Failed to create UserService instance');
    }
  }

  /**
   * Resolves a user by ID using a UserService instance
   * @param userId User ID to resolve
   * @param userService UserService instance to use
   * @param tenantId Optional tenant ID for multi-tenant systems
   * @param logger Logger instance for error reporting
   * @returns A Promise resolving to the user entity
   */
  static async resolveUserById(
    userId: number,
    userService: UserService,
    tenantId: string | undefined,
    logger: Logger,
  ): Promise<any> {
    try {
      const user = await userService.findById(userId, tenantId);

      if (!user) {
        logger.error(`User ${userId} not found`);
        throw new Error('User not found');
      }

      return user;
    } catch (error) {
      logger.error(`Error resolving user: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handles a WebSocket operation with proper error handling
   * @param operation Function to execute
   * @param errorMessage Error message prefix to use if operation fails
   * @param logger Logger instance for error reporting
   * @returns A Promise resolving to the result of the operation or an error response
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    errorMessage: string,
    logger: Logger,
  ): Promise<{ success: boolean; error?: string; [key: string]: any }> {
    try {
      const result = await operation();
      return { success: true, ...(result as any) };
    } catch (error) {
      logger.error(`${errorMessage}: ${error.message}`, error.stack);
      return {
        success: false,
        error: `${errorMessage}: ${error.message}`,
      };
    }
  }

  /**
   * Gets proper tenant ID from client data or request
   * @param client Socket client
   * @param requestData Request data that might contain tenantId
   * @returns The tenant ID if available
   */
  static getTenantId(
    client: Socket,
    requestData?: { tenantId?: string },
  ): string | undefined {
    return client.data?.tenantId || requestData?.tenantId;
  }

  /**
   * Validates that a client has Matrix credentials
   * @param client Socket client
   * @param logger Logger instance for error reporting
   * @throws WsException if credentials are missing
   * @returns Object indicating if initialization is needed
   */
  static validateClientHasMatrixCredentials(
    client: Socket,
    logger: Logger,
  ): { needsInitialization: boolean } {
    const userId = client.data?.userId;

    // First check if user has Matrix credentials at all
    if (!client.data?.hasMatrixCredentials) {
      logger.warn(`User ${userId} missing Matrix credentials`);
      throw new WsException('Matrix credentials required');
    }

    // If user has credentials but client isn't initialized, indicate initialization is needed
    if (!client.data?.matrixClientInitialized) {
      logger.debug(
        `User ${userId} has Matrix credentials but client not initialized - will attempt initialization`,
      );
      return { needsInitialization: true };
    }

    // All good - user has credentials and client is initialized
    return { needsInitialization: false };
  }

  /**
   * Generates a unique ID for tracking broadcasts
   * @returns A unique string ID
   */
  static generateBroadcastId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
