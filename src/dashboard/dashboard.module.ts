import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { EventsModule } from '../event/event.module';
import { TenantModule } from '../tenant/tenant.module';
import { GroupModule } from '../group/group.module';
import { CategoryModule } from '../category/category.module';
@Module({
  imports: [EventsModule, GroupModule, TenantModule, CategoryModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
