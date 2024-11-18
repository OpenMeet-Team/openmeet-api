import { Module } from '@nestjs/common';
import { ZulipService } from './zulip.service';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [UserModule],
  providers: [ZulipService],
  exports: [ZulipService],
})
export class ZulipModule {}
