import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from 'src/tenant/tenant.module';
import { AuthGithubController } from './auth-github.controller';
import { AuthGithubService } from './auth-github.service';

@Module({
  imports: [ConfigModule, AuthModule, TenantModule],
  providers: [AuthGithubService],
  exports: [AuthGithubService],
  controllers: [AuthGithubController],
})
export class AuthGithubModule {}
