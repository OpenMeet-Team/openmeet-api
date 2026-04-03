import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ContrailQueryService } from './contrail-query.service';
import { ContrailGeoSyncService } from './contrail-geo-sync.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [ScheduleModule.forRoot(), TenantModule],
  providers: [ContrailQueryService, ContrailGeoSyncService],
  exports: [ContrailQueryService],
})
export class ContrailModule {}
