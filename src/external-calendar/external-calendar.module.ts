import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ExternalCalendarService } from './external-calendar.service';
import { ExternalCalendarController } from './external-calendar.controller';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { CalendarSyncScheduler } from './calendar-sync-scheduler';
import { ExternalEventRepository } from './infrastructure/persistence/relational/repositories/external-event.repository';
import { CalendarSourceModule } from '../calendar-source/calendar-source.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [ScheduleModule.forRoot(), TenantModule, CalendarSourceModule],
  controllers: [ExternalCalendarController, AvailabilityController],
  providers: [
    ExternalCalendarService,
    AvailabilityService,
    CalendarSyncScheduler,
    ExternalEventRepository,
  ],
  exports: [
    ExternalCalendarService,
    AvailabilityService,
    CalendarSyncScheduler,
    ExternalEventRepository,
  ],
})
export class ExternalCalendarModule {}
