import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';

@Injectable()
export class PermissionSeedService {
  private repository: Repository<PermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService, // Handles tenant-specific connections
  ) {}

  // Seed method to run the seeding logic
  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    // Initialize repository for PermissionEntity
    this.repository = dataSource.getRepository(PermissionEntity);

    // List of permissions to seed
    const permissions = [
      { name: 'READ_EVENTS' },
      { name: 'WRITE_EVENTS' },
      { name: 'DELETE_EVENTS' },
      { name: 'MANAGE_USERS' },
    ];

    // Seed each permission if it doesn't already exist
    for (const permission of permissions) {
      await this.createPermissionIfNotExists(permission.name);
    }
  }

  // Method to check if the permission exists and create it if not
  private async createPermissionIfNotExists(permissionName: string) {
    const count = await this.repository.count({
      where: { name: permissionName },
    });

    if (count === 0) {
      const newPermission = this.repository.create({ name: permissionName });
      await this.repository.save(newPermission);
    }
  }
}
