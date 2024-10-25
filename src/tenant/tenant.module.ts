import { Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant.service';

@Module({
  providers: [TenantConnectionService],
  exports: [TenantConnectionService],
})
export class TenantModule {}
