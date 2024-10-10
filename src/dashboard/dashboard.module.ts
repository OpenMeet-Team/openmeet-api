import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { EventsModule } from '../events/events.module';
import { TenantModule } from '../tenant/tenant.module';
import { GroupModule } from '../groups/groups.module';
import { CategoryModule } from '../categories/categories.module';
@Module({
  imports: [EventsModule, GroupModule, TenantModule, CategoryModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
