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
      GroupPermission.ContactMembers,
      GroupPermission.ContactAdmins,
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
      GroupPermission.ContactMembers,
      GroupPermission.ContactAdmins,
      GroupPermission.SeeGroup,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeMembers,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Guest, [
      GroupPermission.ContactAdmins,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Member, [
      GroupPermission.MessageDiscussion,
      GroupPermission.MessageMember,
      GroupPermission.ContactAdmins,
      GroupPermission.SeeMembers,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeGroup,
    ]);
    await this.createGroupRoleIfNotExists(GroupRole.Moderator, [
      GroupPermission.ManageMembers,
      GroupPermission.ManageDiscussions,
      GroupPermission.MessageDiscussion,
      GroupPermission.ContactAdmins,
      GroupPermission.SeeGroup,
      GroupPermission.SeeEvents,
      GroupPermission.SeeDiscussions,
      GroupPermission.SeeMembers,
    ]);
  }

  // Helper method to create or update group roles with assigned permissions (idempotent)
  private async createGroupRoleIfNotExists(
    roleName: string,
    permissionNames: string[],
  ) {
    // Check if role exists
    let groupRole = await this.groupRoleRepository.findOne({
      where: { name: roleName as GroupRole },
      relations: ['groupPermissions'],
    });

    if (!groupRole) {
      // Create new role
      groupRole = this.groupRoleRepository.create({
        name: roleName as GroupRole,
      });
      console.log(`Creating new role: ${roleName}`);
    } else {
      console.log(`Updating existing role: ${roleName}`);
    }

    // Always update permissions to ensure they include any new permissions
    // This makes seeding idempotent - safe to re-run
    const permissions = await this.getGroupPermissionsByNames(permissionNames);
    groupRole.groupPermissions = permissions;
    await this.groupRoleRepository.save(groupRole);
    
    console.log(`Role ${roleName} now has ${permissions.length} permissions: ${permissions.map(p => p.name).join(', ')}`);
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
