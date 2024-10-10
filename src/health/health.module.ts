import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
  providers: [TypeOrmHealthIndicator],
})
export class HealthModule {}
