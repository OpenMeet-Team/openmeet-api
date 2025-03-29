import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { RoomMembershipManager } from './room-membership.helper';

export class SocketAuthHandler {
  constructor(
    private readonly logger: Logger,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    private readonly roomMembershipManager: RoomMembershipManager,
  ) {}

  // Authenticate socket connection using JWT from query string or headers
  async authenticate(socket: Socket, next: (err?: Error) => void) {
    try {
      // Extract token from headers or query params
      let token = this.extractToken(socket);

      // Keep track of where we found the token for debugging
      const tokenSearch = {
        authToken: !!socket.handshake.auth?.token,
        headerAuth: !!socket.handshake.headers?.authorization,
        queryToken: !!socket.handshake.query?.token,
      };
      this.logger.debug(`Token search locations:`, tokenSearch);

      // Get tenant ID from headers or query params
      const tenantId =
        (socket.handshake.headers['x-tenant-id'] as string) ||
        (socket.handshake.query['x-tenant-id'] as string);

      if (!tenantId) {
        this.logger.warn(`Socket connection without tenant ID: ${socket.id}`);
      } else {
        this.logger.debug(`Socket connection with tenant ID: ${tenantId}`);
      }

      // If no token found, fail the connection
      if (!token) {
        this.logger.warn(`No token found for socket ${socket.id}`);
        return next(new Error('Authentication failed - no token provided'));
      }

      try {
        // Parse token
        if (token.startsWith('Bearer ')) {
          token = token.slice(7);
        }

        // Validate the token
        const jwtPayload = await this.validateToken(token);
        const userId = jwtPayload.sub;

        // Store authentication data in the socket
        socket.data = {
          ...socket.data,
          authenticated: true,
          userId,
          token,
          tenantId,
          hasMatrixCredentials: false, // Will be set later
          matrixClientInitialized: false, // Will be set later
        };

        next();
      } catch (error) {
        this.logger.error(
          `Authentication error: ${error.message}`,
          error.stack,
        );
        return next(new Error(`Authentication failed: ${error.message}`));
      }
    } catch (error) {
      this.logger.error(`Socket auth error: ${error.message}`, error.stack);
      return next(new Error(`Authentication error: ${error.message}`));
    }
  }

  // Extract token from socket handshake (headers, query, or auth)
  private extractToken(socket: Socket): string | undefined {
    // Check headers first
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader) {
      return authHeader;
    }

    // Check query params
    const queryToken = socket.handshake.query.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    // Check auth object
    const authToken = socket.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    return undefined;
  }

  // Validate JWT token
  private async validateToken(token: string): Promise<any> {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('auth.secret', { infer: true }),
      });

      return payload;
    } catch (error) {
      throw new Error(`Invalid token: ${error.message}`);
    }
  }
}
