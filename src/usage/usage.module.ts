import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { ResourceType } from './entities/resource-type.entity';
import { UsageAggregate } from './entities/usage-aggregate.entity';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceType, UsageAggregate]),
    TenantModule,
  ],
  providers: [UsageService],
  controllers: [UsageController],
  exports: [UsageService],
})
export class UsageModule {}
