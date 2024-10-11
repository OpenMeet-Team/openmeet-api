import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleSeedService } from './role-seed.service';
import { RoleEntity } from '../../../../role/infrastructure/persistence/relational/entities/role.entity';
import { TenantModule } from '../../../../tenant/tenant.module';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([RoleEntity, PermissionEntity]),
  ],
  providers: [RoleSeedService],
  exports: [RoleSeedService],
})
export class RoleSeedModule {}
