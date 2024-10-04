import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { SubCategoryEntity } from './infrastructure/persistence/relational/entities/sub-categories.entity';
import { SubCategoryController } from './sub-category.controller';
import { SubCategoryService } from './sub-category.service';

@Module({
  imports: [
    // Import necessary TypeORM modules for SubCategoryEntity and CategoryEntity
    TypeOrmModule.forFeature([SubCategoryEntity]),
  ],
  controllers: [SubCategoryController],
  providers: [SubCategoryService, TenantConnectionService],
  exports: [SubCategoryService],
})
export class SubCategoryModule {}
