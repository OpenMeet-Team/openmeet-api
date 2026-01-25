import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { AtprotoIdentityService } from './atproto-identity.service';
import {
  AtprotoIdentityRecoveryService,
  RecoveryStatus,
} from './atproto-identity-recovery.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { AtprotoIdentityDto } from './dto/atproto-identity.dto';
import { NullableType } from '../utils/types/nullable.type';
import { AllConfigType } from '../config/config.type';

@ApiTags('AT Protocol Identity')
@Controller({
  path: 'atproto/identity',
})
export class AtprotoIdentityController {
  constructor(
    private readonly userAtprotoIdentityService: UserAtprotoIdentityService,
    private readonly atprotoIdentityService: AtprotoIdentityService,
    private readonly recoveryService: AtprotoIdentityRecoveryService,
    private readonly userService: UserService,
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

    return this.mapToDto(identity);
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

    return this.mapToDto(identity);
  }

  /**
   * Check if user can recover an existing PDS account.
   *
   * Returns recovery status with existing account info if available.
   */
  @ApiBearerAuth()
  @Get('recovery-status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Check if user can recover an existing PDS account' })
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
   */
  @ApiBearerAuth()
  @Post('recover-as-custodial')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Recover existing PDS account as custodial' })
  @ApiCreatedResponse({
    type: AtprotoIdentityDto,
    description: 'AT Protocol identity recovered and linked',
  })
  @HttpCode(HttpStatus.CREATED)
  async recoverAsCustodial(@Request() request: any): Promise<AtprotoIdentityDto> {
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

    return this.mapToDto(identity);
  }

  /**
   * Initiate take ownership - sends PDS password reset email.
   *
   * User will receive email to set their own password.
   */
  @ApiBearerAuth()
  @Post('take-ownership/initiate')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Initiate take ownership - sends PDS password reset email',
  })
  @ApiOkResponse({
    description: 'Password reset email sent to user',
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
  @ApiOperation({ summary: 'Complete take ownership - clears custodial credentials' })
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
   * Map entity to DTO, explicitly excluding pdsCredentials.
   */
  private mapToDto(identity: {
    did: string;
    handle: string | null;
    pdsUrl: string;
    isCustodial: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AtprotoIdentityDto {
    const ourPdsUrl = this.configService.get('pds.url', { infer: true });

    return {
      did: identity.did,
      handle: identity.handle,
      pdsUrl: identity.pdsUrl,
      isCustodial: identity.isCustodial,
      isOurPds: identity.pdsUrl === ourPdsUrl,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    };
  }
}
