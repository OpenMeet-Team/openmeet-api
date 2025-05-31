import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalendarSourceService } from './calendar-source.service';
import { CalendarSourceController } from './calendar-source.controller';
import { CalendarSourceEntity } from './infrastructure/persistence/relational/entities/calendar-source.entity';
import { CalendarSourceRelationalRepository } from './infrastructure/persistence/relational/repositories/calendar-source.repository';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarSourceEntity]),
    UserModule,
    TenantModule,
  ],
  controllers: [CalendarSourceController],
  providers: [
    CalendarSourceService,
    {
      provide: 'CALENDAR_SOURCE_REPOSITORY',
      useClass: CalendarSourceRelationalRepository,
    },
  ],
  exports: [CalendarSourceService],
})
export class CalendarSourceModule {}
