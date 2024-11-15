import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  Optional,
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
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { GroupMemberService } from '../group-member/group-member.service';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { EventService } from '../event/event.service';

@ApiTags('Groups')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly groupMemberService: GroupMemberService,
    private readonly eventService: EventService,
  ) {}

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
  @ApiOperation({ summary: 'Get groups where user can create events' })
  async showGroupsWhereUserCanCreateEvents(
    @AuthUser() user: User,
  ): Promise<GroupEntity[]> {
    return await this.groupService.getGroupsWhereUserCanCreateEvents(user.id);
  }

  @Get('me/:id')
  @ApiOperation({ summary: 'Get group by ID Authenticated' })
  async editGroup(@Param('id') id: number): Promise<GroupEntity> {
    return await this.groupService.editGroup(id);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get group by ID and authenticated user, public endpoint',
  })
  async showGroup(
    @Param('id') id: number,
    @Optional() @AuthUser() user?: User,
  ): Promise<GroupEntity> {
    return await this.groupService.showGroup(+id, user?.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a group by ID' })
  async updateGroup(
    @Param('id') id: number,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    return this.groupService.update(+id, updateGroupDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a group by ID' })
  async removeGroup(@Param('id') id: number): Promise<any> {
    return this.groupService.remove(+id);
  }

  @Public()
  @Get(':id/events')
  @ApiOperation({ summary: 'Get all group events' })
  async showGroupEvents(@Param('id') id: number): Promise<EventEntity[]> {
    return await this.groupService.showGroupEvents(id);
  }

  @Public()
  @Get(':id/members')
  @ApiOperation({ summary: 'Get all group members' })
  async showGroupMembers(
    @Param('id') id: number,
  ): Promise<GroupMemberEntity[]> {
    return this.groupService.showGroupMembers(+id);
  }

  // @Public()
  // @Get(':id/discussions')
  // @ApiOperation({ summary: 'Get all group discussions' })
  // async showGroupDiscussions(
  //   @Param('id') id: number,
  // ): Promise<DiscussionEntity[]> {
  //   return this.groupService.showGroupDiscussions(+id);
  // }

  @Post(':slug/join')
  @ApiOperation({ summary: 'Joining a group through link' })
  async joinGroupThroughLink(
    @AuthUser() user: User,
    @Param('slug') slug: string,
  ) {
    return this.groupService.joinGroupThroughLink(user.id, slug);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Joining a group' })
  async joinGroup(
    @AuthUser() user: User,
    @Param('id') id: number,
  ): Promise<GroupMemberEntity | null> {
    return this.groupService.joinGroup(user.id, +id);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: 'Leave a group' })
  async leaveGroup(@AuthUser() user: User, @Param('id') id: number) {
    return this.groupMemberService.leaveGroup(user.id, +id);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a group member' })
  async removeGroupMember(
    @Param('id') id: number,
    @Param('userId') userId: number,
  ) {
    return this.groupMemberService.removeGroupMember(id, userId);
  }

  @Patch(':id/members/:userId')
  @ApiOperation({ summary: 'Update a group member role' })
  async updateGroupMemberRole(
    @Param('id') id: number,
    @Param('userId') userId: number,
    @Body() updateDto: UpdateGroupMemberRoleDto,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.updateGroupMemberRole(id, userId, updateDto);
  }

  @Post(':id/members/:userId/approve')
  @ApiOperation({ summary: 'Approve a group member' })
  async approveMember(
    @Param('id') id: number,
    @Param('userId') userId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.approveMember(id, userId);
  }

  @Delete(':id/members/:userId/reject')
  @ApiOperation({ summary: 'Reject a group member' })
  async rejectMember(
    @Param('id') id: number,
    @Param('userId') userId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.rejectMember(id, userId);
  }

  @Public()
  @Get(':id/recommended-events')
  @ApiOperation({ summary: 'Get similar events for the group' })
  async getRecommendedEvents(@Param('id') id: number): Promise<EventEntity[]> {
    return await this.groupService.getRecommendedEvents(id);
  }
}
