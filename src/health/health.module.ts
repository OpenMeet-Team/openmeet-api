import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TerminusModule, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { MatrixModule } from '../matrix/matrix.module';

@Module({
  imports: [TerminusModule, HttpModule, MatrixModule],
  controllers: [HealthController],
  providers: [TypeOrmHealthIndicator],
})
export class HealthModule {}
