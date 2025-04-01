import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventModule } from '../event/event.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { EventSeriesEntity } from './infrastructure/persistence/relational/entities/event-series.entity';
import { EventSeriesController } from './controllers/event-series.controller';
import { EventSeriesService } from './services/event-series.service';
import { EventSeriesRepository } from './interfaces/event-series-repository.interface';
import { EventSeriesTypeOrmRepository } from './infrastructure/persistence/relational/repositories/event-series.typeorm.repository';
import { EventSeriesOccurrenceService } from './services/event-series-occurrence.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventSeriesEntity]),
    forwardRef(() => EventModule),
    RecurrenceModule,
  ],
  controllers: [EventSeriesController],
  providers: [
    EventSeriesService,
    EventSeriesOccurrenceService,
    {
      provide: 'EventSeriesRepository',
      useClass: EventSeriesTypeOrmRepository,
    },
  ],
  exports: [EventSeriesService, EventSeriesOccurrenceService],
})
export class EventSeriesModule {}