import { Module } from '@nestjs/common';

import { CalendarFeedService } from './calendar-feed.service';
import { CalendarFeedController } from './calendar-feed.controller';
import { GroupModule } from '../group/group.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [GroupModule, EventModule],
  controllers: [CalendarFeedController],
  providers: [CalendarFeedService],
  exports: [CalendarFeedService],
})
export class CalendarFeedModule {}
