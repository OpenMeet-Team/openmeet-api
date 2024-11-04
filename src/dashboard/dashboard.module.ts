import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { EventModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { GroupModule } from '../group/group.module';
import { GroupMemberModule } from 'src/group-member/group-member.module';
import { EventAttendeeModule } from 'src/event-attendee/event-attendee.module';

@Module({
  imports: [
    EventModule,
    GroupModule,
    TenantModule,
    GroupMemberModule,
    EventAttendeeModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
