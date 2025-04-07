import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventModule } from '../event/event.module';
import { EventSeriesEntity } from './infrastructure/persistence/relational/entities/event-series.entity';
import { EventSeriesController } from './controllers/event-series.controller';
import { EventSeriesService } from './services/event-series.service';
import { EVENT_SERIES_REPOSITORY } from './interfaces/event-series-repository.interface';
import { EventSeriesTypeOrmRepository } from './infrastructure/persistence/relational/repositories/event-series.typeorm.repository';
import { EventSeriesOccurrenceService } from './services/event-series-occurrence.service';
import { RecurrencePatternService } from './services/recurrence-pattern.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventSeriesEntity, EventEntity]),
    forwardRef(() => EventModule),
    TenantModule,
    UserModule,
  ],
  controllers: [EventSeriesController],
  providers: [
    EventSeriesService,
    EventSeriesOccurrenceService,
    RecurrencePatternService,
    {
      provide: EVENT_SERIES_REPOSITORY,
      useClass: EventSeriesTypeOrmRepository,
    },
  ],
  exports: [
    EventSeriesService,
    EventSeriesOccurrenceService,
    RecurrencePatternService,
    EVENT_SERIES_REPOSITORY,
  ],
})
export class EventSeriesModule {}
