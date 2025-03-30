import { Module } from '@nestjs/common';
import { RecurrenceService } from './recurrence.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [RecurrenceService],
  exports: [RecurrenceService],
})
export class RecurrenceModule {}