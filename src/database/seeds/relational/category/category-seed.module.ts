import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../../../../tenant/tenant.module';
import { CategorySeedService } from './category-seed.service';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';

@Module({
  imports: [TenantModule, TypeOrmModule.forFeature([CategoryEntity])],
  providers: [CategorySeedService],
  exports: [CategorySeedService],
})
export class CategorySeedModule {}
