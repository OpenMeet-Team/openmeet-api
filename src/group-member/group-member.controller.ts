import { Controller, Post, Body, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GroupMemberService } from './group-member.service';
import { CreateGroupMemberDto, UpdateGroupMemberRoleDto } from './dto/create-groupMember.dto';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { JWTAuthGuard } from '../core/guards/auth.guard';
import { AuthUser } from '../core/decorators/auth-user.decorator';
import { User } from '../user/domain/user';

@ApiTags('Group Members')
@Controller('group-members')
@ApiBearerAuth()
@UseGuards(JWTAuthGuard)
export class GroupMemberController {
  constructor(private readonly groupMemberService: GroupMemberService) {}

  @Post('join/:groupId')
  @ApiOperation({ summary: 'JOining a new group' })
  async create(
    @AuthUser() user: User,
    @Param('groupId') groupId: number,
  ): Promise<GroupMemberEntity> {
    const userId = user.id
    return this.groupMemberService.joinGroup(userId, groupId);
  }

  @Patch('update-role')
  @ApiOperation({})
  async updateRole(
    @Body() updateDto: UpdateGroupMemberRoleDto,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.updateRole(updateDto);
  }

  @Delete('leave/:groupId')
  async leaveGroup(
    @AuthUser() user: User,
    @Param('groupId') groupId: number,
  ) {
    const userId = user.id
    return this.groupMemberService.leaveGroup(userId, groupId);
  }
}
