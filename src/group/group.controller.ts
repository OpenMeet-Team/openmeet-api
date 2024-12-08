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
import { JWTAuthGuard } from '../auth/auth.guard';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';
import { QueryGroupDto } from './dto/group-query.dto';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupMemberEntity } from '../group-member/infrastructure/persistence/relational/entities/group-member.entity';
import { UpdateGroupMemberRoleDto } from '../group-member/dto/create-groupMember.dto';
import { ZulipMessage, ZulipTopic } from 'zulip-js';
import { Permissions } from '../shared/guard/permissions.decorator';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { GroupPermission, UserPermission } from '../core/constants/constant';

@ApiTags('Groups')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateGroups],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  async create(
    @Body() createGroupDto: CreateGroupDto,
    @AuthUser() user: User,
  ): Promise<GroupEntity> {
    return this.groupService.create(createGroupDto, user.id);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.ViewGroups],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get all groups, public endpoint with search and pagination',
  })
  async showAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryGroupDto,
  ): Promise<GroupEntity[]> {
    return this.groupService.showAll(pagination, query);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.CreateEvents, UserPermission.ViewGroups],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get groups where user can create events' })
  async showGroupsWhereUserCanCreateEvents(
    @AuthUser() user: User,
  ): Promise<GroupEntity[]> {
    return await this.groupService.getGroupsWhereUserCanCreateEvents(user.id);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get all groups for the dashboard' })
  async showDashboardGroups(@AuthUser() user: User): Promise<GroupEntity[]> {
    return await this.groupService.showDashboardGroups(user.id);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageGroup],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/edit')
  @ApiOperation({ summary: 'Edit a group by slug' })
  async editGroup(@Param('slug') slug: string): Promise<GroupEntity> {
    return await this.groupService.editGroup(slug);
  }

  @Permissions(
    {
      context: 'user',
      permissions: [UserPermission.ViewGroups],
    },
    {
      context: 'group',
      permissions: [GroupPermission.SeeMembers, GroupPermission.SeeGroup],
    },
  )
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug')
  @ApiOperation({
    summary: 'Get group by group slug and authenticated user',
  })
  async showGroup(
    @Param('slug') slug: string,
    @Optional() @AuthUser() user?: User,
  ): Promise<GroupEntity> {
    return await this.groupService.showGroup(slug, user?.id);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageGroup],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug')
  @ApiOperation({ summary: 'Update a group by slug' })
  async updateGroup(
    @Param('slug') slug: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    return this.groupService.update(slug, updateGroupDto);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.DeleteGroup],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug')
  @ApiOperation({ summary: 'Delete a group by slug' })
  async removeGroup(@Param('slug') slug: string): Promise<any> {
    return this.groupService.remove(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.SeeGroup],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/about')
  @ApiOperation({ summary: 'Get group about' })
  async showGroupAbout(@Param('slug') slug: string): Promise<{
    events: EventEntity[];
    groupMembers: GroupMemberEntity[];
    messages: ZulipMessage[];
    topics: ZulipTopic[];
  }> {
    return await this.groupService.showGroupAbout(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.SeeGroup],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/events')
  @ApiOperation({ summary: 'Get all group events' })
  async showGroupEvents(@Param('slug') slug: string): Promise<EventEntity[]> {
    return await this.groupService.showGroupEvents(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.SeeMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/members')
  @ApiOperation({ summary: 'Get all group members' })
  async showGroupMembers(
    @Param('slug') slug: string,
  ): Promise<GroupMemberEntity[]> {
    return this.groupService.showGroupMembers(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.SeeDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Get(':slug/discussions')
  @ApiOperation({ summary: 'Get all group discussions' })
  async showGroupDiscussions(
    @Param('slug') slug: string,
  ): Promise<{ messages: ZulipMessage[]; topics: ZulipTopic[] }> {
    return this.groupService.showGroupDiscussions(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/discussions')
  @ApiOperation({ summary: 'Send a message to a group discussion' })
  async sendGroupDiscussionMessage(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Body() body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    return this.groupService.sendGroupDiscussionMessage(slug, user.id, body);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/discussions/:messageId')
  @ApiOperation({ summary: 'Update a group discussion message' })
  async updateGroupDiscussionMessage(
    @Param('slug') slug: string,
    @Param('messageId') messageId: number,
    @AuthUser() user: User,
    @Body() body: { message: string },
  ): Promise<{ id: number }> {
    return this.groupService.updateGroupDiscussionMessage(
      messageId,
      body.message,
      user.id,
    );
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageDiscussions],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/discussions/:messageId')
  @ApiOperation({ summary: 'Delete a group discussion message' })
  async deleteGroupDiscussionMessage(
    @Param('slug') slug: string,
    @Param('messageId') messageId: number,
  ): Promise<{ id: number }> {
    return this.groupService.deleteGroupDiscussionMessage(messageId);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.JoinGroups],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/join')
  @ApiOperation({ summary: 'Joining a group through link' })
  async joinGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.joinGroup(slug, user.id);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.AttendEvents],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/leave')
  @ApiOperation({ summary: 'Leave a group' })
  async leaveGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.leaveGroup(slug, user.id);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageGroup, GroupPermission.ManageMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/members/:groupMemberId')
  @ApiOperation({ summary: 'Remove a group member' })
  async removeGroupMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ) {
    return this.groupService.removeGroupMember(slug, groupMemberId);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageGroup, GroupPermission.ManageMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/members/:groupMemberId')
  @ApiOperation({ summary: 'Update a group member role' })
  async updateGroupMemberRole(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
    @Body() updateDto: UpdateGroupMemberRoleDto,
  ): Promise<GroupMemberEntity> {
    return this.groupService.updateGroupMemberRole(
      slug,
      groupMemberId,
      updateDto,
    );
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/members/:groupMemberId/approve')
  @ApiOperation({ summary: 'Approve a group member' })
  async approveMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupService.approveMember(slug, groupMemberId);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Delete(':slug/members/:groupMemberId/reject')
  @ApiOperation({ summary: 'Reject a group member' })
  async rejectMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupService.rejectMember(slug, groupMemberId);
  }

  @Permissions({
    context: 'user',
    permissions: [UserPermission.ViewEvents],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Public()
  @Get(':slug/recommended-events')
  @ApiOperation({ summary: 'Get similar events for the group' })
  async showGroupRecommendedEvents(
    @Param('slug') slug?: string,
  ): Promise<EventEntity[]> {
    return await this.groupService.showGroupRecommendedEvents(slug);
  }
}
