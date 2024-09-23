import { Module } from '@nestjs/common';
import { TenantConnectionService } from './tenant.service'; // Ensure this path is correct

@Module({
  providers: [TenantConnectionService], // Provide TenantConnectionService
  exports: [TenantConnectionService], // Export TenantConnectionService
})
export class TenantModule {} // Fix the module name here
