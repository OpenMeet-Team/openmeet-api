import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupRoleEntity } from './infrastructure/persistence/relational/entities/group-role.entity';
import { GroupRoleController } from './group-role.controller';
import { GroupRoleService } from './group-role.service';

@Module({
  imports: [TypeOrmModule.forFeature([GroupRoleEntity])],
  controllers: [GroupRoleController],
  providers: [GroupRoleService, TenantConnectionService],
  exports: [GroupRoleService],
})
export class GroupRoleModule {}
