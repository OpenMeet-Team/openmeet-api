import { Module } from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {} 