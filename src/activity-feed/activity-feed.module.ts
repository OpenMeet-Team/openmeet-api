import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityFeedEntity } from './infrastructure/persistence/relational/entities/activity-feed.entity';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFeedListener } from './activity-feed.listener';
import { ActivityFeedController } from './activity-feed.controller';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityFeedEntity]),
    TenantModule,
    forwardRef(() => UserModule),
    forwardRef(() => GroupModule),
  ],
  controllers: [ActivityFeedController],
  providers: [ActivityFeedService, ActivityFeedListener],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
