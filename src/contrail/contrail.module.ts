import { Module } from '@nestjs/common';
import { ContrailQueryService } from './contrail-query.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  providers: [ContrailQueryService],
  exports: [ContrailQueryService],
})
export class ContrailModule {}
