import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { GroupService } from './group.service';
import { Public } from '../auth/decorators/public.decorator';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { QueryGroupDto } from './dto/group-query.dto';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { HttpException, HttpStatus } from '@nestjs/common';

@ApiTags('Groups')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  async create(
    @Body() createGroupDto: CreateGroupDto,
    @AuthUser() user: User,
  ): Promise<GroupEntity> {
    return this.groupService.create(createGroupDto, user.id);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get all groups, public endpoint with search and pagination',
  })
  async findAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryGroupDto,
  ): Promise<GroupEntity[]> {
    return this.groupService.findAll(pagination, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my groups' })
  async findMyGroups(
    @Query() pagination: PaginationDto,
    @Query() query: QueryGroupDto,
    @AuthUser() user: User,
  ): Promise<GroupEntity[]> {
    const userId = user.id;
    query.userId = userId;
    return this.groupService.findAll(pagination, query);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get group by ID Authenticated' })
  async findOne(
    @Param('id') id: number,
    @AuthUser() user: User,
  ): Promise<GroupEntity> {
    const userId = user.id;
    const group = await this.groupService.findQuery(+id, userId);
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return group;
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get group by ID and authenticated user, public endpoint',
  })
  async findGroupDetails(
    @Param('id') id: number,
    @AuthUser() user: User,
  ): Promise<GroupEntity> {
    const group = await this.groupService.findGroupDetails(+id, user?.id);
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return group;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a group by ID' })
  async update(
    @Param('id') id: number,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    return this.groupService.update(+id, updateGroupDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a group by ID' })
  async remove(@Param('id') id: number): Promise<void> {
    return this.groupService.remove(+id);
  }

  @Public()
  @Get(':id/events')
  @ApiOperation({ summary: 'Get all group events' })
  async findGroupDetailsEvents(@Param('id') id: number): Promise<GroupEntity> {
    const group = await this.groupService.findGroupDetailsEvents(+id);
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return group;
  }

  @Public()
  @Get(':id/members')
  @ApiOperation({ summary: 'Get all group members' })
  async findGroupDetailsMembers(@Param('id') id: number): Promise<GroupEntity> {
    const group = await this.groupService.findGroupDetailsMembers(+id);
    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }
    return group;
  }

  @Public()
  @Get(':id/recommended-events')
  @ApiOperation({ summary: 'Get some recommended events for a specific group' })
  async getRecommendedEvents(
    @Param('id') id: number,
    @Query('minEvents') minEvents: number = 0,
    @Query('maxEvents') maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    minEvents = minEvents || 0;
    maxEvents = maxEvents || 5;
    try {
      const recommendedEvents = await this.groupService.getRecommendedEvents(
        +id,
        minEvents,
        maxEvents,
      );

      return recommendedEvents;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }
}
