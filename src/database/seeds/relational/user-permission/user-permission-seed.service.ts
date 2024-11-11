import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { UserPermission } from '../../../../core/constants/constant';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';

@Injectable()
export class UserPermissionSeedService {
  private permissionRepository: Repository<PermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.permissionRepository = dataSource.getRepository(PermissionEntity);

    const count = await this.permissionRepository.count();

    if (count === 0) {
      // loop over GroupPermission and create permissions
      for (const permission of Object.values(UserPermission)) {
        await this.createPermissionIfNotExists(permission);
      }
    }
  }

  // Method to check if the permission exists and create it if not
  private async createPermissionIfNotExists(permissionName: string) {
    const count = await this.permissionRepository.count({
      where: { name: permissionName as UserPermission },
    });

    if (count === 0) {
      const newPermission = this.permissionRepository.create({
        name: permissionName as UserPermission,
      });
      await this.permissionRepository.save(newPermission);
    }
  }
}
