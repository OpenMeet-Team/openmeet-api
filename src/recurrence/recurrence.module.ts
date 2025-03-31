import { Module, forwardRef } from '@nestjs/common';
import { RecurrenceService } from './recurrence.service';
import { ConfigModule } from '@nestjs/config';
import { RecurrenceModificationService } from './services/recurrence-modification.service';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => EventModule), // Use forwardRef to prevent circular dependency
  ],
  providers: [RecurrenceService, RecurrenceModificationService],
  exports: [RecurrenceService, RecurrenceModificationService],
})
export class RecurrenceModule {}
