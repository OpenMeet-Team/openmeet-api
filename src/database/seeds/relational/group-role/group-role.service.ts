import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service'; // For tenant-specific DB handling
import { GroupRoleEntity } from '../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupPermissionEntity } from '../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { GroupRole } from '../../../../core/constants/constant';

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
    await this.createGroupRoleIfNotExists('owner', [
      'MANAGE_GROUP',
      'DELETE_GROUP',
      'MANAGE_MEMBERS',
      'MANAGE_EVENTS',
      'MANAGE_DISCUSSIONS',
      'MANAGE_REPORTS',
      // 'MANAGE_TICKETS',
    ]);
    await this.createGroupRoleIfNotExists('admin', [
      'EDIT_GROUP',
      'MANAGE_ROLES',
    ]);
    await this.createGroupRoleIfNotExists('guest', []);
    await this.createGroupRoleIfNotExists('member', ['READ_GROUP']);
    await this.createGroupRoleIfNotExists('moderator', [
      'READ_GROUP',
      'UPDATE_GROUP',
      'DELETE_GROUP',
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
    return this.groupPermissionRepository.find({
      where: names.map((name) => ({ name })),
    });
  }
}
