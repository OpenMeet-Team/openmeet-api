import { Module } from '@nestjs/common';
import { AuthBlueskyService } from './auth-bluesky.service';
import { AuthBlueskyController } from './auth-bluesky.controller';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '../tenant/tenant.module';
import { JwtService } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { ElastiCacheModule } from '../elasticache/elasticache.module';

@Module({
  imports: [ConfigModule, TenantModule, AuthModule, ElastiCacheModule],
  controllers: [AuthBlueskyController],
  providers: [AuthBlueskyService, JwtService],
  exports: [AuthBlueskyService],
})
export class AuthBlueskyModule {}
