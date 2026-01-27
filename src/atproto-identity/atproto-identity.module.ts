import { Module, forwardRef } from '@nestjs/common';
import { AtprotoIdentityController } from './atproto-identity.controller';
import { AtprotoIdentityService } from './atproto-identity.service';
import { AtprotoIdentityRecoveryService } from './atproto-identity-recovery.service';
import { UserAtprotoIdentityModule } from '../user-atproto-identity/user-atproto-identity.module';
import { PdsModule } from '../pds/pds.module';
import { UserModule } from '../user/user.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

@Module({
  imports: [
    UserAtprotoIdentityModule,
    PdsModule,
    forwardRef(() => UserModule),
    forwardRef(() => BlueskyModule),
  ],
  controllers: [AtprotoIdentityController],
  providers: [AtprotoIdentityService, AtprotoIdentityRecoveryService],
  exports: [AtprotoIdentityService, AtprotoIdentityRecoveryService],
})
export class AtprotoIdentityModule {}
