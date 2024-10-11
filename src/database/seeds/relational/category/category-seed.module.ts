import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '../../../../tenant/tenant.module';
import { CategorySeedService } from './category-seed.service';
import { CategoryEntity } from '../../../../category/infrastructure/persistence/relational/entities/categories.entity';
import { SubCategoryEntity } from '../../../../sub-category/infrastructure/persistence/relational/entities/sub-category.entity';

@Module({
  imports: [
    TenantModule,
    TypeOrmModule.forFeature([CategoryEntity, SubCategoryEntity]),
  ],
  providers: [CategorySeedService],
  exports: [CategorySeedService],
})
export class CategorySeedModule {}
