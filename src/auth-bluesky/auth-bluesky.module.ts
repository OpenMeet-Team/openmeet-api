import { Module, forwardRef } from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { AuthBlueskyController } from './auth-bluesky.controller';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';
import { BlueskyModule } from '../bluesky/bluesky.module';
import { UserModule } from '../user/user.module';
import { EventSeriesModule } from '../event-series/event-series.module';

@Module({
  imports: [
    ConfigModule,
    TenantModule,
    forwardRef(() => AuthModule),
    ElastiCacheModule,
    forwardRef(() => BlueskyModule),
    UserModule,
    EventSeriesModule,
  ],
  controllers: [AuthBlueskyController],
  providers: [AuthBlueskyService],
  exports: [AuthBlueskyService],
})
export class AuthBlueskyModule {}
