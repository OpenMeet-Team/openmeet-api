import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../../../../tenant/tenant.module';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { UserPermissionEntity } from '../../../../user/infrastructure/persistence/relational/entities/user-permission.entity';
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
