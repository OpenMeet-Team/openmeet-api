import { Controller, Post, Body, Param, Delete, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GroupMemberService } from './group-member.service';
import { CreateGroupMemberDto, UpdateGroupMemberRoleDto } from './dto/create-groupMember.dto';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';

@ApiTags('Group Members')
@Controller('group-members')
export class GroupMemberController {
  constructor(private readonly groupMemberService: GroupMemberService) {}

  @Post('join')
  @ApiOperation({ summary: 'JOining a new group' })
  async create(
    @Body() createDto: CreateGroupMemberDto,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.joinGroup(createDto);
  }

  @Patch('update-role')
  @ApiOperation({})
  async updateRole(
    @Body() updateDto: UpdateGroupMemberRoleDto,
  ): Promise<GroupMemberEntity> {
    return this.groupMemberService.joinGroup(updateDto);
  }

  @Delete('leave/:userId/:groupId')
  async leaveGroup(
    @Param('userId') userId: number,
    @Param('groupId') groupId: number,
  ) {
    return this.groupMemberService.leaveGroup(userId, groupId);
  }
}
