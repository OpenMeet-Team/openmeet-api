import { Module, OnModuleInit } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ScheduleModule } from '@nestjs/schedule';
import {
  PrometheusModule,
  makeGaugeProvider,
} from '@willsoto/nestjs-prometheus';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
    TenantModule,
  ],
  providers: [
    MetricsService,
    makeGaugeProvider({
      name: 'users_total',
      help: 'Total number of registered users',
      labelNames: ['tenant'],
    }),
    makeGaugeProvider({
      name: 'events_total',
      help: 'Total number of created events',
      labelNames: ['tenant'],
    }),
    makeGaugeProvider({
      name: 'groups_total',
      help: 'Total number of created groups',
      labelNames: ['tenant'],
    }),
    makeGaugeProvider({
      name: 'event_attendees_total',
      help: 'Total number of event attendees',
      labelNames: ['tenant'],
    }),
    makeGaugeProvider({
      name: 'group_members_total',
      help: 'Total number of group members',
      labelNames: ['tenant'],
    }),
    makeGaugeProvider({
      name: 'active_users_30d',
      help: 'Number of active users in the last 30 days',
      labelNames: ['tenant'],
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule implements OnModuleInit {
  constructor(private metricsService: MetricsService) {}

  async onModuleInit() {
    console.log('MetricsModule initialized - ensuring metrics are populated');
    // Force metrics update on module initialization
    try {
      await this.metricsService.updateMetrics();
    } catch (error) {
      console.error('Error initializing metrics:', error);
    }
  }
}
