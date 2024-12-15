import { Module } from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { BlueskyController } from './bluesky.controller';

@Module({
  imports: [],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}
