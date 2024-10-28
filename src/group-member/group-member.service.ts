import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { Repository } from 'typeorm';
import {
  CreateGroupMemberDto,
  UpdateGroupMemberRoleDto,
} from './dto/create-groupMember.dto';
import { REQUEST } from '@nestjs/core';
import { GroupRoleService } from '../group-role/group-role.service';
import { GroupRole } from '../core/constants/constant';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupMemberService {
  private groupMemberRepository: Repository<GroupMemberEntity>;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly groupRoleService: GroupRoleService,
  ) {}

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.groupMemberRepository = dataSource.getRepository(GroupMemberEntity);
  }

  async createGroupOwner(createDto: CreateGroupMemberDto) {
    await this.getTenantSpecificEventRepository();
    const group = { id: createDto.groupId };
    const user = { id: createDto.userId };

    // by default member role
    const groupRole = await this.groupRoleService.findOne(GroupRole.Owner);
    // const groupRole = { id: createDto.groupRoleId };
    const mappedDto = {
      ...createDto,
      user,
      group,
      groupRole,
    };
    const groupMember = this.groupMemberRepository.create(mappedDto);
    return await this.groupMemberRepository.save(groupMember);
  }

  async findGroupByUserId(): Promise<any> {}

  async findGroupMemberByUserId(
    groupId: number,
    userId: number,
  ): Promise<GroupMemberEntity | null> {
    console.log(groupId, userId);
    return await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId } },
      relations: ['groupRole'],
    });
  }

  async joinGroup(userId: number, groupId: number) {
    await this.getTenantSpecificEventRepository();
    const group = { id: groupId };
    const user = { id: userId };

    // by default member role
    const groupRole = await this.groupRoleService.findOne(GroupRole.Member);
    // const groupRole = { id: createDto.groupRoleId };
    const mappedDto = {
      user,
      group,
      groupRole,
    };
    const groupMember = this.groupMemberRepository.create(mappedDto);
    return await this.groupMemberRepository.save(groupMember);
  }

  async updateRole(updateDto: UpdateGroupMemberRoleDto): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const { userId, groupId, name } = updateDto;
    const groupMember = await this.groupMemberRepository.findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });
    if (!groupMember) {
      throw new NotFoundException(
        `Group member with user ID ${userId} and group ID ${groupId} not found`,
      );
    }
    const groupRole = await this.groupRoleService.findOne(name);
    if (!groupRole) {
      throw new NotFoundException(`Group role with name ${name} not found`);
    }
    groupMember.groupRole = groupRole;

    await this.groupMemberRepository.save(groupMember);
  }

  async leaveGroup(userId: number, groupId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const groupMember = await this.groupMemberRepository.findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });

    if (!groupMember) {
      throw new NotFoundException('User is not a member of this group');
    }

    await this.groupMemberRepository.remove(groupMember);
    return { message: 'User has left the group successfully' };
  }

  async getGroupMembers(
    groupId: number,
    pagination: PaginationDto,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { limit, page } = pagination;
    const groupMembers = await this.groupMemberRepository
      .createQueryBuilder('groupMember')
      .leftJoinAndSelect('groupMember.user', 'user')
      .leftJoinAndSelect('groupMember.groupRole', 'groupRole')
      .leftJoinAndSelect('groupRole.groupPermissions', 'groupPermissions')
      .leftJoinAndSelect('groupMember.group', 'group')
      .where('group.id = :groupId', { groupId });

    return paginate(groupMembers, { page, limit });
  }
}
