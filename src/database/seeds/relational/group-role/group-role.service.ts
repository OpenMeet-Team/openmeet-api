import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service'; // For tenant-specific DB handling
import { GroupRoleEntity } from '../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupPermissionEntity } from '../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import {
  GroupPermission,
  GroupRole,
} from '../../../../core/constants/constant';

@Injectable()
export class GroupRoleSeedService {
  private groupRoleRepository: Repository<GroupRoleEntity>;
  private groupPermissionRepository: Repository<GroupPermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService, // For tenant-specific DB handling
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    // Initialize repository for group roles and permissions
    this.groupRoleRepository = dataSource.getRepository(GroupRoleEntity);
    this.groupPermissionRepository = dataSource.getRepository(
      GroupPermissionEntity,
    );

    // Seed group roles and their permissions
    await this.createGroupRoleIfNotExists(GroupRole.Owner, [
      GroupPermission.ManageGroup,
      GroupPermission.DeleteGroup,
      GroupPermission.ManageMembers,
      GroupPermission.ManageEvents,
      GroupPermission.ManageDiscussions,
      GroupPermission.MessageDiscussion,
      GroupPermission.ManageReports,
      GroupPermission.ManageBilling,
      GroupPermission.CreateEvent,
      GroupPermission.SendGroupMessage,
      GroupPermission.SendBulkGroupMessage,
      GroupPermission.ContactGroupAdmins,
      GroupPermission.SeeGroup,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeMembers,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Admin, [
      GroupPermission.ManageGroup,
      GroupPermission.ManageMembers,
      GroupPermission.ManageEvents,
      GroupPermission.ManageDiscussions,
      GroupPermission.ManageReports,
      GroupPermission.CreateEvent,
      GroupPermission.MessageDiscussion,
      GroupPermission.SendGroupMessage,
      GroupPermission.SendBulkGroupMessage,
      GroupPermission.ContactGroupAdmins,
      GroupPermission.SeeGroup,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeMembers,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Guest, []);
    await this.createGroupRoleIfNotExists(GroupRole.Member, [
      GroupPermission.MessageDiscussion,
      GroupPermission.MessageMember,
      GroupPermission.ContactGroupAdmins,
      GroupPermission.SeeMembers,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeGroup,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Moderator, [
      GroupPermission.ManageMembers,
      GroupPermission.ManageDiscussions,
      GroupPermission.MessageDiscussion,
      GroupPermission.SendGroupMessage,
      GroupPermission.ContactGroupAdmins,
      GroupPermission.SeeGroup,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeMembers,
    ]);
  }

  // Helper method to create group roles with assigned permissions
  private async createGroupRoleIfNotExists(
    roleName: string,
    permissionNames: string[],
  ) {
    const count = await this.groupRoleRepository.count({
      where: { name: roleName as GroupRole },
    });

    if (!count) {
      const groupRole = this.groupRoleRepository.create({
        name: roleName as GroupRole,
      });

      // Assign permissions to the group role
      const permissions =
        await this.getGroupPermissionsByNames(permissionNames);

      groupRole.groupPermissions = permissions;
      await this.groupRoleRepository.save(groupRole);
    }
  }

  // Fetch group permissions by their names
  private async getGroupPermissionsByNames(
    names: string[],
  ): Promise<GroupPermissionEntity[]> {
    if (names.length === 0) {
      return [];
    }
    return this.groupPermissionRepository.find({
      where: names.map((name) => ({ name: name as GroupPermission })),
    });
  }
}
