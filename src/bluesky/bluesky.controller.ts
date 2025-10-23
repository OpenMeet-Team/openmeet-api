import {
  Controller,
  Post,
  Get,
  Delete,
  UseGuards,
  Param,
  Req,
  Logger,
  HttpException,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { JWTAuthGuard } from '../auth/auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { RoleEnum } from '../role/role.enum';
import { Public } from '../auth/decorators/public.decorator';
import { UserService } from '../user/user.service';

@ApiTags('Bluesky')
@Controller('bluesky')
@UseGuards(JWTAuthGuard)
@ApiBearerAuth()
export class BlueskyController {
  private readonly logger = new Logger(BlueskyController.name);

  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly userService: UserService,
  ) {}

  @Post('connect')
  @ApiOperation({ summary: 'Enable Bluesky event source' })
  async connect(@AuthUser() user: UserEntity, @Req() req) {
    return this.blueskyService.connectAccount(user, req.tenantId);
  }

  @Delete('disconnect')
  @ApiOperation({ summary: 'Disconnect Bluesky account' })
  async disconnect(@AuthUser() user: UserEntity, @Req() req) {
    return this.blueskyService.disconnectAccount(user, req.tenantId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Bluesky connection status' })
  async getStatus(@AuthUser() user: UserEntity) {
    return this.blueskyService.getConnectionStatus(user);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get enhanced ATProtocol profile for the current user',
  })
  async getCurrentUserProfile(@AuthUser() user: UserEntity, @Req() req) {
    try {
      if (
        !user.preferences?.bluesky?.did &&
        !user.preferences?.bluesky?.handle
      ) {
        return {
          connected: false,
          message: 'No ATProtocol account connected',
        };
      }

      return await this.blueskyService.getEnhancedProfile(user, req.tenantId);
    } catch (error) {
      this.logger.error('Error fetching current user ATProtocol profile', {
        error: error.message,
        stack: error.stack,
        userId: user.id,
      });

      throw new HttpException(
        error.message || 'Failed to fetch profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Public()
  @Get('profile/:identifier')
  @ApiOperation({ summary: 'Get public ATProtocol profile by DID or handle' })
  async getPublicProfile(@Param('identifier') identifier: string) {
    try {
      this.logger.debug(`Public profile lookup for: ${identifier}`);
      return await this.blueskyService.getPublicProfile(identifier);
    } catch (error) {
      this.logger.error('Error fetching public ATProtocol profile', {
        error: error.message,
        stack: error.stack,
        identifier,
      });

      throw new HttpException(
        error.message || 'Failed to fetch profile',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('user-profile/:slug')
  @ApiOperation({
    summary: 'Get ATProtocol profile for a specific OpenMeet user by slug',
  })
  async getUserProfile(
    @Param('slug') slug: string,
    @Req() req,
    @AuthUser() currentUser: UserEntity,
  ) {
    try {
      const user = await this.userService.findBySlug(slug, req.tenantId);

      if (!user) {
        throw new NotFoundException(`User with slug ${slug} not found`);
      }

      // Only allow viewing full profile details if admin or the user themselves
      const isAdmin = currentUser.role?.name === RoleEnum.Admin;
      const isSelf = currentUser.id === user.id;

      if (!isAdmin && !isSelf) {
        return {
          message: 'User profile basics only',
          // Return minimal public info
          handle: user.preferences?.bluesky?.handle,
          connected: !!user.preferences?.bluesky?.connected,
        };
      }

      return await this.blueskyService.getEnhancedProfile(user, req.tenantId);
    } catch (error) {
      this.logger.error('Error fetching ATProtocol profile for user', {
        error: error.message,
        stack: error.stack,
        slug,
      });

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new HttpException(
        error.message || 'Failed to fetch profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('events/:did')
  @ApiOperation({ summary: 'List Bluesky events' })
  async listEvents(@Req() req, @Param('did') did: string) {
    return await this.blueskyService.listEvents(did, req.tenantId);
  }

  @Delete('events/:did/:rkey')
  @ApiOperation({ summary: 'Delete Bluesky event' })
  async deleteEvent(
    @Req() req,
    @Param('did') did: string,
    @Param('rkey') rkey: string,
  ) {
    return this.blueskyService.deleteEventRecord(
      { sourceType: 'bluesky', sourceId: did, sourceData: { rkey } } as any,
      did,
      req.tenantId,
    );
  }

  @Post('admin/session/reset/:did')
  @ApiOperation({
    summary: 'Admin-only endpoint to reset a Bluesky session',
  })
  async adminResetSession(
    @Param('did') did: string,
    @Req() req,
    @AuthUser() user: UserEntity,
  ) {
    // Verify user is an admin - check both role name and id
    const isAdmin = user.role?.name === RoleEnum.Admin || user.role?.id === 2;

    if (!isAdmin) {
      this.logger.warn(
        `Non-admin user ${user.id} attempted to access admin-only endpoint`,
        { role: user.role },
      );
      throw new ForbiddenException('Admin role required');
    }

    this.logger.log(
      `Admin ${user.id} is resetting Bluesky session for DID: ${did}`,
    );

    // Since we've verified admin permissions, we can proceed
    return await this.blueskyService.resetSession(did, req.tenantId);
  }
}
