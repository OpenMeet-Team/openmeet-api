import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../../role/infrastructure/persistence/relational/entities/role.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEnum } from '../../../../role/role.enum';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { GroupPermission, UserPermission } from 'src/core/constants/constant';
import { PermissionRequirement } from 'src/shared/guard/permissions.guard';

@Injectable()
export class RoleSeedService {
  private repository: Repository<RoleEntity>;
  private permissionRepository: Repository<PermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.repository = dataSource.getRepository(RoleEntity);
    this.permissionRepository = dataSource.getRepository(PermissionEntity);

    // Seed roles and their permissions
    await this.createRoleIfNotExists(RoleEnum.User, [
      {
        context: 'user',
        permissions: [
          UserPermission.CreateGroups,
          UserPermission.ViewGroups,
          UserPermission.JoinGroups,
          UserPermission.CreateEvents,
          UserPermission.AttendEvents,
        ],
      },
    ]);

    await this.createRoleIfNotExists(RoleEnum.Admin, [
      {
        context: 'user',
        permissions: Object.values(UserPermission),
      },
      {
        context: 'group',
        permissions: Object.values(GroupPermission),
      },
    ]);

    await this.createRoleIfNotExists(RoleEnum.Editor, [
      {
        context: 'user',
        permissions: Object.values(UserPermission),
      },
      {
        context: 'group',
        permissions: Object.values(GroupPermission),
      },
    ]);
  }

  private async createRoleIfNotExists(
    roleName: RoleEnum,
    contextPermissions: PermissionRequirement[],
  ) {
    const count = await this.repository.count({ where: { name: roleName } });

    if (!count) {
      const role = this.repository.create({
        name: roleName,
      });

      const permissions = await this.getPermissionsByNames(contextPermissions);
      role.permissions = permissions;

      await this.repository.save(role);
    }
  }

  private async getPermissionsByNames(
    contextPermissions: PermissionRequirement[],
  ): Promise<PermissionEntity[]> {
    const permissionNames = contextPermissions.flatMap((cp) => cp.permissions);
    return this.permissionRepository.find({
      where: permissionNames.map((name) => ({ name })),
    });
  }
}
