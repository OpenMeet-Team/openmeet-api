import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from 'src/tenant/tenant.module';
import { AuthBlueskyController } from './auth-bluesky.controller';
import { AuthBlueskyService } from './auth-bluesky.service';

@Module({
  imports: [ConfigModule, AuthModule, TenantModule],
  providers: [AuthBlueskyService],
  exports: [AuthBlueskyService],
  controllers: [AuthBlueskyController],
})
export class AuthBlueskyModule {} 