import { Module } from '@nestjs/common';
import { ZulipService } from './zulip.service';

@Module({
  imports: [],
  providers: [ZulipService],
  exports: [ZulipService],
})
export class ZulipModule {}
