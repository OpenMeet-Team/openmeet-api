import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
  SerializeOptions,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateUserDto } from './dto/create-user.dto';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';

import {
  InfinityPaginationResponse,
  InfinityPaginationResponseDto,
} from '../utils/dto/infinity-pagination-response.dto';
import { NullableType } from '../utils/types/nullable.type';
import { QueryUserDto } from './dto/query-user.dto';
import { User } from './domain/user';
import { UserService } from './user.service';
import { infinityPagination } from '../utils/infinity-pagination';
import { Public } from '../auth/decorators/public.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleEnum } from '../role/role.enum';
import { JWTAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../role/role.guard';
import { ProfileSummaryDto } from './dto/profile-summary.dto';

@ApiBearerAuth()
@Roles(RoleEnum.Admin)
@UseGuards(JWTAuthGuard, RolesGuard)
@ApiTags('Users')
@Controller({
  path: 'users',
  version: '1',
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiCreatedResponse({
    type: User,
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createProfileDto: CreateUserDto): Promise<User> {
    return this.userService.create(createProfileDto);
  }

  @ApiOkResponse({
    type: InfinityPaginationResponse(User),
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll(
    @Query() query: QueryUserDto,
  ): Promise<InfinityPaginationResponseDto<User>> {
    const page = query?.page ?? 1;
    let limit = query?.limit ?? 10;
    if (limit > 50) {
      limit = 50;
    }

    return infinityPagination(
      await this.userService.findManyWithPagination({
        filterOptions: query?.filters,
        sortOptions: query?.sort,
        paginationOptions: {
          page,
          limit,
        },
      }),
      { page, limit },
    );
  }

  @ApiOkResponse({
    type: User,
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  findOne(@Param('id') id: User['id']): Promise<NullableType<User>> {
    return this.userService.findById(id);
  }

  @ApiOkResponse({
    type: User,
  })
  @SerializeOptions({
    groups: ['admin'],
  })
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  update(
    @Param('id') id: User['id'],
    @Body() updateProfileDto: UpdateUserDto,
  ): Promise<User | null> {
    return this.userService.update(id, updateProfileDto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute
  @Get(':identifier/profile/summary')
  @ApiOperation({
    summary: 'Get user profile summary with counts and limited previews',
    description:
      'Returns profile summary optimized for fast loading - includes counts and limited previews of events/groups. Supports slug, DID, or ATProto handle.',
  })
  @ApiParam({
    name: 'identifier',
    description:
      'User identifier - can be slug, ATProto DID, or ATProto handle',
    examples: {
      slug: { value: 'alice-abc123', summary: 'User slug (most common)' },
      did: { value: 'did:plc:abc123', summary: 'ATProto DID' },
      handle: { value: 'alice.bsky.social', summary: 'ATProto handle' },
    },
  })
  @ApiOkResponse({
    type: ProfileSummaryDto,
    description: 'Profile summary with counts and limited previews',
  })
  async getProfileSummary(
    @Param('identifier') identifier: string,
  ): Promise<NullableType<ProfileSummaryDto>> {
    return this.userService.getProfileSummary(identifier);
  }

  /**
   * @deprecated Use GET /:slug/profile/summary instead for better performance.
   * This endpoint returns ALL events/groups and will be slow for users with many items.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 requests per minute for public profile lookups
  @Get(':identifier/profile')
  @ApiOperation({
    summary: 'Get user profile by identifier (DEPRECATED - use /:slug/profile/summary)',
    description:
      'Retrieve user profile using multiple identifier types: slug (alice-abc123), ATProto DID (did:plc:abc123), or ATProto handle (alice.bsky.social or @alice.bsky.social)',
    deprecated: true,
  })
  @ApiParam({
    name: 'identifier',
    description:
      'User identifier - can be slug, ATProto DID, or ATProto handle',
    examples: {
      slug: { value: 'alice-abc123', summary: 'User slug (most common)' },
      did: { value: 'did:plc:abc123', summary: 'ATProto DID' },
      handle: { value: 'alice.bsky.social', summary: 'ATProto handle' },
      handleWithAt: {
        value: '@alice.bsky.social',
        summary: 'ATProto handle with @ prefix',
      },
    },
  })
  @SerializeOptions({
    groups: ['me', 'admin', 'user', '*'],
  })
  showProfile(
    @Param('identifier') identifier: string,
  ): Promise<NullableType<User>> {
    return this.userService.findByIdentifier(identifier);
  }

  @Delete(':id')
  @ApiParam({
    name: 'id',
    type: String,
    required: true,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: User['id']): Promise<void> {
    return this.userService.remove(id);
  }
}
