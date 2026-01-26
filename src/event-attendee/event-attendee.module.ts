import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeService } from './event-attendee.service';
import { EventAttendeeQueryService } from './event-attendee-query.service';
import { EventRoleService } from '../event-role/event-role.service';
// ChatModule removed - Matrix Application Service handles room operations directly
import { BlueskyModule } from '../bluesky/bluesky.module';
import { UserModule } from '../user/user.module';
import { AtprotoPublisherModule } from '../atproto-publisher/atproto-publisher.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventAttendeesEntity]),
    // ChatModule removed - Matrix Application Service handles room operations directly
    forwardRef(() => BlueskyModule),
    forwardRef(() => UserModule),
    AtprotoPublisherModule,
  ],
  controllers: [],
  providers: [
    EventAttendeeService,
    EventAttendeeQueryService,
    TenantConnectionService,
    EventRoleService,
  ],
  exports: [EventAttendeeService, EventAttendeeQueryService],
})
export class EventAttendeeModule {}
