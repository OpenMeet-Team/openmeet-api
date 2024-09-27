import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../../../../tenant/tenant.module';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';
import { InterestEntity } from '../../../../interests/infrastructure/persistence/relational/entities/interests.entity';
import { InterestSeedService } from './interest-seed.service';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([CategoryEntity, InterestEntity])],
  providers: [InterestSeedService],
  exports: [InterestSeedService],
})
export class InterestSeedModule {}
