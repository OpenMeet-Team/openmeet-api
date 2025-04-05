import { Module, forwardRef } from '@nestjs/common';
import { BlueskyController } from './bluesky.controller';
import { BlueskyService } from './bluesky.service';
import { UserModule } from '../user/user.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { EventModule } from '../event/event.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    UserModule,
    ElastiCacheModule,
    forwardRef(() => EventModule),
  ],
  controllers: [BlueskyController],
  providers: [BlueskyService],
  exports: [BlueskyService],
})
export class BlueskyModule {}
