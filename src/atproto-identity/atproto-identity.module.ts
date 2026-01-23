import { Module } from '@nestjs/common';
import { AtprotoIdentityController } from './atproto-identity.controller';
import { AtprotoIdentityService } from './atproto-identity.service';
import { UserAtprotoIdentityModule } from '../user-atproto-identity/user-atproto-identity.module';
import { PdsModule } from '../pds/pds.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserAtprotoIdentityModule, PdsModule, UserModule],
  controllers: [AtprotoIdentityController],
  providers: [AtprotoIdentityService],
  exports: [AtprotoIdentityService],
})
export class AtprotoIdentityModule {}
