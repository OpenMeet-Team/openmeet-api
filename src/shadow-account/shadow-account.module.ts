import { forwardRef, Module } from '@nestjs/common';
import { ShadowAccountService } from './shadow-account.service';
import { ShadowAccountController } from './shadow-account.controller';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

@Module({
  imports: [
    TenantModule,
    forwardRef(() => AuthModule),
    forwardRef(() => BlueskyModule),
  ],
  controllers: [ShadowAccountController],
  providers: [ShadowAccountService],
  exports: [ShadowAccountService],
})
export class ShadowAccountModule {}
