import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../../../../tenant/tenant.module';
import { GroupRoleEntity } from '../../../../group-role/infrastructure/persistence/relational/entities/group-role.entity';
import { GroupPermissionEntity } from '../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { GroupRoleSeedService } from './group-role.service';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([GroupRoleEntity, GroupPermissionEntity]),
  ],
  providers: [GroupRoleSeedService],
  exports: [GroupRoleSeedService],
})
export class GroupRoleSeedModule {}
