import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../../../../tenant/tenant.module';
import { CategorySeedService } from './category-seed.service';
import { CategoryEntity } from '../../../../categories/infrastructure/persistence/relational/entities/categories.entity';
import { SubCategoryEntity } from '../../../../sub-categories/infrastructure/persistence/relational/entities/sub-categories.entity';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([CategoryEntity, SubCategoryEntity]),
  ],
  providers: [CategorySeedService],
  exports: [CategorySeedService],
})
export class CategorySeedModule {}
