import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { UserService } from '../../user/user.service';
import { RoomMembershipManager } from './room-membership.helper';
import { ModuleRef, ContextIdFactory } from '@nestjs/core';
import { GlobalMatrixValidationService } from '../services/global-matrix-validation.service';

/**
 * Handles WebSocket authentication for Matrix gateway
 */
export class SocketAuthHandler {
  private logger: Logger;
  private jwtService: JwtService;
  private configService: ConfigService;
  private moduleRef: ModuleRef;
  private roomMembershipManager: RoomMembershipManager;
  private globalMatrixValidationService: GlobalMatrixValidationService;

  constructor(
    logger: Logger,
    jwtService: JwtService,
    configService: ConfigService,
    moduleRef: ModuleRef,
    roomMembershipManager: RoomMembershipManager,
    globalMatrixValidationService: GlobalMatrixValidationService,
  ) {
    this.logger = logger;
    this.jwtService = jwtService;
    this.configService = configService;
    this.moduleRef = moduleRef;
    this.roomMembershipManager = roomMembershipManager;
    this.globalMatrixValidationService = globalMatrixValidationService;
  }

  /**
   * Middleware function to authenticate WebSocket connections
   * @param socket Socket instance to authenticate
   * @param next Function to call when authentication is complete
   */
  async authenticate(
    socket: Socket,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      // Check for token in various places it might be
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization ||
        socket.handshake.query?.token;

      this.logger.debug('Token search locations:', {
        authToken: !!socket.handshake.auth.token,
        headerAuth: !!socket.handshake.headers.authorization,
        queryToken: !!socket.handshake.query?.token,
      });

      if (!token) {
        this.logger.error('No authentication token found in connection');
        return next(
          new WsException('Authentication error - no token provided'),
        );
      }

      // Extract actual token from Bearer format
      const tokenStr = token.startsWith('Bearer ') ? token.substring(7) : token;

      this.logger.debug(
        `Received token: ${tokenStr.length > 10 ? 'Valid length' : 'Invalid length'}`,
      );

      try {
        // Verify the JWT token properly
        let payload;
        try {
          payload = await this.jwtService.verifyAsync(tokenStr, {
            secret: this.configService.get('auth.secret', { infer: true }),
          });

          this.logger.debug('JWT verification successful');
        } catch (verifyError) {
          this.logger.error('JWT verification error:', verifyError);
          return next(new WsException('Invalid authentication token'));
        }

        if (!payload || !payload.id) {
          this.logger.error('Invalid JWT payload');
          return next(new WsException('Invalid token - missing user ID'));
        }

        // Store the user ID for later use
        const userId = payload.id;
        socket.data = { userId };

        // Create a contextId for this request to resolve request-scoped services
        const contextId = ContextIdFactory.create();

        try {
          // Get the UserService instance for this context
          const userService = await this.moduleRef.resolve(
            UserService,
            contextId,
            { strict: false },
          );

          // Extract tenant ID from socket handshake
          const tenantId =
            socket.handshake.auth.tenantId ||
            socket.handshake.headers['x-tenant-id'] ||
            socket.handshake.query?.tenantId;

          this.logger.debug(
            `Using tenant ID for user lookup: ${tenantId || 'undefined'}`,
          );

          // Fetch user with Matrix credentials directly from database
          // Pass both user ID and tenant ID to the findById method
          const user = await userService.findById(userId, tenantId);

          if (!user) {
            this.logger.warn(`User ${userId} not found in database`);
            return next(new WsException('User not found'));
          }

          this.logger.debug(`Found user ${userId} in database`);

          // Check if user has Matrix credentials via registry or legacy fields
          let hasMatrixCredentials = false;
          let matrixUserId: string | null = null;

          try {
            const registryEntry =
              await this.globalMatrixValidationService.getMatrixHandleForUser(
                user.id,
                tenantId,
              );
            if (registryEntry) {
              const serverName = process.env.MATRIX_SERVER_NAME;
              if (!serverName) {
                throw new Error(
                  'MATRIX_SERVER_NAME environment variable is required',
                );
              }
              matrixUserId = `@${registryEntry.handle}:${serverName}`;
              hasMatrixCredentials = true;
            }
          } catch (error) {
            this.logger.warn(
              `Error checking Matrix registry for user ${user.id}: ${error.message}`,
            );
          }

          // Fallback to legacy fields if registry check failed
          if (!hasMatrixCredentials) {
            hasMatrixCredentials = !!(
              user.matrixUserId?.trim() &&
              user.matrixAccessToken?.trim() &&
              user.matrixDeviceId?.trim()
            );
            if (hasMatrixCredentials) {
              matrixUserId = user.matrixUserId || null;
            }
          }

          // Store minimal information in socket data
          socket.data.hasMatrixCredentials = hasMatrixCredentials;

          // We only store the Matrix user ID in the socket data, not sensitive credentials
          if (hasMatrixCredentials && matrixUserId) {
            socket.data.matrixUserId = matrixUserId;

            // Store in our tracking maps for room subscriptions
            this.roomMembershipManager.registerSocket(
              socket.id,
              user.id,
              matrixUserId,
            );

            this.logger.debug(
              `User ${userId} has Matrix credentials (${matrixUserId})`,
            );
          } else {
            this.logger.warn(
              `User ${userId} missing Matrix credentials - some features may not work`,
            );
          }

          // Store tenant ID if provided
          if (socket.handshake.auth.tenantId) {
            socket.data.tenantId = socket.handshake.auth.tenantId;
          }

          next();
        } catch (error) {
          this.logger.error(
            `Error fetching user data: ${error.message}`,
            error.stack,
          );
          return next(new WsException('Error authenticating user'));
        }
      } catch (error) {
        this.logger.error('JWT verification error:', error);
        return next(new WsException('Authentication error - invalid token'));
      }
    } catch (error) {
      this.logger.error('WebSocket authentication error:', error);
      return next(new WsException('Authentication error'));
    }
  }
}
