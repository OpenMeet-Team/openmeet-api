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
import { ZulipMessage, ZulipTopic } from 'zulip-js';

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
  async showAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryGroupDto,
  ): Promise<GroupEntity[]> {
    return this.groupService.showAll(pagination, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get groups where user can create events' })
  async showGroupsWhereUserCanCreateEvents(
    @AuthUser() user: User,
  ): Promise<GroupEntity[]> {
    return await this.groupService.getGroupsWhereUserCanCreateEvents(user.id);
  }

  @Get('me/:slug')
  @ApiOperation({ summary: 'Get group by ID Authenticated' })
  async editGroup(
    @Param('slug') slug: string,
    // @Headers('x-group-slug') groupSlug: string,
  ): Promise<GroupEntity> {
    return await this.groupService.editGroup(slug);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Get group by group slug and authenticated user, public endpoint',
  })
  async showGroup(
    @Param('slug') slug: string,
    @Optional() @AuthUser() user?: User,
  ): Promise<GroupEntity> {
    return await this.groupService.showGroup(slug, user?.id);
  }

  @Patch(':slug')
  @ApiOperation({ summary: 'Update a group by slug' })
  async updateGroup(
    @Param('slug') slug: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupEntity> {
    return this.groupService.update(slug, updateGroupDto);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Delete a group by slug' })
  async removeGroup(@Param('slug') slug: string): Promise<any> {
    return this.groupService.remove(slug);
  }

  @Public()
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

  @Public()
  @Get(':slug/events')
  @ApiOperation({ summary: 'Get all group events' })
  async showGroupEvents(@Param('slug') slug: string): Promise<EventEntity[]> {
    return await this.groupService.showGroupEvents(slug);
  }

  @Public()
  @Get(':slug/members')
  @ApiOperation({ summary: 'Get all group members' })
  async showGroupMembers(
    @Param('slug') slug: string,
  ): Promise<GroupMemberEntity[]> {
    return this.groupService.showGroupMembers(slug);
  }

  @Public()
  @Get(':slug/discussions')
  @ApiOperation({ summary: 'Get all group discussions' })
  async showGroupDiscussions(
    @Param('slug') slug: string,
  ): Promise<{ messages: ZulipMessage[]; topics: ZulipTopic[] }> {
    return this.groupService.showGroupDiscussions(slug);
  }

  @Post(':slug/discussions')
  @ApiOperation({ summary: 'Send a message to a group discussion' })
  async sendGroupDiscussionMessage(
    @Param('slug') slug: string,
    @AuthUser() user: User,
    @Body() body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    return this.groupService.sendGroupDiscussionMessage(slug, user.id, body);
  }

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

  @Delete(':slug/discussions/:messageId')
  @ApiOperation({ summary: 'Delete a group discussion message' })
  async deleteGroupDiscussionMessage(
    @Param('slug') slug: string,
    @Param('messageId') messageId: number,
  ): Promise<{ id: number }> {
    return this.groupService.deleteGroupDiscussionMessage(messageId);
  }

  @Post(':slug/join')
  @ApiOperation({ summary: 'Joining a group through link' })
  async joinGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.joinGroup(slug, user.id);
  }

  @Delete(':slug/leave')
  @ApiOperation({ summary: 'Leave a group' })
  async leaveGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.leaveGroup(slug, user.id);
  }

  @Delete(':slug/members/:groupMemberId')
  @ApiOperation({ summary: 'Remove a group member' })
  async removeGroupMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ) {
    return this.groupService.removeGroupMember(slug, groupMemberId);
  }

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

  @Post(':slug/members/:groupMemberId/approve')
  @ApiOperation({ summary: 'Approve a group member' })
  async approveMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupService.approveMember(slug, groupMemberId);
  }

  @Delete(':slug/members/:groupMemberId/reject')
  @ApiOperation({ summary: 'Reject a group member' })
  async rejectMember(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
  ): Promise<GroupMemberEntity> {
    return this.groupService.rejectMember(slug, groupMemberId);
  }

  @Public()
  @Get(':slug/recommended-events')
  @ApiOperation({ summary: 'Get similar events for the group' })
  async showGroupRecommendedEvents(
    @Param('slug') slug: string,
  ): Promise<EventEntity[]> {
    return await this.groupService.showGroupRecommendedEvents(slug);
  }
}
