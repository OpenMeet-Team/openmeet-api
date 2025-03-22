import {
  Controller,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  Inject,
  Param,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JWTAuthGuard } from '../auth/auth.guard';
import { MatrixUserInfo } from './types/matrix.types';
import { AuthUser } from '../core/decorators/auth-user.decorator';
// User entity is imported by the UserService
import { UserService } from '../user/user.service';
import { Request } from 'express';
import { MatrixUserService } from './services/matrix-user.service';
import { MatrixRoomService } from './services/matrix-room.service';
import { MatrixMessageService } from './services/matrix-message.service';
import { MatrixGateway } from './matrix.gateway';
import { MatrixPasswordDto } from './dto/matrix-password.dto';

@ApiTags('Matrix')
@Controller({
  path: 'matrix',
})
export class MatrixController {
  private readonly logger = new Logger(MatrixController.name);

  constructor(
    private readonly matrixUserService: MatrixUserService,
    private readonly matrixRoomService: MatrixRoomService,
    private readonly matrixMessageService: MatrixMessageService,
    private readonly matrixGateway: MatrixGateway,
    private readonly userService: UserService,
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
        provisioned: { type: 'boolean', example: true },
        success: { type: 'boolean', example: true },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('provision-user')
  async provisionMatrixUser(@AuthUser() user: { id: number }): Promise<{
    matrixUserId: string;
    provisioned: boolean;
    success: boolean;
  }> {
    const tenantId = this.request?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }
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
        provisioned: false, // Already provisioned
        success: true,
      };
    }

    if (!fullUser) {
      throw new Error(`User with ID ${user.id} not found`);
    }

    try {
      // Use the centralized provisioning method
      const matrixUserInfo: MatrixUserInfo = await this.matrixUserService.provisionMatrixUser(
        fullUser,
        tenantId
      );

      // Display name is now set in the provisionMatrixUser method

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

      // Return only the Matrix user ID to the client, not the credentials
      return {
        matrixUserId: matrixUserInfo.userId,
        provisioned: true,
        success: true,
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
   * Get information about Matrix WebSocket connection
   */
  @ApiOperation({
    summary: 'Get WebSocket connection information',
    description:
      'Returns information about the Matrix WebSocket endpoint and authentication status.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'WebSocket information returned.',
    schema: {
      properties: {
        endpoint: { type: 'string', example: 'wss://api.example.com/matrix' },
        authenticated: { type: 'boolean', example: true },
        matrixUserId: { type: 'string', example: '@john:matrix.example.org' },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('websocket-info')
  async getWebSocketInfo(
    @AuthUser() user: { id: number },
    @Req() req: Request,
  ): Promise<{
    endpoint: string;
    authenticated: boolean;
    matrixUserId: string | null;
  }> {
    this.logger.log(`WebSocket info requested for user ID: ${user.id}`);

    try {
      // Get full user information
      const fullUser = await this.userService.findById(user.id);

      // Determine WebSocket endpoint based on configuration
      // Get the WebSocket endpoint from environment or service
      const apiBaseUrl =
        process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
      const webSocketEndpoint = process.env.MATRIX_WEBSOCKET_ENDPOINT
        ? process.env.MATRIX_WEBSOCKET_ENDPOINT
        : apiBaseUrl;

      // Check if the user has valid Matrix credentials
      const hasCredentials = !!(
        fullUser?.matrixUserId && fullUser?.matrixAccessToken
      );

      // Log detailed information for debugging
      this.logger.debug('WebSocket endpoint info:', {
        endpoint: webSocketEndpoint,
        authenticated: hasCredentials,
        userId: user.id,
        matrixUserId: fullUser?.matrixUserId,
        hasMatrixCredentials: hasCredentials,
      });

      // Return info to client (no sensitive credentials)
      return {
        endpoint: webSocketEndpoint,
        authenticated: hasCredentials,
        matrixUserId: fullUser?.matrixUserId || null,
      };
    } catch (error) {
      this.logger.error(
        `Error getting WebSocket info for user ${user.id}: ${error.message}`,
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

      try {
        // Get the tenant ID from the request
        const tenantId = this.request.tenantId;
        this.logger.debug(`Using tenant ID for Matrix client: ${tenantId}`);

        // Get full user info to get the slug
        const fullUser = await this.userService.findById(user.id, tenantId);

        if (!fullUser) {
          throw new Error(`User with ID ${user.id} not found`);
        }

        // Get Matrix client for this user using credentials from database and slug
        const matrixClient = await this.matrixUserService.getClientForUser(
          fullUser.slug,
          this.userService,
          tenantId,
        );

        // Send typing notification using the Matrix client
        await matrixClient.sendTyping(roomId, body.isTyping, 30000);

        this.logger.debug(
          `Typing notification sent for user ${user.id} in room ${roomId}`,
        );

        return { success: true };
      } catch (error) {
        this.logger.error(`Error using Matrix client: ${error.message}`);

        // Fall back to traditional credential usage method (will be deprecated)
        this.logger.debug('Falling back to traditional credential method');

        // Get the tenant ID from the request
        const tenantId = this.request.tenantId;
        this.logger.debug(`Using tenant ID for fallback method: ${tenantId}`);

        // Get full user information
        const fullUser = await this.userService.findById(user.id, tenantId);

        if (
          !fullUser ||
          !fullUser.matrixUserId ||
          !fullUser.matrixAccessToken
        ) {
          throw new Error('User does not have Matrix credentials');
        }

        // Send typing notification
        await this.matrixMessageService.sendTypingNotification(
          roomId,
          fullUser.matrixUserId,
          fullUser.matrixAccessToken,
          body.isTyping,
          fullUser.matrixDeviceId,
        );
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error sending typing notification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Set a Matrix password for direct client access
   */
  @ApiOperation({
    summary: 'Set a Matrix password for direct client access',
    description:
      'Allows a user to set a password for their Matrix account to use with third-party Matrix clients',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Matrix password set successfully',
    schema: {
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Matrix password set successfully',
        },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('set-password')
  async setMatrixPassword(
    @AuthUser() user: { id: number },
    @Body() matrixPasswordDto: MatrixPasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Get the tenant ID from the request context
      const tenantId = this.request.tenantId;

      // Use the service method to handle all the complexity
      await this.matrixUserService.setUserMatrixPassword(
        user.id,
        matrixPasswordDto.password,
        tenantId,
      );

      return {
        success: true,
        message:
          'Matrix password set successfully. You can now use this password with any Matrix client.',
      };
    } catch (error) {
      this.logger.error(
        `Error setting Matrix password for user ${user.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Test endpoint to broadcast a message to a Matrix room via WebSocket
   * This helps debug WebSocket event propagation without requiring an actual
   * Matrix message to be sent
   */
  @ApiOperation({
    summary: 'Test broadcast to Matrix room via WebSocket',
    description:
      'Broadcasts a test message to a room via WebSocket without sending an actual Matrix message',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Test broadcast sent successfully',
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('test-broadcast')
  async testBroadcast(
    @AuthUser() user: { id: number },
    @Body() body: { roomId: string; message?: string },
  ): Promise<any> {
    try {
      const { roomId, message } = body;

      if (!roomId) {
        throw new Error('Room ID is required');
      }

      this.logger.log(
        `Testing broadcast to room ${roomId} from user ${user.id}`,
      );

      // Get user for Matrix user ID
      const fullUser = await this.userService.findById(user.id);
      if (!fullUser || !fullUser.matrixUserId) {
        throw new Error('User has no Matrix credentials');
      }

      // Create a test event object
      const testEvent = {
        type: 'm.room.message',
        room_id: roomId,
        event_id: `test-${Date.now()}`,
        sender: fullUser.matrixUserId,
        content: {
          msgtype: 'm.text',
          body: message || 'Test broadcast message',
        },
        origin_server_ts: Date.now(),
        timestamp: Date.now(),
      };

      // Use the Matrix gateway directly
      if (!this.matrixGateway) {
        throw new Error('Matrix gateway not available for broadcasting');
      }

      // Broadcast the event directly
      this.matrixGateway.broadcastRoomEvent(roomId, testEvent);

      return {
        success: true,
        event: testEvent,
        message: 'Test broadcast sent successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error testing broadcast: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
