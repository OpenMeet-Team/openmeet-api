import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupPermissionEntity } from '../../../../group-permission/infrastructure/persistence/relational/entities/group-permission.entity';
import { GroupPermissionSeedService } from './group-permission-seed.service';
import { TenantModule } from '../../../../tenant/tenant.module';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([GroupPermissionEntity])],
  providers: [GroupPermissionSeedService],
  exports: [GroupPermissionSeedService],
})
export class GroupPermissionSeedModule {}
