import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeService } from './event-attendee.service';
import { EventRoleService } from '../event-role/event-role.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventAttendeesEntity]),
    forwardRef(() => ChatModule),
  ],
  controllers: [],
  providers: [EventAttendeeService, TenantConnectionService, EventRoleService],
  exports: [EventAttendeeService],
})
export class EventAttendeeModule {}
