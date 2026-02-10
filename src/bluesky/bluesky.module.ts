import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { BlueskyIdentityService } from './bluesky-identity.service';
import { BlueskyRsvpService } from './bluesky-rsvp.service';
import { AtprotoHandleCacheService } from './atproto-handle-cache.service';
import { AtprotoLexiconService } from './atproto-lexicon.service';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { EventModule } from '../event/event.module';
import { ConfigModule } from '@nestjs/config';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';
import { TenantModule } from '../tenant/tenant.module';
import { MetricsModule } from '../metrics/metrics.module';
import { UserAtprotoIdentityModule } from '../user-atproto-identity/user-atproto-identity.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => UserModule),
    ElastiCacheModule,
    ShadowAccountModule,
    TenantModule,
    MetricsModule,
    UserAtprotoIdentityModule,
    forwardRef(() => EventModule),
  ],
  controllers: [BlueskyController],
  providers: [
    BlueskyService,
    BlueskyIdService,
    BlueskyIdentityService,
    BlueskyRsvpService,
    AtprotoHandleCacheService,
    AtprotoLexiconService,
  ],
  exports: [
    BlueskyService,
    BlueskyIdService,
    BlueskyIdentityService,
    BlueskyRsvpService,
    AtprotoHandleCacheService,
    AtprotoLexiconService,
  ],
})
export class BlueskyModule {}
