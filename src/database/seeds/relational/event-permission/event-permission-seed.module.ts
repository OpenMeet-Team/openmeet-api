import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventPermissionEntity } from '../../../../event-permission/infrastructure/persistence/relational/entities/event-permission.entity';
import { EventPermissionSeedService } from './event-permission-seed.service';
import { TenantModule } from 'src/tenant/tenant.module';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([EventPermissionEntity])],
  providers: [EventPermissionSeedService],
  exports: [EventPermissionSeedService],
})
export class EventPermissionSeedModule {}
