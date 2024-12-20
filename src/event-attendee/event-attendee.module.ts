import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeService } from './event-attendee.service';
import { EventRoleService } from '../event-role/event-role.service';
import { JsonLogger } from '../logger/json.logger';
@Module({
  imports: [TypeOrmModule.forFeature([EventAttendeesEntity])],
  controllers: [],
  providers: [
    EventAttendeeService,
    TenantConnectionService,
    EventRoleService,
    {
      provide: 'Logger',
      useClass: JsonLogger,
    },
  ],
  exports: [EventAttendeeService],
})
export class EventAttendeeModule {}
