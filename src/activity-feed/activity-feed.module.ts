import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFeedListener } from './activity-feed.listener';
import {
  SitewideActivityFeedController,
  GroupActivityFeedController,
  EventActivityFeedController,
} from './activity-feed.controller';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { TenantModule } from '../tenant/tenant.module';
import { EventModule } from '../event/event.module';
import { BlueskyModule } from '../bluesky/bluesky.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityFeedEntity]),
    TenantModule,
    BlueskyModule,
    forwardRef(() => UserModule),
    forwardRef(() => GroupModule),
    forwardRef(() => EventModule),
  ],
  controllers: [
    SitewideActivityFeedController,
    GroupActivityFeedController,
    EventActivityFeedController,
  ],
  providers: [ActivityFeedService, ActivityFeedListener],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
