import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFeedListener } from './activity-feed.listener';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityFeedEntity]),
    forwardRef(() => UserModule),
    forwardRef(() => GroupModule),
  ],
  providers: [ActivityFeedService, ActivityFeedListener],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
