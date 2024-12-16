import { Module } from '@nestjs/common';
import { BlueskyService } from './bluesky.service';
import { ConfigModule } from '@nestjs/config';
import { EventIngestionModule } from '../event-ingestion/event-ingestion.module';

@Module({
  imports: [ConfigModule, EventIngestionModule],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}
