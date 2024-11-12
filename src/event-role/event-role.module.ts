import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventRoleEntity } from './infrastructure/persistence/relational/entities/event-role.entity';
import { EventRoleController } from './event-role.controller';
import { EventRoleService } from './event-role.service';

@Module({
  imports: [TypeOrmModule.forFeature([EventRoleEntity])],
  controllers: [EventRoleController],
  providers: [EventRoleService, TenantConnectionService],
  exports: [EventRoleService],
})
export class EventRoleModule {}
