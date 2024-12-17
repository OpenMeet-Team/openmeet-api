import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RoleEntity } from '../../../../role/infrastructure/persistence/relational/entities/role.entity';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { RoleEnum } from '../../../../role/role.enum';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { UserPermission } from '../../../../core/constants/constant';
import { PermissionRequirement } from '../../../../shared/guard/permissions.guard';

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
          UserPermission.AttendEvents,
          UserPermission.CreateEvents,
          UserPermission.CreateGroups,
          UserPermission.CreateIssues,
          UserPermission.JoinGroups,
          UserPermission.MessageAttendees,
          UserPermission.MessageMembers,
          UserPermission.MessageUsers,
          UserPermission.ViewEvents,
          UserPermission.ViewGroups,
        ],
      },
    ]);

    await this.createRoleIfNotExists(RoleEnum.Admin, [
      {
        context: 'user',
        permissions: Object.values(UserPermission),
      },
    ]);

    await this.createRoleIfNotExists(RoleEnum.Editor, [
      {
        context: 'user',
        permissions: [
          UserPermission.CreateAttendees,
          UserPermission.CreateCategories,
          UserPermission.CreateDiscussions,
          UserPermission.CreateEvents,
          UserPermission.CreateGroups,
          UserPermission.CreateIssues,
          UserPermission.CreateReports,
          UserPermission.CreateUsers,
          UserPermission.DeleteAttendees,
          UserPermission.DeleteCategories,
          UserPermission.DeleteDiscussions,
          UserPermission.DeleteEvents,
          UserPermission.DeleteGroups,
          UserPermission.DeleteIssues,
          UserPermission.DeleteReports,
          UserPermission.DeleteUsers,
          UserPermission.ManageAttendees,
          UserPermission.ManageCategories,
          UserPermission.ManageDiscussions,
          UserPermission.ManageEvents,
          UserPermission.ManageGroups,
          UserPermission.ManageIssues,
          UserPermission.ManageReports,
          UserPermission.ManageSettings,
          UserPermission.MessageAttendees,
          UserPermission.MessageMembers,
          UserPermission.MessageUsers,
          UserPermission.ViewEvents,
          UserPermission.ViewGroups,
        ],
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
