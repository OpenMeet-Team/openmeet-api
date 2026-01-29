import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { AtprotoIdentityService } from './atproto-identity.service';
import {
  AtprotoIdentityRecoveryService,
  RecoveryStatus,
} from './atproto-identity-recovery.service';
import { UserService } from '../user/user.service';
import { BlueskyService } from '../bluesky/bluesky.service';
import { ConfigService } from '@nestjs/config';
import { AtprotoIdentityDto } from './dto/atproto-identity.dto';
import { ResetPdsPasswordDto } from './dto/reset-pds-password.dto';
import { UpdateHandleDto } from './dto/update-handle.dto';
import { PdsAccountService } from '../pds/pds-account.service';
import { PdsApiError } from '../pds/pds.errors';
import { NullableType } from '../utils/types/nullable.type';
import { AllConfigType } from '../config/config.type';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';

@ApiTags('AT Protocol Identity')
@Controller({
  path: 'atproto/identity',
})
export class AtprotoIdentityController {
  private readonly logger = new Logger(AtprotoIdentityController.name);

  constructor(
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly atprotoIdentityService: AtprotoIdentityService,
    private readonly recoveryService: AtprotoIdentityRecoveryService,
    private readonly pdsAccountService: PdsAccountService,
    private readonly userService: UserService,
    private readonly blueskyService: BlueskyService,
    private readonly configService: ConfigService<AllConfigType>,
  ) {}

  /**
   * Get the authenticated user's AT Protocol identity.
   *
   * Returns the user's DID, handle, PDS URL, and metadata.
   * Never exposes pdsCredentials for security.
   */
  @ApiBearerAuth()
  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: "Get user's AT Protocol identity" })
  @ApiOkResponse({
    type: AtprotoIdentityDto,
    description: "User's AT Protocol identity or null if none exists",
  })
  @HttpCode(HttpStatus.OK)
  async getIdentity(
    @Request() request: any,
  ): Promise<NullableType<AtprotoIdentityDto>> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    // Fetch full user from database to get ulid (not in JWT payload)
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = await this.userAtprotoIdentityService.findByUserUlid(
      tenantId,
      user.ulid,
    );

    if (!identity) {
      return null;
    }

    return this.mapToDto(identity, tenantId);
  }

  /**
   * Create an AT Protocol identity for the authenticated user.
   *
   * Creates a custodial PDS account on OpenMeet's PDS.
   * Returns error if user already has an identity.
   */
  @ApiBearerAuth()
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create AT Protocol identity' })
  @ApiCreatedResponse({
    type: AtprotoIdentityDto,
    description: 'AT Protocol identity created successfully',
  })
  @ApiConflictResponse({
    description: 'AT Protocol identity already exists for this user',
  })
  @HttpCode(HttpStatus.CREATED)
  async createIdentity(@Request() request: any): Promise<AtprotoIdentityDto> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    // Fetch full user from database to get ulid and email (not in JWT payload)
    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = await this.atprotoIdentityService.createIdentity(
      tenantId,
      {
        ulid: user.ulid,
        slug: user.slug,
        email: user.email,
      },
    );

    return this.mapToDto(identity, tenantId);
  }

  /**
   * Check if user can recover an existing PDS account.
   *
   * Returns recovery status with existing account info if available.
   */
  @ApiBearerAuth()
  @Get('recovery-status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Check if user can recover an existing PDS account',
  })
  @ApiOkResponse({
    description: 'Recovery status with existing account info if available',
  })
  @HttpCode(HttpStatus.OK)
  async getRecoveryStatus(@Request() request: any): Promise<RecoveryStatus> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.recoveryService.checkRecoveryStatus(tenantId, user.ulid);
  }

  /**
   * Recover existing PDS account as custodial (admin password reset).
   *
   * Sets a new random password and links the account.
   * Rate limited to prevent abuse - admin password reset is a sensitive operation.
   */
  @ApiBearerAuth()
  @Post('recover-as-custodial')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 3 : 100, ttl: 3600000 } })
  @ApiOperation({ summary: 'Recover existing PDS account as custodial' })
  @ApiCreatedResponse({
    type: AtprotoIdentityDto,
    description: 'AT Protocol identity recovered and linked',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded - max 3 recovery attempts per hour',
  })
  @HttpCode(HttpStatus.CREATED)
  async recoverAsCustodial(
    @Request() request: any,
  ): Promise<AtprotoIdentityDto> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = await this.recoveryService.recoverAsCustodial(
      tenantId,
      user.ulid,
    );

    return this.mapToDto(identity, tenantId);
  }

  /**
   * Initiate take ownership - sends PDS password reset email.
   *
   * User will receive email to set their own password.
   * Rate limited to prevent email bombing.
   */
  @ApiBearerAuth()
  @Post('take-ownership/initiate')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 3 : 100, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Initiate take ownership - sends PDS password reset email',
  })
  @ApiOkResponse({
    description: 'Password reset email sent to user',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded - max 3 requests per hour',
  })
  @HttpCode(HttpStatus.OK)
  async initiateTakeOwnership(
    @Request() request: any,
  ): Promise<{ email: string }> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.recoveryService.initiateTakeOwnership(tenantId, user.ulid);
  }

  /**
   * Complete take ownership - clears custodial credentials.
   *
   * User confirms they've set their password, we clear stored credentials.
   */
  @ApiBearerAuth()
  @Post('take-ownership/complete')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Complete take ownership - clears custodial credentials',
  })
  @ApiOkResponse({
    description: 'Ownership transfer completed',
  })
  @HttpCode(HttpStatus.OK)
  async completeTakeOwnership(
    @Request() request: any,
  ): Promise<{ success: boolean }> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.recoveryService.completeTakeOwnership(tenantId, user.ulid);
    return { success: true };
  }

  /**
   * Reset PDS password using a token received via email.
   *
   * User must have a custodial identity to use this endpoint.
   * Rate limited to prevent abuse - password reset is a sensitive operation.
   */
  @ApiBearerAuth()
  @Post('reset-pds-password')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: process.env.NODE_ENV === 'production' ? 3 : 100, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Reset PDS password using token from email',
  })
  @ApiOkResponse({
    description: 'Password reset successful',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'User has no custodial identity or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limit exceeded - max 3 reset attempts per hour',
  })
  @HttpCode(HttpStatus.OK)
  async resetPdsPassword(
    @Request() request: any,
    @Body() dto: ResetPdsPasswordDto,
  ): Promise<{ success: boolean }> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify user has a custodial identity
    const identity = await this.userAtprotoIdentityService.findByUserUlid(
      tenantId,
      user.ulid,
    );
    if (!identity) {
      throw new BadRequestException('User has no AT Protocol identity');
    }
    if (!identity.isCustodial) {
      throw new BadRequestException(
        'User already owns their AT Protocol identity',
      );
    }

    // Call PDS to reset password
    try {
      await this.pdsAccountService.resetPassword(dto.token, dto.password);
    } catch (error) {
      if (error instanceof PdsApiError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return { success: true };
  }

  /**
   * Update the AT Protocol handle for the authenticated user.
   *
   * Only supported for identities hosted on OpenMeet's PDS.
   * The new handle must be within the allowed domain (e.g., .opnmt.me).
   */
  @ApiBearerAuth()
  @Post('update-handle')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update AT Protocol handle (OpenMeet PDS only)' })
  @ApiOkResponse({
    type: AtprotoIdentityDto,
    description: 'Handle updated successfully',
  })
  @HttpCode(HttpStatus.OK)
  async updateHandle(
    @Body() dto: UpdateHandleDto,
    @Request() request: any,
  ): Promise<AtprotoIdentityDto> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identity = await this.atprotoIdentityService.updateHandle(
      tenantId,
      user.ulid,
      dto.handle,
    );

    return this.mapToDto(identity, tenantId);
  }

  /**
   * Map entity to DTO, explicitly excluding pdsCredentials.
   * Determines hasActiveSession based on identity type and session state.
   */
  private async mapToDto(
    identity: UserAtprotoIdentityEntity,
    tenantId: string,
  ): Promise<AtprotoIdentityDto> {
    const ourPdsUrl = this.configService.get('pds.url', { infer: true });

    let hasActiveSession = false;
    if (identity.isCustodial && identity.pdsCredentials) {
      // Custodial with credentials can always create a session
      hasActiveSession = true;
    } else if (!identity.isCustodial) {
      // Non-custodial: check if OAuth session exists in Redis
      try {
        const session = await this.blueskyService.tryResumeSession(
          tenantId,
          identity.did,
        );
        hasActiveSession = !!session;
      } catch (error) {
        this.logger.warn('Failed to check OAuth session for hasActiveSession', {
          did: identity.did,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        hasActiveSession = false;
      }
    }
    // Note: custodial WITHOUT credentials (post-ownership) = false

    return {
      did: identity.did,
      handle: identity.handle,
      pdsUrl: identity.pdsUrl,
      isCustodial: identity.isCustodial,
      isOurPds: identity.pdsUrl === ourPdsUrl,
      hasActiveSession,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    };
  }
}
