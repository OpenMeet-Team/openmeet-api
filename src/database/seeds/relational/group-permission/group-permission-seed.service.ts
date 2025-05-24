import { Injectable } from '@nestjs/common';
import { GroupPermissionEntity } from '../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { Repository } from 'typeorm';
import { GroupPermission } from '../../../../core/constants/constant';
import { TenantConnectionService } from '../../../../tenant/tenant.service';

@Injectable()
export class GroupPermissionSeedService {
  private repository: Repository<GroupPermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.repository = dataSource.getRepository(GroupPermissionEntity);

    // Always check and create missing permissions individually
    for (const permission of Object.values(GroupPermission)) {
      await this.createPermissionIfNotExists(permission);
    }
  }

  // Method to check if the permission exists and create it if not
  private async createPermissionIfNotExists(permissionName: string) {
    const count = await this.repository.count({
      where: { name: permissionName as GroupPermission },
    });

    if (count === 0) {
      const newPermission = this.repository.create({
        name: permissionName as GroupPermission,
      });
      await this.repository.save(newPermission);
    }
  }
}
