import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../../../../tenant/tenant.module';
import { PermissionEntity } from '../../../../permission/infrastructure/persistence/relational/entities/permission.entity';
import { PermissionSeedService } from './permission-seed.service';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([PermissionEntity])],
  providers: [PermissionSeedService],
  exports: [PermissionSeedService],
})
export class PermissionSeedModule {}
