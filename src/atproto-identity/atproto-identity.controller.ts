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
