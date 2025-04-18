import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { EventModule } from '../event/event.module';
import { ConfigModule } from '@nestjs/config';
import { ShadowAccountModule } from '../shadow-account/shadow-account.module';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    ElastiCacheModule,
    ShadowAccountModule,
    forwardRef(() => EventModule),
  ],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}
