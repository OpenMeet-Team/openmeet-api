import { Module, forwardRef } from '@nestjs/common';
import { EventModule } from '../event/event.module';
import { EventSeriesModule } from '../event-series/event-series.module';
import { TenantModule } from '../tenant/tenant.module';
import { CategoryModule } from '../category/category.module';
import { EventAttendeeModule } from '../event-attendee/event-attendee.module';
import { GroupMemberModule } from '../group-member/group-member.module';
import { FileModule } from '../file/file.module';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { ChatModule } from '../chat/chat.module';
import { EventManagementService } from '../event/services/event-management.service';
import { EventQueryService } from '../event/services/event-query.service';
import { EventOccurrenceService } from '../event/services/occurrences/event-occurrence.service';
import { EventSeriesService } from '../event-series/services/event-series.service';
import { RecurrencePatternService } from '../event-series/services/recurrence-pattern.service';
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';
import { UserService } from '../user/user.service';
import { mockUserService } from './mocks';
import { ConfigModule } from '@nestjs/config';

/**
 * Root test module that includes all modules and services for integration testing
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [],
    }),
    forwardRef(() => EventModule),
    forwardRef(() => EventSeriesModule),
    TenantModule,
    CategoryModule,
    forwardRef(() => EventAttendeeModule),
    forwardRef(() => GroupMemberModule),
    FileModule,
    UserModule,
    forwardRef(() => GroupModule),
    BlueskyModule,
    forwardRef(() => ChatModule),
  ],
  providers: [
    EventManagementService,
    EventQueryService,
    EventOccurrenceService,
    EventSeriesService,
    RecurrencePatternService,
    EventSeriesOccurrenceService,
    {
      provide: UserService,
      useValue: mockUserService,
    },
  ],
  exports: [
    EventManagementService,
    EventQueryService,
    EventOccurrenceService,
    EventSeriesService,
    RecurrencePatternService,
    EventSeriesOccurrenceService,
    UserService,
  ],
})
export class RootTestModule {}
