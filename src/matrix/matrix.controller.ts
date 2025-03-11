import {
  Controller,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  Inject,
  Sse,
  MessageEvent,
  Res,
  Req,
  Param,
  Body,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { MatrixService } from './matrix.service';
import { MatrixUserInfo } from './types/matrix.types';
import { AuthUser } from '../core/decorators/auth-user.decorator';
// User entity is imported by the UserService
import { UserService } from '../user/user.service';
import * as crypto from 'crypto';
import { Observable, map, fromEvent } from 'rxjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Request, Response } from 'express';

@ApiTags('Matrix')
@Controller({
  path: 'matrix',
})
export class MatrixController {
  private readonly logger = new Logger(MatrixController.name);

  constructor(
    private readonly matrixService: MatrixService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @ApiOperation({
    summary: 'Provision a Matrix user for the authenticated user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Matrix user provisioned successfully',
    schema: {
      properties: {
        matrixUserId: { type: 'string', example: '@john:matrix.example.org' },
        matrixAccessToken: { type: 'string' },
        matrixDeviceId: { type: 'string' },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('provision-user')
  async provisionMatrixUser(@AuthUser() user: { id: number }): Promise<{
    matrixUserId: string;
    matrixAccessToken: string;
    matrixDeviceId: string;
  }> {
    this.logger.log(`Provisioning Matrix user for user ID: ${user.id}`);

    // Check if user already has Matrix credentials
    const fullUser = await this.userService.findById(user.id);

    if (
      fullUser &&
      fullUser.matrixUserId &&
      fullUser.matrixAccessToken &&
      fullUser.matrixDeviceId
    ) {
      this.logger.log(`User ${user.id} already has Matrix credentials`);
      return {
        matrixUserId: fullUser.matrixUserId,
        matrixAccessToken: fullUser.matrixAccessToken,
        matrixDeviceId: fullUser.matrixDeviceId,
      };
    }

    if (!fullUser) {
      throw new Error(`User with ID ${user.id} not found`);
    }

    // Generate a random password for the Matrix user
    const password = crypto.randomBytes(16).toString('hex');

    // Create a Matrix username from the user's UUID or other unique identifier
    // Use a prefix to ensure it's valid for Matrix (no @ symbols allowed in usernames)
    const matrixUsername = `om_${fullUser.ulid}`;

    // Use the display name from the user's profile
    const displayName =
      [fullUser.firstName, fullUser.lastName].filter(Boolean).join(' ') ||
      'OpenMeet User';

    try {
      // Create the Matrix user
      const matrixUserInfo: MatrixUserInfo =
        await this.matrixService.createUser({
          username: matrixUsername,
          password,
          displayName,
        });

      // Make sure display name is set properly (sometimes it doesn't get set during creation)
      try {
        await this.matrixService.setUserDisplayNameDirect(
          matrixUserInfo.userId,
          matrixUserInfo.accessToken,
          displayName,
        );
        this.logger.log(
          `Set Matrix display name for ${matrixUserInfo.userId} to "${displayName}"`,
        );
      } catch (displayNameError) {
        this.logger.warn(
          `Failed to set Matrix display name: ${displayNameError.message}`,
        );
        // Non-fatal error, continue
      }

      // Get tenant ID from request context
      const tenantId = this.request?.tenantId;

      // Update the user record with Matrix credentials
      await this.userService.update(
        user.id,
        {
          matrixUserId: matrixUserInfo.userId,
          matrixAccessToken: matrixUserInfo.accessToken,
          matrixDeviceId: matrixUserInfo.deviceId,
          preferences: {
            ...fullUser.preferences,
            matrix: {
              connected: true,
              connectedAt: new Date(),
            },
          },
        },
        tenantId,
      );

      this.logger.log(
        `Matrix user provisioned successfully for user ID: ${user.id}`,
      );

      return {
        matrixUserId: matrixUserInfo.userId,
        matrixAccessToken: matrixUserInfo.accessToken,
        matrixDeviceId: matrixUserInfo.deviceId,
      };
    } catch (error) {
      this.logger.error(
        `Error provisioning Matrix user: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Server-Sent Events endpoint for Matrix events
   * Streams Matrix events in real-time to the client
   */
  @ApiOperation({
    summary: 'Stream Matrix events as server-sent events',
    description:
      'Establishes a server-sent events connection for real-time Matrix updates.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'SSE stream established.',
  })
  @UseGuards(JWTAuthGuard)
  @Sse('events')
  async streamMatrixEvents(
    @Req() req: Request,
    @Res() res: Response,
    @AuthUser() user: { id: number },
  ): Promise<Observable<MessageEvent>> {
    this.logger.log(`Setting up SSE connection for user ID: ${user.id}`);

    try {
      // Get full user information
      const fullUser = await this.userService.findById(user.id);

      if (!fullUser || !fullUser.matrixUserId || !fullUser.matrixAccessToken) {
        this.logger.warn(
          `User ${user.id} doesn't have Matrix credentials, can't stream events`,
        );
        // Return empty observable - client will have to provision Matrix user
        return new Observable<MessageEvent>();
      }

      // Set up headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Start Matrix client for this user if not already running
      await this.matrixService.startClient({
        userId: fullUser.matrixUserId,
        accessToken: fullUser.matrixAccessToken,
        deviceId: fullUser.matrixDeviceId,
      });

      // Create a client-specific event stream
      const userEventStreamKey = `matrix.events.${fullUser.matrixUserId}`;

      // Create an observable from the EventEmitter events
      return fromEvent(this.eventEmitter, userEventStreamKey).pipe(
        map((event: any): MessageEvent => {
          // Map the event to a format expected by SSE
          // Determine the event type
          let eventType = 'message';

          if (event.type) {
            eventType = event.type; // Use the Matrix event type if available
          }

          return {
            type: eventType,
            data: JSON.stringify(event),
          };
        }),
      );
    } catch (error) {
      this.logger.error(
        `Error setting up SSE for user ${user.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send typing notification to a Matrix room
   */
  @ApiOperation({
    summary: 'Send typing notification to a Matrix room',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Typing notification sent successfully',
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':roomId/typing')
  async sendTypingNotification(
    @AuthUser() user: { id: number },
    @Req() req: Request,
    @Param('roomId') roomId: string,
    @Body() body: { isTyping: boolean },
  ): Promise<{ success: boolean }> {
    try {
      this.logger.log(
        `Sending typing notification for user ${user.id} in room ${roomId}, typing: ${body.isTyping}`,
      );

      // Get full user information
      const fullUser = await this.userService.findById(user.id);

      if (!fullUser || !fullUser.matrixUserId || !fullUser.matrixAccessToken) {
        throw new Error('User does not have Matrix credentials');
      }

      // Send typing notification
      await this.matrixService.sendTypingNotification(
        roomId,
        fullUser.matrixUserId,
        fullUser.matrixAccessToken,
        body.isTyping,
        fullUser.matrixDeviceId,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error sending typing notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
