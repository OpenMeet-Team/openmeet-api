import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { BlueskyIdService } from './bluesky-id.service';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { EventModule } from '../event/event.module';
import { ConfigModule } from '@nestjs/config';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    ElastiCacheModule,
    ShadowAccountModule,
    TenantModule,
    forwardRef(() => EventModule),
  ],
  controllers: [BlueskyController],
  providers: [BlueskyService, BlueskyIdService],
  exports: [BlueskyService, BlueskyIdService],
})
export class BlueskyModule {}
