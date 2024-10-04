import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../../../../tenant/tenant.service';
import { UserPermissionEntity } from '../../../../users/infrastructure/persistence/relational/entities/user-permission.entity';
import { UserEntity } from '../../../../users/infrastructure/persistence/relational/entities/user.entity';
import { PermissionEntity } from '../../../../permissions/infrastructure/persistence/relational/entities/permission.entity';


@Injectable()
export class UserPermissionSeedService {
  private userPermissionRepository: Repository<UserPermissionEntity>;
  private userRepository: Repository<UserEntity>;
  private permissionRepository: Repository<PermissionEntity>;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService, // Handles tenant-specific DB connections
  ) {}

  async run(tenantId: string) {
    const dataSource = await this.tenantConnectionService.getTenantConnection(tenantId);

    // Initialize repositories
    this.userPermissionRepository = dataSource.getRepository(UserPermissionEntity);
    this.userRepository = dataSource.getRepository(UserEntity);
    this.permissionRepository = dataSource.getRepository(PermissionEntity);

    // Fetch users and permissions
    const users = await this.userRepository.find();
    const permissions = await this.permissionRepository.find();

    // Assign permissions to users (customize as per requirements)
    for (const user of users) {
      for (const permission of permissions) {
        await this.assignPermissionToUser(user, permission, true); // Default to granted: true
      }
    }
  }

  // Method to assign permission to a user
  private async assignPermissionToUser(
    user: UserEntity,
    permission: PermissionEntity,
    granted: boolean,
  ) {
    const existingUserPermission = await this.userPermissionRepository.findOne({
      where: { user: { id: user.id }, permission: { id: permission.id } },
    });

    if (!existingUserPermission) {
      const newUserPermission = this.userPermissionRepository.create({
        user,
        permission,
        granted,
      });
      await this.userPermissionRepository.save(newUserPermission);
    }
  }
}
