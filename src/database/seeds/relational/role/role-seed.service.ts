import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../../roles/infrastructure/persistence/relational/entities/role.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEnum } from '../../../../roles/roles.enum'; // Assuming you have RoleEnum for role types.
import { PermissionEntity } from '../../../../permissions/infrastructure/persistence/relational/entities/permission.entity';

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
    await this.createRoleIfNotExists(RoleEnum.user, 'User', ['READ']);
    await this.createRoleIfNotExists(RoleEnum.admin, 'Admin', [
      'READ',
      'WRITE',
      'DELETE',
    ]);
  }

  // Helper method to create roles with assigned permissions
  private async createRoleIfNotExists(
    roleId: number,
    roleName: string,
    permissionNames: string[],
  ) {
    const count = await this.repository.count({ where: { id: roleId } });

    if (!count) {
      const role = this.repository.create({
        id: roleId,
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
    names: string[],
  ): Promise<PermissionEntity[]> {
    return this.permissionRepository.find({
      where: names.map((name) => ({ name })),
    });
  }
}
