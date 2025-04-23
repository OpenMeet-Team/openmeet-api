import { Module, OnModuleInit } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ScheduleModule } from '@nestjs/schedule';
import {
  PrometheusModule,
  makeGaugeProvider,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { TenantModule } from '../tenant/tenant.module';

// Define HTTP metrics providers for export and reuse
const httpMetricsProviders = [
  makeCounterProvider({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'path'],
  }),
  makeHistogramProvider({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'path'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
  }),
  makeCounterProvider({
    name: 'http_request_errors_total',
    help: 'Total number of HTTP request errors',
    labelNames: ['method', 'path', 'status', 'error'],
  }),
  makeCounterProvider({
    name: 'unhandled_exceptions_total',
    help: 'Total number of unhandled exceptions',
    labelNames: ['method', 'path', 'status', 'error'],
  }),
];

// Define business metrics providers
const businessMetricsProviders = [
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
];

// Define event integration metrics for tracking deduplication
const eventIntegrationMetrics = [
  makeCounterProvider({
    name: 'event_integration_processed_total',
    help: 'Total number of external events processed',
    labelNames: ['tenant', 'source_type', 'operation'],
  }),
  makeCounterProvider({
    name: 'event_integration_deduplication_matches_total',
    help: 'Total number of deduplication matches by method',
    labelNames: ['tenant', 'source_type', 'method'], // method: primary, secondary, tertiary
  }),
  makeCounterProvider({
    name: 'event_integration_deduplication_failures_total',
    help: 'Total number of deduplication failures',
    labelNames: ['tenant', 'source_type', 'error'],
  }),
  makeHistogramProvider({
    name: 'event_integration_processing_duration_seconds',
    help: 'Duration of event integration processing in seconds',
    labelNames: ['tenant', 'source_type', 'operation', 'is_duplicate'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
  }),
];

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
    ...businessMetricsProviders,
    ...httpMetricsProviders,
    ...eventIntegrationMetrics,
  ],
  exports: [
    MetricsService,
    // Export HTTP metrics for use in interceptors/filters
    ...httpMetricsProviders,
    // Export event integration metrics for use in EventIntegrationService
    ...eventIntegrationMetrics,
  ],
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
