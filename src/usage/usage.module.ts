import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { ResourceType } from './entities/resource-type.entity';
import { UsageAggregate } from './entities/usage-aggregate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ResourceType, UsageAggregate, UsageAggregate]),
  ],
  providers: [UsageService],
  controllers: [UsageController],
  exports: [UsageService],
})
export class UsageModule {}
