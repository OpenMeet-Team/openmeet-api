import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../../role/infrastructure/persistence/relational/entities/role.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEnum } from '../../../../role/role.enum'; // Assuming you have RoleEnum for role types.
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { UserPermission } from 'src/core/constants/constant';

@Injectable()
export class RoleSeedService {
  private repository: Repository<RoleEntity>;
  private permissionRepository: Repository<PermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService, // For tenant-specific DB handling
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    // Initialize repository for roles and permissions
    this.repository = dataSource.getRepository(RoleEntity);
    this.permissionRepository = dataSource.getRepository(PermissionEntity);

    // Seed roles and their permissions
    await this.createRoleIfNotExists(RoleEnum.User, [
      UserPermission.CreateEvents,
      UserPermission.CreateGroups,
      UserPermission.CreateIssues,
      UserPermission.ViewGroups,
      UserPermission.ViewEvents,
      UserPermission.AttendEvents,
      UserPermission.JoinGroups,
      UserPermission.MessageMembers,
      UserPermission.MessageAttendees,
      UserPermission.MessageUsers,
    ]);
    await this.createRoleIfNotExists(RoleEnum.Admin, []); // All permissions
    await this.createRoleIfNotExists(RoleEnum.Editor, []); // All permissions but not manage settings
  }

  // Helper method to create roles with assigned permissions
  private async createRoleIfNotExists(
    roleName: RoleEnum,
    permissionNames: UserPermission[],
  ) {
    const count = await this.repository.count({ where: { name: roleName } });

    if (!count) {
      const role = this.repository.create({
        name: roleName,
      });

      // Assign permissions to the role
      const permissions = await this.getPermissionsByNames(permissionNames);
      role.permissions = permissions;

      await this.repository.save(role);
    }
  }

  // Fetch permissions by their names
  private async getPermissionsByNames(
    names: UserPermission[],
  ): Promise<PermissionEntity[]> {
    return this.permissionRepository.find({
      where: names.map((name) => ({ name })),
    });
  }
}
