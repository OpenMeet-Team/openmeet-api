import { Inject, Injectable, Scope } from '@nestjs/common';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import {
  CreateGroupMemberDto,
  UpdateGroupMemberRoleDto,
} from './dto/create-groupMember.dto';
import { REQUEST } from '@nestjs/core';
import { GroupPermission } from '../core/constants/constant';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { GroupMemberQueryService } from './group-member-query.service';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupMemberService {
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly groupMemberQueryService: GroupMemberQueryService,
  ) {}

  async createGroupOwner(createDto: CreateGroupMemberDto) {
    return this.groupMemberQueryService.createGroupOwner(
      createDto,
      this.request.tenantId,
    );
  }

  async findGroupMemberByUserId(
    groupId: number,
    userId: number,
  ): Promise<GroupMemberEntity | null> {
    return this.groupMemberQueryService.findGroupMemberByUserId(
      groupId,
      userId,
      this.request.tenantId,
    );
  }

  async findGroupMemberByUserSlugAndGroupSlug(
    groupSlug: string,
    userSlug: string,
  ): Promise<GroupMemberEntity | null> {
    return this.groupMemberQueryService.findGroupMemberByUserSlugAndGroupSlug(
      groupSlug,
      userSlug,
      this.request.tenantId,
    );
  }

  async updateGroupMemberRole(
    groupMemberId: number,
    updateDto: UpdateGroupMemberRoleDto,
    actingUserId: number,
  ): Promise<any> {
    return this.groupMemberQueryService.updateGroupMemberRole(
      groupMemberId,
      updateDto,
      actingUserId,
      this.request.tenantId,
    );
  }

  async leaveGroup(userId: number, groupId: number): Promise<any> {
    return this.groupMemberQueryService.leaveGroup(
      userId,
      groupId,
      this.request.tenantId,
    );
  }

  async removeGroupMember(
    groupId: number,
    groupMemberId: number,
  ): Promise<any> {
    return this.groupMemberQueryService.removeGroupMember(
      groupId,
      groupMemberId,
      this.request.tenantId,
    );
  }

  async findGroupDetailsMembers(groupId: number, limit: number): Promise<any> {
    return this.groupMemberQueryService.findGroupDetailsMembers(
      groupId,
      limit,
      this.request.tenantId,
    );
  }

  async approveMember(groupMemberId: number): Promise<any> {
    return this.groupMemberQueryService.approveMember(
      groupMemberId,
      this.request.tenantId,
    );
  }

  async rejectMember(groupMemberId: number): Promise<any> {
    return this.groupMemberQueryService.rejectMember(
      groupMemberId,
      this.request.tenantId,
    );
  }

  async createGroupMember(createDto: CreateGroupMemberDto, groupRole?: string) {
    return this.groupMemberQueryService.createGroupMember(
      createDto,
      groupRole,
      this.request.tenantId,
    );
  }

  async getGroupMembersCount(groupId: number): Promise<number> {
    return this.groupMemberQueryService.getGroupMembersCount(
      groupId,
      this.request.tenantId,
    );
  }

  async getMailServiceGroupMember(groupMemberId: number) {
    return this.groupMemberQueryService.getMailServiceGroupMember(
      groupMemberId,
      this.request.tenantId,
    );
  }

  async getMailServiceGroupMembersByPermission(
    groupId: number,
    permission: GroupPermission,
  ): Promise<UserEntity[]> {
    return this.groupMemberQueryService.getMailServiceGroupMembersByPermission(
      groupId,
      permission,
      this.request.tenantId,
    );
  }

  async getSpecificGroupMembers(
    groupId: number,
    userIds: number[],
  ): Promise<UserEntity[]> {
    return this.groupMemberQueryService.getSpecificGroupMembers(
      groupId,
      userIds,
      this.request.tenantId,
    );
  }

  async showGroupDetailsMember(groupMemberId: number): Promise<any> {
    return this.groupMemberQueryService.showGroupDetailsMember(
      groupMemberId,
      this.request.tenantId,
    );
  }

  /**
   * Get confirmed group members for Matrix room invitations
   * Only returns members with roles: owner, admin, moderator, member (excludes guests)
   * Used by Matrix Application Service for auto-invitations
   */
  async getConfirmedGroupMembersForMatrix(
    groupId: number,
  ): Promise<GroupMemberEntity[]> {
    return this.groupMemberQueryService.getConfirmedGroupMembersForMatrix(
      groupId,
      this.request.tenantId,
    );
  }
}
