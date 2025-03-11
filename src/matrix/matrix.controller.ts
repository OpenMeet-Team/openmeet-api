import {
  Controller,
  Post,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  Inject,
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

@ApiTags('Matrix')
@Controller({
  path: 'matrix',
})
export class MatrixController {
  private readonly logger = new Logger(MatrixController.name);

  constructor(
    private readonly matrixService: MatrixService,
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
          displayName
        );
        this.logger.log(`Set Matrix display name for ${matrixUserInfo.userId} to "${displayName}"`);
      } catch (displayNameError) {
        this.logger.warn(`Failed to set Matrix display name: ${displayNameError.message}`);
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
}
