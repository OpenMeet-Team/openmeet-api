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
  NotFoundException,
  Patch,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
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
import { Public } from 'src/auth/decorators/public.decorator';
import { UpdateUserDto } from './dto/update-user.dto';

// @ApiBearerAuth()
// @Roles(RoleEnum.admin)
// @UseGuards(AuthGuard('jwt'), RolesGuard)
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
  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  getProfile(@Param('id') id: User['id']): Promise<NullableType<User>> {
    try {
      return this.userService.findProfile(id);
    } catch (err) {
      console.log(err);
      throw new NotFoundException('User not found');
    }
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
