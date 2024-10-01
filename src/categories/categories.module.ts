import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventService } from '../events/events.service';
import { CategoryEntity } from './infrastructure/persistence/relational/entities/categories.entity';
import { CategoryController } from './categories.controller';
import { CategoryService } from './categories.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CategoryEntity]),
  ],
  controllers: [CategoryController],
  providers: [
    CategoryService, 
    TenantConnectionService, 
    EventService
  ],
  exports: [
    CategoryService 
  ],
})
export class CategoryModule {}
