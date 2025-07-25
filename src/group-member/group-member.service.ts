import {
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  ForbiddenException,
} from '@nestjs/common';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { Not, Repository, In } from 'typeorm';
import {
  CreateGroupMemberDto,
  UpdateGroupMemberRoleDto,
} from './dto/create-groupMember.dto';
import { REQUEST } from '@nestjs/core';
import { GroupRoleService } from '../group-role/group-role.service';
import { GroupPermission, GroupRole } from '../core/constants/constant';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class GroupMemberService {
  private groupMemberRepository: Repository<GroupMemberEntity>;

  // Role hierarchy: higher numbers = higher privilege
  private readonly roleHierarchy = {
    [GroupRole.Guest]: 1,
    [GroupRole.Member]: 2,
    [GroupRole.Moderator]: 3,
    [GroupRole.Admin]: 4,
    [GroupRole.Owner]: 5,
  };

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

  /**
   * Validates if a role change is allowed based on role hierarchy rules
   */
  private validateRoleChange(
    actingUserRole: GroupRole,
    targetCurrentRole: GroupRole,
    targetNewRole: GroupRole,
  ): void {
    const actingUserLevel = this.roleHierarchy[actingUserRole];
    const targetCurrentLevel = this.roleHierarchy[targetCurrentRole];
    const targetNewLevel = this.roleHierarchy[targetNewRole];

    // Rule 1: Only Owner can promote to Owner role
    if (
      targetNewRole === GroupRole.Owner &&
      actingUserRole !== GroupRole.Owner
    ) {
      throw new ForbiddenException(
        'Only group owners can promote users to owner role',
      );
    }

    // Rule 2: Users cannot modify roles of higher privilege (but can modify equal roles)
    if (targetCurrentLevel > actingUserLevel) {
      throw new ForbiddenException(
        'Cannot modify roles of users with higher privileges',
      );
    }

    // Rule 3: Users cannot promote others above their own level (but can promote to their own level)
    if (targetNewLevel > actingUserLevel) {
      throw new ForbiddenException(
        'Cannot promote users above your own privilege level',
      );
    }

    // Rule 4: Moderators can only manage Member and Guest roles
    if (actingUserRole === GroupRole.Moderator) {
      if (
        targetCurrentRole === GroupRole.Admin ||
        targetCurrentRole === GroupRole.Owner
      ) {
        throw new ForbiddenException(
          'Moderators cannot modify admin or owner roles',
        );
      }
      if (
        targetNewRole === GroupRole.Admin ||
        targetNewRole === GroupRole.Owner
      ) {
        throw new ForbiddenException(
          'Moderators cannot promote users to admin or owner roles',
        );
      }
    }
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

  async findGroupMemberByUserSlugAndGroupSlug(
    groupSlug: string,
    userSlug: string,
  ): Promise<GroupMemberEntity | null> {
    await this.getTenantSpecificEventRepository();
    return await this.groupMemberRepository.findOne({
      where: { group: { slug: groupSlug }, user: { slug: userSlug } },
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
    actingUserId: number,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const { name } = updateDto;

    // Get the target group member with their current role and group info
    const targetGroupMember = await this.groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
      relations: ['groupRole', 'group', 'user'],
    });

    // Get the new role
    const newGroupRole = await this.groupRoleService.findOne(name);
    if (!newGroupRole) {
      throw new NotFoundException(`Group role with name ${name} not found`);
    }

    // Find the current user's role in this group
    const actingUserGroupMember = await this.groupMemberRepository.findOne({
      where: {
        user: { id: actingUserId },
        group: { id: targetGroupMember.group.id },
      },
      relations: ['groupRole'],
    });

    if (!actingUserGroupMember || !actingUserGroupMember.groupRole) {
      throw new ForbiddenException(
        'You are not a member of this group or your role could not be determined',
      );
    }

    // Validate the role change based on hierarchy rules
    this.validateRoleChange(
      actingUserGroupMember.groupRole.name as GroupRole,
      targetGroupMember.groupRole.name as GroupRole,
      name as GroupRole,
    );

    // If validation passes, proceed with the role change
    targetGroupMember.groupRole = newGroupRole;
    await this.groupMemberRepository.save(targetGroupMember);

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

    // Use query builder to avoid ambiguous column reference issues with ordering
    const query = this.groupMemberRepository
      .createQueryBuilder('groupMember')
      .leftJoinAndSelect('groupMember.user', 'user')
      .leftJoinAndSelect('user.photo', 'photo')
      .leftJoinAndSelect('groupMember.groupRole', 'groupRole')
      .where('groupMember.group.id = :groupId', { groupId })
      // TODO: for users allowed manage members display guests
      // .andWhere('groupRole.name != :guestRole', { guestRole: GroupRole.Guest })
      .orderBy('user.lastName', 'ASC')
      .addOrderBy('user.firstName', 'ASC')
      .select([
        'groupMember.id',
        'groupRole.name',
        'user.id',
        'user.slug',
        'user.name',
        'user.firstName',
        'user.lastName',
        'user.email',
        'photo.path',
      ]);

    if (limit > 0) {
      query.limit(limit);
    }

    return await query.getMany();
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
    return await this.groupMemberRepository.save(groupMember);
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

  async getSpecificGroupMembers(
    groupId: number,
    userIds: number[],
  ): Promise<UserEntity[]> {
    await this.getTenantSpecificEventRepository();
    const groupMembers = await this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
        user: { id: In(userIds) },
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

  /**
   * Get confirmed group members for Matrix room invitations
   * Only returns members with roles: owner, admin, moderator, member (excludes guests)
   * Used by Matrix Application Service for auto-invitations
   */
  async getConfirmedGroupMembersForMatrix(
    groupId: number,
  ): Promise<GroupMemberEntity[]> {
    await this.getTenantSpecificEventRepository();

    // Get all group members excluding guests
    const allowedRoles = [
      GroupRole.Owner,
      GroupRole.Admin,
      GroupRole.Moderator,
      GroupRole.Member,
    ];

    const groupMembers = await this.groupMemberRepository.find({
      where: {
        group: { id: groupId },
        groupRole: { name: In(allowedRoles) },
      },
      relations: ['user', 'groupRole'],
      select: {
        id: true,
        user: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          name: true,
        },
        groupRole: {
          name: true,
        },
      },
    });

    return groupMembers;
  }
}
