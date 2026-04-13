import { Module, forwardRef } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { ContrailModule } from '../contrail/contrail.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { UserModule } from '../user/user.module';
import { EventRoleModule } from '../event-role/event-role.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { PdsModule } from '../pds/pds.module';

@Module({
  imports: [
    ContrailModule,
    forwardRef(() => BlueskyModule),
    forwardRef(() => PdsModule),
    forwardRef(() => EventAttendeeModule),
    forwardRef(() => UserModule),
    EventRoleModule,
    forwardRef(() => GroupMemberModule),
  ],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
