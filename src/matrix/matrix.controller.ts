import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  HttpStatus,
  HttpCode,
  Logger,
  Inject,
  Body,
  Req,
  BadRequestException,
  Query,
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
import { MatrixPasswordDto } from './dto/matrix-password.dto';
import { GlobalMatrixValidationService } from './services/global-matrix-validation.service';
import { Trace } from '../utils/trace.decorator';
import { TempAuthCodeService } from '../auth/services/temp-auth-code.service';
import { MatrixEventListener } from './matrix-event.listener';

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
    private readonly userService: UserService,
    private readonly globalMatrixValidationService: GlobalMatrixValidationService,
    private readonly tempAuthCodeService: TempAuthCodeService,
    private readonly matrixEventListener: MatrixEventListener,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  @ApiOperation({
    summary: 'Check if a Matrix handle is available',
    description:
      'Validates Matrix handle availability and format for real-time validation during user registration',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Handle availability check result',
    schema: {
      properties: {
        available: { type: 'boolean', example: true },
        handle: { type: 'string', example: 'john.smith' },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          example: ['john.smith2', 'john.smith3'],
        },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Get('handle/check')
  @Trace('matrix.api.handleCheck')
  async checkMatrixHandle(@Query('handle') handle: string): Promise<{
    available: boolean;
    handle: string;
    suggestions?: string[];
  }> {
    if (!handle || typeof handle !== 'string') {
      throw new BadRequestException('Handle parameter is required');
    }

    this.logger.log(`Checking Matrix handle availability: ${handle}`);

    try {
      const available =
        await this.globalMatrixValidationService.isMatrixHandleUnique(handle);

      const result: any = {
        available,
        handle,
      };

      // If handle is not available, provide suggestions
      if (!available) {
        result.suggestions =
          await this.globalMatrixValidationService.suggestAvailableHandles(
            handle,
          );
      }

      this.logger.debug(
        `Matrix handle check result: ${handle} -> ${available ? 'available' : 'taken'}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Error checking Matrix handle availability for ${handle}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Get Matrix handle suggestions',
    description:
      'Get alternative Matrix handle suggestions based on a desired handle',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Handle suggestions returned',
    schema: {
      properties: {
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          example: ['john.smith', 'johnsmith', 'j.smith'],
        },
        desiredHandle: { type: 'string', example: 'john smith' },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Get('handle/suggest')
  @Trace('matrix.api.handleSuggest')
  async suggestMatrixHandles(
    @Query('handle') desiredHandle: string,
    @Query('limit') limit?: string,
  ): Promise<{
    suggestions: string[];
    desiredHandle: string;
  }> {
    if (!desiredHandle || typeof desiredHandle !== 'string') {
      throw new BadRequestException('Handle parameter is required');
    }

    const maxSuggestions = limit ? parseInt(limit, 10) : 5;
    if (maxSuggestions < 1 || maxSuggestions > 20) {
      throw new BadRequestException('Limit must be between 1 and 20');
    }

    this.logger.log(
      `Generating Matrix handle suggestions for: ${desiredHandle}`,
    );

    try {
      const suggestions =
        await this.globalMatrixValidationService.suggestAvailableHandles(
          desiredHandle,
          maxSuggestions,
        );

      return {
        suggestions,
        desiredHandle,
      };
    } catch (error) {
      this.logger.error(
        `Error generating Matrix handle suggestions for ${desiredHandle}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Provision a Matrix user with a chosen handle',
    description:
      'Creates a Matrix account with a user-chosen handle for clean Matrix IDs',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Matrix user provisioned successfully with chosen handle',
    schema: {
      properties: {
        matrixUserId: {
          type: 'string',
          example: '@john.smith:matrix.openmeet.net',
        },
        handle: { type: 'string', example: 'john.smith' },
        provisioned: { type: 'boolean', example: true },
        success: { type: 'boolean', example: true },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('provision-user-with-handle')
  @Trace('matrix.api.provisionWithHandle')
  async provisionMatrixUserWithHandle(
    @AuthUser() user: { id: number },
    @Body() body: { handle?: string },
  ): Promise<{
    matrixUserId: string;
    handle: string;
    provisioned: boolean;
    success: boolean;
  }> {
    const tenantId = this.request?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    this.logger.log(
      `Provisioning Matrix user with handle for user ID: ${user.id}, requested handle: ${body.handle || 'auto-generate'}`,
    );

    // Check if user already has Matrix credentials via registry
    let registryEntry: any = null;
    try {
      registryEntry =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          tenantId,
        );
    } catch (error) {
      this.logger.warn(
        `Error checking Matrix registry for user ${user.id}: ${error.message}`,
      );
    }

    if (registryEntry) {
      // User already has Matrix handle registered
      const serverName = process.env.MATRIX_SERVER_NAME;
      if (!serverName) {
        throw new Error('MATRIX_SERVER_NAME environment variable is required');
      }
      const matrixUserId = `@${registryEntry.handle}:${serverName}`;
      this.logger.log(
        `User ${user.id} already has Matrix handle: ${registryEntry.handle}`,
      );

      return {
        matrixUserId,
        handle: registryEntry.handle,
        provisioned: false, // Already provisioned
        success: true,
      };
    }

    // Fallback: Check legacy matrixUserId field
    const fullUser = await this.userService.findById(user.id);
    if (
      fullUser &&
      fullUser.matrixUserId &&
      fullUser.matrixAccessToken &&
      fullUser.matrixDeviceId
    ) {
      // User has legacy Matrix account - extract existing handle
      const existingHandle =
        fullUser.matrixUserId.match(/@(.+):/)?.[1] || 'unknown';
      this.logger.log(
        `User ${user.id} has legacy Matrix credentials with handle: ${existingHandle}`,
      );

      return {
        matrixUserId: fullUser.matrixUserId,
        handle: existingHandle,
        provisioned: false, // Already provisioned
        success: true,
      };
    }

    if (!fullUser) {
      throw new Error(`User with ID ${user.id} not found`);
    }

    try {
      // Use the new handle-based provisioning method
      const matrixUserInfo =
        await this.matrixUserService.provisionMatrixUserWithHandle(
          fullUser,
          tenantId,
          user.id,
          body.handle,
        );

      // Extract handle from the Matrix user ID
      const handle = matrixUserInfo.userId.match(/@(.+):/)?.[1] || 'unknown';

      // Register the Matrix handle in the global registry (already done in provisionMatrixUserWithHandle)

      // Update only the user preferences (no longer storing Matrix credentials in user table)
      await this.userService.update(
        user.id,
        {
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
        `Matrix user provisioned successfully for user ID: ${user.id} with handle: ${handle}`,
      );

      return {
        matrixUserId: matrixUserInfo.userId,
        handle,
        provisioned: true,
        success: true,
      };
    } catch (error) {
      this.logger.error(
        `Error provisioning Matrix user with handle: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Provision a Matrix user for the authenticated user (legacy)',
    description:
      'DEPRECATED: Legacy endpoint using tenant-prefixed usernames. Use provision-user-with-handle instead. This endpoint will be removed on 2025-10-29.',
    deprecated: true,
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
  async provisionMatrixUser(
    @AuthUser() user: { id: number },
    @Req() req: Request,
  ): Promise<{
    matrixUserId: string;
    provisioned: boolean;
    success: boolean;
    deprecationWarning?: string;
  }> {
    const tenantId = this.request?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant ID is required');
    }

    // Log deprecation warning
    this.logger.warn(
      `DEPRECATED: POST /matrix/provision-user endpoint used by user ${user.id}. ` +
        `This endpoint will be removed on 2025-10-29. ` +
        `Please migrate to POST /matrix/provision-user-with-handle.`,
    );

    // Set deprecation headers
    if (req.res) {
      req.res.setHeader('Deprecation', 'true');
      req.res.setHeader('Sunset', 'Wed, 29 Oct 2025 00:00:00 GMT');
      req.res.setHeader(
        'Link',
        '</api/matrix/provision-user-with-handle>; rel="successor-version"',
      );
    }

    this.logger.log(`Provisioning Matrix user for user ID: ${user.id}`);

    // Check if user already has Matrix credentials via registry
    let registryEntry: any = null;
    try {
      registryEntry =
        await this.globalMatrixValidationService.getMatrixHandleForUser(
          user.id,
          tenantId,
        );
    } catch (error) {
      this.logger.warn(
        `Error checking Matrix registry for user ${user.id}: ${error.message}`,
      );
    }

    if (registryEntry) {
      // User already has Matrix handle registered
      const serverName = process.env.MATRIX_SERVER_NAME;
      if (!serverName) {
        throw new Error('MATRIX_SERVER_NAME environment variable is required');
      }
      const matrixUserId = `@${registryEntry.handle}:${serverName}`;
      this.logger.log(`User ${user.id} already has Matrix credentials`);
      return {
        matrixUserId,
        provisioned: false, // Already provisioned
        success: true,
        deprecationWarning:
          'This endpoint is deprecated and will be removed on 2025-10-29. Please migrate to POST /matrix/provision-user-with-handle for better handle control.',
      };
    }

    // Fallback: Check legacy matrixUserId field
    const fullUser = await this.userService.findById(user.id);
    if (
      fullUser &&
      fullUser.matrixUserId &&
      fullUser.matrixAccessToken &&
      fullUser.matrixDeviceId
    ) {
      this.logger.log(`User ${user.id} has legacy Matrix credentials`);
      return {
        matrixUserId: fullUser.matrixUserId,
        provisioned: false, // Already provisioned
        success: true,
        deprecationWarning:
          'This endpoint is deprecated and will be removed on 2025-10-29. Please migrate to POST /matrix/provision-user-with-handle for better handle control.',
      };
    }

    if (!fullUser) {
      throw new Error(`User with ID ${user.id} not found`);
    }

    try {
      // Use the centralized provisioning method
      const matrixUserInfo: MatrixUserInfo =
        await this.matrixUserService.provisionMatrixUser(fullUser, tenantId);

      // Display name is now set in the provisionMatrixUser method

      // Extract handle from Matrix user ID and register in the global registry
      const handle = matrixUserInfo.userId.match(/@(.+):/)?.[1];
      if (!handle) {
        throw new Error(
          `Could not extract handle from Matrix user ID: ${matrixUserInfo.userId}`,
        );
      }
      await this.globalMatrixValidationService.registerMatrixHandle(
        handle,
        tenantId,
        user.id,
      );

      // Update only the user preferences (no longer storing Matrix credentials in user table)
      await this.userService.update(
        user.id,
        {
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
        deprecationWarning:
          'This endpoint is deprecated and will be removed on 2025-10-29. Please migrate to POST /matrix/provision-user-with-handle for better handle control.',
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

  @ApiOperation({
    summary: 'Generate a short-lived authentication code for Matrix SSO',
    description:
      'Creates a temporary authentication code that can be used for seamless Matrix OIDC authentication',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Authentication code generated successfully',
    schema: {
      properties: {
        authCode: {
          type: 'string',
          example: 'a1b2c3d4e5f6...',
        },
        expiresIn: {
          type: 'number',
          example: 300,
          description: 'Expiration time in seconds',
        },
        expiresAt: {
          type: 'string',
          example: '2025-06-19T20:45:00.000Z',
          description: 'ISO timestamp when code expires',
        },
      },
    },
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('generate-auth-code')
  @Trace('matrix.api.generateAuthCode')
  async generateMatrixAuthCode(
    @AuthUser() user: { id: number },
    @Req() req: Request,
  ): Promise<{
    authCode: string;
    expiresIn: number;
    expiresAt: string;
    fallbackUrl?: string;
  }> {
    this.logger.log(`Generating Matrix auth code for user ID: ${user.id}`);

    try {
      // Get tenant ID from request context
      const tenantId = req['tenantId'];
      if (!tenantId) {
        this.logger.error(
          `No tenant ID found in request context for user ${user.id}`,
        );
        throw new BadRequestException(
          'Tenant ID is required - ensure you are authenticated with a valid session',
        );
      }

      // Validate user exists in the tenant
      try {
        const userEntity = await this.userService.findById(user.id, tenantId);
        if (!userEntity) {
          this.logger.error(`User ${user.id} not found in tenant ${tenantId}`);
          throw new BadRequestException(
            'User not found in the specified tenant',
          );
        }
      } catch (userError) {
        this.logger.error(
          `Error validating user ${user.id} in tenant ${tenantId}: ${userError.message}`,
        );
        throw new BadRequestException(
          'Unable to validate user in tenant context',
        );
      }

      // Generate the temporary authentication code
      const authCode = await this.tempAuthCodeService.generateAuthCode(
        user.id,
        tenantId,
      );

      // Calculate expiration details (5 minutes from now)
      const expiresIn = 5 * 60; // 5 minutes in seconds
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      this.logger.log(
        `Matrix auth code generated successfully for user ${user.id}, tenant ${tenantId}, expires at ${expiresAt}`,
      );

      return {
        authCode,
        expiresIn,
        expiresAt,
      };
    } catch (error) {
      this.logger.error(
        `Error generating Matrix auth code for user ${user.id}: ${error.message}`,
        error.stack,
      );

      // Log additional debugging information
      this.logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
      this.logger.debug(`Request tenant context: ${req['tenantId']}`);

      throw error;
    }
  }

  @ApiOperation({
    summary: 'Sync Matrix user identity after MAS authentication',
    description:
      'Register Matrix user ID with backend after successful MAS authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Matrix user identity synced successfully',
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('sync-user-identity')
  @Trace('matrix.api.syncUserIdentity')
  async syncMatrixUserIdentity(
    @AuthUser() user: { id: number },
    @Body() body: { matrixUserId: string },
    @Req() req: Request,
  ): Promise<{
    success: boolean;
    matrixUserId: string;
    handle: string;
  }> {
    this.logger.log(
      `Syncing Matrix user identity for user ID: ${user.id}, Matrix ID: ${body.matrixUserId}`,
    );

    try {
      // Get tenant ID from request context
      const tenantId = req['tenantId'];
      if (!tenantId) {
        throw new BadRequestException('Tenant ID is required');
      }

      // Validate Matrix user ID format
      if (!body.matrixUserId || !body.matrixUserId.startsWith('@')) {
        throw new BadRequestException('Invalid Matrix user ID format');
      }

      // Extract handle from Matrix user ID
      const handle = body.matrixUserId.match(/@(.+):/)?.[1];
      if (!handle) {
        throw new BadRequestException(
          `Could not extract handle from Matrix user ID: ${body.matrixUserId}`,
        );
      }

      // Register the Matrix handle in the global registry
      await this.globalMatrixValidationService.registerMatrixHandle(
        handle,
        tenantId,
        user.id,
      );

      this.logger.log(
        `Matrix user identity synced successfully for user ${user.id}, Matrix ID: ${body.matrixUserId}, handle: ${handle}`,
      );

      return {
        success: true,
        matrixUserId: body.matrixUserId,
        handle,
      };
    } catch (error) {
      this.logger.error(
        `Error syncing Matrix user identity for user ${user.id}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message);
    }
  }

  @ApiOperation({
    summary: 'Clear Matrix user identity',
    description:
      'Remove Matrix user identity from the registry (for testing purposes)',
  })
  @ApiResponse({
    status: 200,
    description: 'Matrix user identity cleared successfully',
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete('user-identity')
  @Trace('matrix.api.clearUserIdentity')
  async clearMatrixUserIdentity(
    @AuthUser() user: { id: number },
    @Req() req: Request,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.log(`Clearing Matrix user identity for user ID: ${user.id}`);

    try {
      // Get tenant ID from request context
      const tenantId = req['tenantId'];
      if (!tenantId) {
        throw new BadRequestException('Tenant ID is required');
      }

      // Clear the Matrix handle from the global registry
      await this.globalMatrixValidationService.unregisterMatrixHandle(
        tenantId,
        user.id,
      );

      this.logger.log(
        `Matrix user identity cleared successfully for user ${user.id}`,
      );

      return {
        success: true,
        message: 'Matrix user identity cleared successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error clearing Matrix user identity for user ${user.id}: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(error.message);
    }
  }

  @ApiOperation({
    summary: 'Sync all existing event attendees to Matrix rooms (Admin)',
    description:
      'One-time sync of all confirmed attendees across all tenants to their respective Matrix rooms. Returns detailed results for admin dashboard.',
  })
  @ApiResponse({
    status: 200,
    description: 'Matrix sync completed with detailed results',
  })
  @UseGuards(JWTAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('admin/sync-all-attendees')
  @Trace('matrix.api.syncAllAttendees')
  async syncAllEventAttendees(
    @Body() body: { maxEventsPerTenant?: number },
  ): Promise<{
    success: boolean;
    message: string;
    results: {
      totalTenants: number;
      totalEvents: number;
      totalUsersAdded: number;
      totalErrors: number;
      startTime: Date;
      endTime: Date;
      duration: number;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        eventsProcessed: number;
        totalUsersAdded: number;
        totalErrors: number;
        events: Array<{
          eventSlug: string;
          eventName: string;
          attendeesFound: number;
          usersAdded: number;
          errors: string[];
          success: boolean;
        }>;
        errors: string[];
        success: boolean;
      }>;
    };
  }> {
    this.logger.log('🚀 Admin Matrix sync initiated for all tenants');

    try {
      // Call the sync method in MatrixRoomService with optional limit
      const results =
        await this.matrixRoomService.syncAllEventAttendeesToMatrix(
          body.maxEventsPerTenant,
        );

      this.logger.log(
        `✨ Admin Matrix sync completed: ${results.totalTenants} tenants, ${results.totalEvents} events, ${results.totalUsersAdded} users added, ${results.totalErrors} errors`,
      );

      return {
        success: true,
        message: `Matrix sync completed for ${results.totalTenants} tenants and ${results.totalEvents} events`,
        results,
      };
    } catch (error) {
      this.logger.error(
        `💥 Error during admin Matrix sync: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(`Matrix sync failed: ${error.message}`);
    }
  }
}
