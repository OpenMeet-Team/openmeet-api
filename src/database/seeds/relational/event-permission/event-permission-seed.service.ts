import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { EventPermissionEntity } from '../../../../event-permission/infrastructure/persistence/relational/entities/event-permission.entity';
import { EventAttendeePermission } from '../../../../core/constants/constant';
import { TenantConnectionService } from '../../../../tenant/tenant.service';

@Injectable()
export class EventPermissionSeedService {
  private repository: Repository<EventPermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async run(tenantId: string) {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.repository = dataSource.getRepository(EventPermissionEntity);

    // Always check and create missing permissions individually
    for (const permission of Object.values(EventAttendeePermission)) {
      await this.createPermissionIfNotExists(permission);
    }
  }

  // Method to check if the permission exists and create it if not
  private async createPermissionIfNotExists(permissionName: string) {
    const count = await this.repository.count({
      where: { name: permissionName as EventAttendeePermission },
    });

    if (count === 0) {
      const newPermission = this.repository.create({
        name: permissionName as EventAttendeePermission,
      });
      await this.repository.save(newPermission);
    }
  }
}
