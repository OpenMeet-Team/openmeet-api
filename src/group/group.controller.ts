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
import { VisibilityGuard } from '../shared/guard/visibility.guard';
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
import { MatrixMessage } from '../matrix/matrix-types';
import { Permissions } from '../shared/guard/permissions.decorator';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { GroupPermission, UserPermission } from '../core/constants/constant';
import { GroupMailService } from '../group-mail/group-mail.service';
import {
  SendAdminMessageDto,
  PreviewAdminMessageDto,
} from './dto/admin-message.dto';
import { ContactAdminsDto } from './dto/contact-admins.dto';

@ApiTags('Groups')
@Controller('groups')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupController {
  constructor(
    private readonly groupService: GroupService,
    private readonly groupMailService: GroupMailService,
  ) {}

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

  @Public()
  @UseGuards(VisibilityGuard)
  @Get()
  @ApiOperation({
    summary:
      'Get all groups, public endpoint with optional auth for more visibility',
  })
  async showAll(
    @Query() pagination: PaginationDto,
    @Query() query: QueryGroupDto,
    @Optional() @AuthUser() user?: User,
  ): Promise<GroupEntity[]> {
    return this.groupService.showAll(pagination, query, user?.id);
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

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
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

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug/about')
  @ApiOperation({ summary: 'Get group about' })
  async showGroupAbout(@Param('slug') slug: string): Promise<{
    events: EventEntity[];
    groupMembers: GroupMemberEntity[];
  }> {
    return await this.groupService.showGroupAbout(slug);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug/events')
  @ApiOperation({ summary: 'Get all group events' })
  async showGroupEvents(@Param('slug') slug: string): Promise<EventEntity[]> {
    return await this.groupService.showGroupEvents(slug);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug/members')
  @ApiOperation({ summary: 'Get all group members' })
  async showGroupMembers(
    @Param('slug') slug: string,
  ): Promise<GroupMemberEntity[]> {
    return this.groupService.showGroupMembers(slug);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Get(':slug/discussions')
  @ApiOperation({ summary: 'Get all group discussions' })
  showGroupDiscussions(
    @Param('slug') slug: string,
  ): Promise<{ messages: MatrixMessage[] }> {
    return this.groupService.showGroupDiscussions(slug);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Post(':slug/join')
  @ApiOperation({ summary: 'Joining a group through link' })
  async joinGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.joinGroup(slug, user.id);
  }

  @Public()
  @UseGuards(JWTAuthGuard, VisibilityGuard)
  @Delete(':slug/leave')
  @ApiOperation({ summary: 'Leave a group' })
  async leaveGroup(@AuthUser() user: User, @Param('slug') slug: string) {
    return this.groupService.leaveGroup(slug, user.id);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ManageMembers],
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
    permissions: [GroupPermission.ManageMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Patch(':slug/members/:groupMemberId')
  @ApiOperation({ summary: 'Update a group member role' })
  async updateGroupMemberRole(
    @Param('slug') slug: string,
    @Param('groupMemberId') groupMemberId: number,
    @Body() updateDto: UpdateGroupMemberRoleDto,
    @AuthUser() user: User,
  ): Promise<GroupMemberEntity> {
    return this.groupService.updateGroupMemberRole(
      slug,
      groupMemberId,
      updateDto,
      user.id,
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

  @UseGuards(JWTAuthGuard)
  @Public()
  @Get(':slug/recommended-events')
  @ApiOperation({ summary: 'Get similar events for the group' })
  async showGroupRecommendedEvents(
    @Param('slug') slug?: string,
  ): Promise<EventEntity[]> {
    return await this.groupService.showGroupRecommendedEvents(slug);
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ContactMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/admin-message')
  @ApiOperation({
    summary: 'Send admin message to all group members',
    description:
      'Allows group admins to send a message to all group members via email',
  })
  async sendAdminMessage(
    @Param('slug') slug: string,
    @Body() sendAdminMessageDto: SendAdminMessageDto,
    @AuthUser() user: User,
  ) {
    const group = await this.groupService.getGroupBySlug(slug);
    return await this.groupMailService.sendAdminMessageToMembers(
      group,
      user.id,
      sendAdminMessageDto.subject,
      sendAdminMessageDto.message,
      sendAdminMessageDto.targetUserIds,
    );
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ContactMembers],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/admin-message/preview')
  @ApiOperation({
    summary: 'Preview admin message by sending to test email',
    description:
      'Allows group admins to preview the admin message by sending it to a test email address',
  })
  async previewAdminMessage(
    @Param('slug') slug: string,
    @Body() previewAdminMessageDto: PreviewAdminMessageDto,
    @AuthUser() user: User,
  ) {
    const group = await this.groupService.getGroupBySlug(slug);
    await this.groupMailService.previewAdminMessage(
      group,
      user.id,
      previewAdminMessageDto.subject,
      previewAdminMessageDto.message,
      previewAdminMessageDto.testEmail,
      previewAdminMessageDto.targetUserIds,
    );
    return { message: 'Preview email sent successfully' };
  }

  @Permissions({
    context: 'group',
    permissions: [GroupPermission.ContactAdmins],
  })
  @UseGuards(JWTAuthGuard, PermissionsGuard)
  @Post(':slug/contact-admins')
  @ApiOperation({
    summary: 'Send message from member to group admins',
    description: 'Allows group members to send a message to all group admins',
  })
  async contactAdmins(
    @Param('slug') slug: string,
    @Body() contactAdminsDto: ContactAdminsDto,
    @AuthUser() user: User,
  ) {
    const group = await this.groupService.getGroupBySlug(slug);
    return await this.groupMailService.sendMemberContactToAdmins(
      group,
      user.id,
      contactAdminsDto.contactType,
      contactAdminsDto.subject,
      contactAdminsDto.message,
    );
  }
}
