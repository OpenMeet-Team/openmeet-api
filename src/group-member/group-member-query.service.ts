import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupMemberEntity } from './infrastructure/persistence/relational/entities/group-member.entity';
import { Not, Repository, In } from 'typeorm';
import {
  CreateGroupMemberDto,
  UpdateGroupMemberRoleDto,
} from './dto/create-groupMember.dto';
import { GroupRoleService } from '../group-role/group-role.service';
import { GroupPermission, GroupRole } from '../core/constants/constant';
import { UserEntity } from 'src/user/infrastructure/persistence/relational/entities/user.entity';

@Injectable()
export class GroupMemberQueryService {
  // Role hierarchy: higher numbers = higher privilege
  private readonly roleHierarchy = {
    [GroupRole.Guest]: 1,
    [GroupRole.Member]: 2,
    [GroupRole.Moderator]: 3,
    [GroupRole.Admin]: 4,
    [GroupRole.Owner]: 5,
  };

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly groupRoleService: GroupRoleService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async getTenantSpecificRepository(
    tenantId: string,
  ): Promise<Repository<GroupMemberEntity>> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    return dataSource.getRepository(GroupMemberEntity);
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

  async createGroupOwner(createDto: CreateGroupMemberDto, tenantId: string) {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const group = { id: createDto.groupId };
    const user = { id: createDto.userId };

    const groupRole = await this.groupRoleService.findOne(GroupRole.Owner);
    const mappedDto = {
      ...createDto,
      user,
      group,
      groupRole,
    } as unknown as GroupMemberEntity;
    const groupMember = groupMemberRepository.create(mappedDto);
    return await groupMemberRepository.save(groupMember);
  }

  async findGroupMemberByUserId(
    groupId: number,
    userId: number,
    tenantId: string,
  ): Promise<GroupMemberEntity | null> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    return await groupMemberRepository.findOne({
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
    tenantId: string,
  ): Promise<GroupMemberEntity | null> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    return await groupMemberRepository.findOne({
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
    tenantId: string,
  ): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const { name } = updateDto;

    // Get the target group member with their current role and group info
    const targetGroupMember = await groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
      relations: ['groupRole', 'group', 'user'],
    });

    // Get the new role
    const newGroupRole = await this.groupRoleService.findOne(name);
    if (!newGroupRole) {
      throw new NotFoundException(`Group role with name ${name} not found`);
    }

    // Find the current user's role in this group
    const actingUserGroupMember = await groupMemberRepository.findOne({
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

    // Capture the old role before changing it
    const oldRole = targetGroupMember.groupRole.name;

    // If validation passes, proceed with the role change
    targetGroupMember.groupRole = newGroupRole;
    await groupMemberRepository.save(targetGroupMember);

    // Emit event for Matrix integration to handle role changes
    this.eventEmitter.emit('chat.group.member.role.update', {
      groupSlug: targetGroupMember.group.slug,
      userSlug: targetGroupMember.user.slug,
      oldRole: oldRole,
      newRole: name,
      tenantId,
    });

    return await groupMemberRepository.findOne({
      where: { id: groupMemberId },
      relations: ['groupRole', 'groupRole.groupPermissions', 'user'],
    });
  }

  async leaveGroup(
    userId: number,
    groupId: number,
    tenantId: string,
  ): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMember = await groupMemberRepository.findOne({
      where: { user: { id: userId }, group: { id: groupId } },
      relations: ['user', 'group'],
    });

    if (!groupMember) {
      throw new NotFoundException('User is not a member of this group');
    }

    return await groupMemberRepository.remove(groupMember);
  }

  async removeGroupMember(
    groupId: number,
    groupMemberId: number,
    tenantId: string,
  ): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMember = await groupMemberRepository.findOne({
      where: { group: { id: groupId }, id: groupMemberId },
    });

    if (!groupMember) {
      throw new NotFoundException('User is not a member of this group');
    }

    return await groupMemberRepository.remove(groupMember);
  }

  async findGroupDetailsMembers(
    groupId: number,
    limit: number,
    tenantId: string,
  ): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);

    // Use query builder to avoid ambiguous column reference issues with ordering
    const query = groupMemberRepository
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

  async approveMember(groupMemberId: number, tenantId: string): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMember = await groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
    });

    const groupRole = await this.groupRoleService.findOne(GroupRole.Member);
    if (!groupRole) {
      throw new NotFoundException('Group role not found');
    }
    groupMember.groupRole = groupRole;
    return await groupMemberRepository.save(groupMember);
  }

  async rejectMember(groupMemberId: number, tenantId: string): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMember = await groupMemberRepository.findOneOrFail({
      where: { id: groupMemberId },
    });
    return await groupMemberRepository.remove(groupMember);
  }

  async createGroupMember(
    createDto: CreateGroupMemberDto,
    groupRole: string | undefined,
    tenantId: string,
  ) {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
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
    const groupMember = groupMemberRepository.create(mappedDto);
    return await groupMemberRepository.save(groupMember);
  }

  async getGroupMembersCount(
    groupId: number,
    tenantId: string,
  ): Promise<number> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);

    return await groupMemberRepository.count({
      where: {
        group: { id: groupId },
        groupRole: { name: Not(GroupRole.Guest) },
      },
    });
  }

  async getMailServiceGroupMember(groupMemberId: number, tenantId: string) {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMember = await groupMemberRepository.findOne({
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
    tenantId: string,
  ): Promise<UserEntity[]> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMembers = await groupMemberRepository.find({
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
    tenantId: string,
  ): Promise<UserEntity[]> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    const groupMembers = await groupMemberRepository.find({
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

  async showGroupDetailsMember(
    groupMemberId: number,
    tenantId: string,
  ): Promise<any> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);
    return await groupMemberRepository.findOne({
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
    tenantId: string,
  ): Promise<GroupMemberEntity[]> {
    const groupMemberRepository =
      await this.getTenantSpecificRepository(tenantId);

    // Get all group members excluding guests
    const allowedRoles = [
      GroupRole.Owner,
      GroupRole.Admin,
      GroupRole.Moderator,
      GroupRole.Member,
    ];

    const groupMembers = await groupMemberRepository.find({
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
