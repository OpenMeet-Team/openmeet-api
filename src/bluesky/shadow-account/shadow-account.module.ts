import { Module } from '@nestjs/common';
import { ShadowAccountService } from './shadow-account.service';
import { TenantModule } from '../../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  providers: [ShadowAccountService],
  exports: [ShadowAccountService],
})
export class ShadowAccountModule {}
