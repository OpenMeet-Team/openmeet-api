import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventRoleEntity } from 'src/event-role/infrastructure/persistence/relational/entities/event-role.entity';
import { EventRoleSeedService } from './event-role-seed.service';
import { TenantModule } from 'src/tenant/tenant.module';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([EventRoleEntity])],
  providers: [EventRoleSeedService],
  exports: [EventRoleSeedService],
})
export class EventRoleSeedModule {}
