import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { Not, Repository } from 'typeorm';
import {
  CreateGroupMemberDto,
  UpdateGroupMemberRoleDto,
} from './dto/create-groupMember.dto';
import { REQUEST } from '@nestjs/core';
import { GroupRoleService } from '../group-role/group-role.service';
import { GroupPermission, GroupRole } from '../core/constants/constant';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';
import { JsonLogger } from '../logger/json.logger';
@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupMemberService {
  private groupMemberRepository: Repository<GroupMemberEntity>;
  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly groupRoleService: GroupRoleService,
    @Inject('Logger') private readonly auditLogger: JsonLogger,
  ) {
    this.auditLogger.setContext('GroupMemberService');
  }

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
    } as unknown as GroupMemberEntity;
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
      select: {
        id: true,
        user: {
          slug: true,
          firstName: true,
          lastName: true,
          name: true,
          photo: {
            path: true,
          },
        },
        groupRole: {
          name: true,
          groupPermissions: true,
        },
      },
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

    const removedGroupMember =
      await this.groupMemberRepository.remove(groupMember);

    this.auditLogger.log({
      type: 'audit',
      action: 'group_member_removed',
      groupMember: removedGroupMember,
    });

    return removedGroupMember;
  }

  async findGroupDetailsMembers(groupId: number, limit: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
        // groupRole: { name: Not(GroupRole.Guest) }, // TODO for users allowed manage members display guests
      },
      take: limit,
      relations: ['user.photo', 'groupRole'],
      select: {
        id: false,
        groupRole: {
          name: true,
        },
        user: {
          slug: true,
          name: true,
          firstName: true,
          lastName: true,
          photo: {
            path: true,
            fileName: false,
          },
        },
      },
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
    const role =
      (await this.groupRoleService.findOne(groupRole as GroupRole)) ||
      GroupRole.Guest;
    const mappedDto = {
      user,
      group,
      groupRole: role,
    } as GroupMemberEntity;
    const groupMember = this.groupMemberRepository.create(mappedDto);
    const savedGroupMember = await this.groupMemberRepository.save(groupMember);

    this.auditLogger.log({
      type: 'audit',
      action: 'group_member_created',
      groupMember: savedGroupMember,
    });

    return savedGroupMember;
  }

  async getGroupMembersCount(groupId: number): Promise<number> {
    await this.getTenantSpecificEventRepository();

    return await this.groupMemberRepository.count({
      where: {
        group: { id: groupId },
        groupRole: { name: Not(GroupRole.Guest) },
      },
    });
  }

  async getMailServiceGroupMember(groupMemberId: number) {
    await this.getTenantSpecificEventRepository();
    const groupMember = await this.groupMemberRepository.findOne({
      where: { id: groupMemberId },
      relations: ['user', 'group', 'groupRole', 'groupRole.groupPermissions'],
    });

    if (!groupMember) {
      throw new NotFoundException('Group member not found');
    }
    return groupMember;
  }

  async getMailServiceGroupMembersByPermission(
    groupId: number,
    permission: GroupPermission,
  ): Promise<UserEntity[]> {
    await this.getTenantSpecificEventRepository();
    const groupMembers = await this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
        groupRole: {
          groupPermissions: {
            name: permission,
          },
        },
      },
      relations: ['user'],
      select: {
        user: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          email: true,
        },
      },
    });
    return groupMembers.map((member) => member.user);
  }

  async showGroupDetailsMember(groupMemberId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.groupMemberRepository.findOne({
      where: {
        id: groupMemberId,
      },
      relations: ['user.photo', 'groupRole'],
      select: {
        id: false,
        groupRole: {
          name: true,
        },
        user: {
          slug: true,
          name: true,
          photo: {
            path: true,
            fileName: false,
          },
        },
      },
    });
  }
}
