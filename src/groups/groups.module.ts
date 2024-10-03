import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { CategoryEntity } from '../categories/infrastructure/persistence/relational/entities/categories.entity';
import { GroupController } from './groups.controller';
import { GroupService } from './groups.service';
import { CategoryService } from '../categories/categories.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GroupEntity, CategoryEntity]),
    EventsModule,
  ],
  controllers: [GroupController],
  providers: [GroupService, TenantConnectionService, CategoryService],
  exports: [GroupService],
})
export class GroupModule {}
