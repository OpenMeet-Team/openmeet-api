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

    const groupRole = await this.groupRoleService.findOne(GroupRole.Owner);
    const mappedDto = {
      ...createDto,
      user,
      group,
      groupRole,
    };
    const groupMember = this.groupMemberRepository.create(mappedDto);
    return await this.groupMemberRepository.save(groupMember);
  }

  async findGroupMemberByUserId(
    groupId: number,
    userId: number,
  ): Promise<GroupMemberEntity | null> {
    await this.getTenantSpecificEventRepository();
    return await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, user: { id: userId } },
      relations: ['groupRole', 'groupRole.groupPermissions', 'user'],
    });
  }

  async updateGroupMemberRole(
    groupMemberId: number,
    updateDto: UpdateGroupMemberRoleDto,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const { name } = updateDto;
    const groupMember = await this.groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
    });

    const groupRole = await this.groupRoleService.findOne(name);
    if (!groupRole) {
      throw new NotFoundException(`Group role with name ${name} not found`);
    }
    groupMember.groupRole = groupRole;

    await this.groupMemberRepository.save(groupMember);

    return await this.groupMemberRepository.findOne({
      where: { id: groupMemberId },
      relations: ['groupRole', 'groupRole.groupPermissions', 'user'],
    });
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

    return await this.groupMemberRepository.remove(groupMember);
  }

  async removeGroupMember(
    groupId: number,
    groupMemberId: number,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const groupMember = await this.groupMemberRepository.findOne({
      where: { group: { id: groupId }, id: groupMemberId },
    });

    if (!groupMember) {
      throw new NotFoundException('User is not a member of this group');
    }

    return await this.groupMemberRepository.remove(groupMember);
  }

  async findGroupDetailsMembers(groupId: number, limit: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.groupMemberRepository.find({
      where: { group: { id: groupId } },
      take: limit,
      relations: ['user', 'groupRole'],
    });
  }

  async approveMember(groupMemberId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const groupMember = await this.groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
    });

    const groupRole = await this.groupRoleService.findOne(GroupRole.Member);
    if (!groupRole) {
      throw new NotFoundException('Group role not found');
    }
    groupMember.groupRole = groupRole;
    return await this.groupMemberRepository.save(groupMember);
  }

  async rejectMember(groupMemberId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const groupMember = await this.groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
    });
    return await this.groupMemberRepository.remove(groupMember);
  }

  async createGroupMember(createDto: CreateGroupMemberDto, groupRole?: string) {
    await this.getTenantSpecificEventRepository();
    const group = { id: createDto.groupId };
    const user = { id: createDto.userId };
    const role = await this.groupRoleService.findOne(
      groupRole || GroupRole.Guest,
    );
    const mappedDto = {
      user,
      group,
      groupRole: role,
    };
    const groupMember = this.groupMemberRepository.create(mappedDto);
    return await this.groupMemberRepository.save(groupMember);
  }
}
