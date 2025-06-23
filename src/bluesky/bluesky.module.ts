import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { BlueskyRsvpService } from './bluesky-rsvp.service';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { EventModule } from '../event/event.module';
import { ConfigModule } from '@nestjs/config';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';
import { TenantModule } from '../tenant/tenant.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UserModule),
    ElastiCacheModule,
    ShadowAccountModule,
    TenantModule,
    MetricsModule,
    forwardRef(() => EventModule),
  ],
  controllers: [BlueskyController],
  providers: [BlueskyService, BlueskyIdService, BlueskyRsvpService],
  exports: [BlueskyService, BlueskyIdService, BlueskyRsvpService],
})
export class BlueskyModule {}
