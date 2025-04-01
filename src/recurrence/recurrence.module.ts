import { Module, forwardRef } from '@nestjs/common';
import { RecurrenceService } from './recurrence.service';
import { ConfigModule } from '@nestjs/config';
import { RecurrenceModificationService } from './services/recurrence-modification.service';
import { EventOccurrenceService } from './services/event-occurrence.service';
import { RecurrenceController } from './controllers/recurrence.controller';
import { EventModule } from '../event/event.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => EventModule), // Use forwardRef to prevent circular dependency
  ],
  controllers: [RecurrenceController],
  providers: [
    RecurrenceService,
    RecurrenceModificationService,
    EventOccurrenceService,
  ],
  exports: [
    RecurrenceService,
    RecurrenceModificationService,
    EventOccurrenceService,
  ],
})
export class RecurrenceModule {}
