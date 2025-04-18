import { forwardRef, Module } from '@nestjs/common';
import { ShadowAccountService } from './shadow-account.service';
import { ShadowAccountController } from './shadow-account.controller';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TenantModule, forwardRef(() => AuthModule)],
  controllers: [ShadowAccountController],
  providers: [ShadowAccountService],
  exports: [ShadowAccountService],
})
export class ShadowAccountModule {}
