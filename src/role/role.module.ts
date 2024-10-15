import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { RoleEntity } from './infrastructure/persistence/relational/entities/role.entity';
import { RoleService } from './role.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity])],
  controllers: [],
  providers: [RoleService, TenantConnectionService],
  exports: [RoleService],
})
export class RoleModule {}
