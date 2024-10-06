import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../../../../tenant/tenant.module';
import { PermissionEntity } from '../../../../permissions/infrastructure/persistence/relational/entities/permission.entity';
import { UserPermissionEntity } from '../../../../users/infrastructure/persistence/relational/entities/user-permission.entity';
import { UserPermissionSeedService } from './user-permission-seed.service';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([
      PermissionEntity,
      PermissionEntity,
      UserPermissionEntity,
    ]),
  ],
  providers: [UserPermissionSeedService],
  exports: [UserPermissionSeedService],
})
export class UserPermissionSeedModule {}
