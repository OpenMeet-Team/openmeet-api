import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
  UseGuards,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
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
import { PdsSessionService } from '../pds/pds-session.service';
import { PdsApiError } from '../pds/pds.errors';
import { NullableType } from '../utils/types/nullable.type';
import { AllConfigType } from '../config/config.type';
import { UserAtprotoIdentityEntity } from '../user-atproto-identity/infrastructure/persistence/relational/entities/user-atproto-identity.entity';
import { AuthBlueskyService } from '../auth-bluesky/auth-bluesky.service';

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
    private readonly pdsSessionService: PdsSessionService,
    private readonly userService: UserService,
    private readonly blueskyService: BlueskyService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly authBlueskyService: AuthBlueskyService,
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
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 3 : 100,
      ttl: 3600000,
    },
  })
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
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 3 : 100,
      ttl: 3600000,
    },
  })
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
   * User must have a custodial identity to use this endpoint. On success the
   * identity stops being custodial: stored credentials are cleared and the
   * cached PDS session is invalidated in the same request.
   * Rate limited to prevent abuse - password reset is a sensitive operation.
   */
  @ApiBearerAuth()
  @Post('reset-pds-password')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({
    default: {
      limit: process.env.NODE_ENV === 'production' ? 3 : 100,
      ttl: 3600000,
    },
  })
  @ApiOperation({
    summary: 'Reset PDS password using token from email',
  })
  @ApiOkResponse({
    description:
      'Password reset successful; the identity is no longer custodial',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'User has no custodial identity or invalid token',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description:
      'The PDS did not confirm the reset (timeout or server error); safe to retry',
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
        'You already own this AT Protocol account, so OpenMeet can no longer ' +
          'change its password. Reset it directly with your PDS provider.',
      );
    }

    // Record the pending handoff BEFORE the PDS write. A later PDS login 401
    // is only trustworthy proof of a completed reset for identities whose
    // marker shows the PDS actually saw a reset ('ambiguous' or 'confirmed')
    // — the PDS returns the same 401 for unknown accounts, so without
    // provenance a systemic failure (wrong PDS URL, incomplete restore)
    // would read as mass ownership handoffs.
    //
    // The marker only ever advances toward stronger evidence here (pending
    // -> ambiguous -> confirmed); rejections never withdraw it, because a
    // rejected retry may have been refused precisely because an earlier
    // attempt consumed the token when it committed. Only proof removes the
    // marker: the custody flip, or a later successful login with the stored
    // credentials (which shows no reset committed — PdsSessionService
    // clears 'pending'/'ambiguous' then).
    const priorStatus = identity.takeOwnershipStatus;
    if (priorStatus === 'ambiguous' || priorStatus === 'confirmed') {
      this.logger.warn(
        `Password reset requested for user ${user.ulid} while a prior reset attempt is still '${priorStatus}'; keeping that marker`,
        { tenantId },
      );
    } else {
      await this.userAtprotoIdentityService.update(tenantId, identity.id, {
        takeOwnershipStatus: 'pending',
      });
    }

    // Call PDS to reset password
    try {
      await this.pdsAccountService.resetPassword(dto.token, dto.password);
    } catch (error) {
      if (this.isDefinitivePdsRejection(error)) {
        // The PDS evaluated this request and refused it, so THIS attempt
        // did not change the password. A marker this request wrote stays
        // 'pending', which the session-401 repair ignores and a later
        // successful login sweeps away.
        throw new BadRequestException(error.message);
      }

      // No definitive answer from the PDS (timeout, connection loss, 5xx):
      // the reset may have committed with the response lost. Upgrade the
      // marker so the session-401 repair may finish the handoff if it did.
      if (priorStatus !== 'confirmed') {
        try {
          await this.userAtprotoIdentityService.update(tenantId, identity.id, {
            takeOwnershipStatus: 'ambiguous',
          });
        } catch (markError) {
          this.logger.error(
            `Failed to mark ambiguous password reset for user ${user.ulid}; marker stays 'pending' and needs manual triage if the reset committed`,
            { tenantId, error: markError.message },
          );
        }
      }
      this.logger.error(
        `PDS gave no definitive answer to a password reset for user ${user.ulid}`,
        { tenantId, error: error.message },
      );
      throw new BadGatewayException(
        'The PDS did not confirm the password reset. Please try again.',
      );
    }

    // The PDS acknowledged the reset — record that durably FIRST. If ending
    // custody below fails, the 'confirmed' marker is what lets the client's
    // take-ownership/complete retry or the session-401 repair finish the
    // handoff later.
    try {
      await this.userAtprotoIdentityService.update(tenantId, identity.id, {
        takeOwnershipStatus: 'confirmed',
      });
    } catch (markError) {
      this.logger.error(
        `Failed to record confirmed password reset for user ${user.ulid}`,
        { tenantId, error: markError.message },
      );
    }

    // The user now owns the password they just set, so custody ends here, in
    // the same request as the PDS write. Waiting for the client to call
    // take-ownership/complete leaves stale stored credentials whenever that
    // follow-up never arrives, and stale credentials silently break event
    // publishing for the account.
    try {
      await this.recoveryService.completeTakeOwnership(tenantId, user.ulid);
    } catch (error) {
      // The PDS reset already succeeded and the token is consumed, so this
      // must not surface as a failed reset — an error here would also stop
      // the client from making its take-ownership/complete call, which is
      // the retry for this exact write. If that retry never comes either,
      // the stale credentials produce a definitive 401 on the next session
      // attempt and PdsSessionService finishes the handoff from there.
      this.logger.error(
        `PDS password reset succeeded but ending custody failed for user ${user.ulid}; awaiting client retry or session-401 repair`,
        { tenantId, error: error.message },
      );
    }

    return { success: true };
  }

  /**
   * True when the PDS itself evaluated the request and refused it (any 4xx
   * response, e.g. an invalid or expired token) — proof that this attempt
   * changed nothing. Network failures, timeouts, and 5xx responses are NOT
   * definitive: the reset may have committed with the response lost.
   */
  private isDefinitivePdsRejection(error: unknown): error is PdsApiError {
    return (
      error instanceof PdsApiError &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    );
  }

  /**
   * Disconnect (logout) the user's AT Protocol session.
   *
   * Kills the active PDS session so hasActiveSession returns false.
   * The identity record (DID, handle) stays intact.
   */
  @ApiBearerAuth()
  @Delete('session')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect AT Protocol session' })
  @ApiOkResponse({ description: 'Session disconnected successfully' })
  async disconnectSession(
    @Request() request: any,
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = request.tenantId;
    const userId = request.user.id;

    const user = await this.userService.findById(userId, tenantId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.pdsSessionService.disconnectSession(tenantId, user.ulid);
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
    const serviceHandleDomains =
      this.configService.get('pds.serviceHandleDomains', { infer: true }) || '';
    const validHandleDomains = serviceHandleDomains
      .split(',')
      .map((d: string) => d.trim())
      .filter((d: string) => d.length > 0);

    let hasActiveSession = false;
    if (identity.isCustodial && identity.pdsCredentials) {
      // Custodial with credentials can always create a session
      hasActiveSession = true;
      this.logger.debug('hasActiveSession: custodial with credentials', {
        did: identity.did,
      });
    } else if (!identity.isCustodial) {
      // Non-custodial: check if OAuth session exists in Redis
      this.logger.debug('Checking OAuth session for non-custodial identity', {
        did: identity.did,
        tenantId,
      });
      try {
        const session = await this.blueskyService.tryResumeSession(
          tenantId,
          identity.did,
        );
        hasActiveSession = !!session;
        this.logger.debug('hasActiveSession check result', {
          did: identity.did,
          hasActiveSession,
        });
      } catch (error) {
        this.logger.warn('Failed to check OAuth session for hasActiveSession', {
          did: identity.did,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        });
        hasActiveSession = false;
      }
    } else {
      this.logger.debug('hasActiveSession: custodial without credentials', {
        did: identity.did,
        isCustodial: identity.isCustodial,
        hasCredentials: !!identity.pdsCredentials,
      });
    }
    // Note: custodial WITHOUT credentials (post-ownership) = false

    // Check scope mismatch for non-custodial (OAuth) sessions
    let scopeMismatch = false;
    let missingScopes: string[] = [];
    if (hasActiveSession && !identity.isCustodial) {
      try {
        const mismatchData = await this.authBlueskyService.getScopeMismatch(
          identity.did,
        );
        if (mismatchData && mismatchData.length > 0) {
          scopeMismatch = true;
          missingScopes = mismatchData;
        }
      } catch (error) {
        this.logger.warn('Failed to check scope mismatch', {
          did: identity.did,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      did: identity.did,
      handle: identity.handle,
      pdsUrl: identity.pdsUrl,
      isCustodial: identity.isCustodial,
      isOurPds: identity.pdsUrl === ourPdsUrl,
      hasActiveSession,
      scopeMismatch,
      missingScopes,
      validHandleDomains,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    };
  }
}
