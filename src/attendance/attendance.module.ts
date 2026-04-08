import { Module, forwardRef } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { TenantModule } from '../tenant/tenant.module';
import { ContrailModule } from '../contrail/contrail.module';
import { AtprotoEnrichmentModule } from '../atproto-enrichment/atproto-enrichment.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { UserAtprotoIdentityModule } from '../user-atproto-identity/user-atproto-identity.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { UserModule } from '../user/user.module';
import { EventRoleModule } from '../event-role/event-role.module';

@Module({
  imports: [
    TenantModule,
    ContrailModule,
    AtprotoEnrichmentModule,
    forwardRef(() => BlueskyModule),
    UserAtprotoIdentityModule,
    forwardRef(() => EventAttendeeModule),
    forwardRef(() => UserModule),
    EventRoleModule,
  ],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
