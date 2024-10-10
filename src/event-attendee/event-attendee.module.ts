import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeController } from './event-attendee.controller';
import { EventAttendeeService } from './event-attendee.service';


@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventAttendeesEntity
    ]),
  ],
  controllers: [EventAttendeeController],
  providers: [EventAttendeeService, TenantConnectionService],
  exports: [EventAttendeeService],
})
export class EventAttendeeModule {}
