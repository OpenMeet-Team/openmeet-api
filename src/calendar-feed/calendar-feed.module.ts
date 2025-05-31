import { Module } from '@nestjs/common';

import { CalendarFeedService } from './calendar-feed.service';
import { CalendarFeedController } from './calendar-feed.controller';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [UserModule, GroupModule, EventModule],
  controllers: [CalendarFeedController],
  providers: [CalendarFeedService],
  exports: [CalendarFeedService],
})
export class CalendarFeedModule {}
