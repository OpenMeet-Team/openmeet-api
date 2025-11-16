import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseMetricsService } from './database-metrics.service';
import {
  makeGaugeProvider,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

// Define database metrics providers for Tier 1 & 2 observability
const databaseMetricsProviders = [
  // Tier 1: Saturation Metrics (Connection Pool)
  makeGaugeProvider({
    name: 'db_pool_size',
    help: 'Total database connection pool size per tenant',
    labelNames: ['tenant'],
  }),
  makeGaugeProvider({
    name: 'db_pool_idle',
    help: 'Number of idle connections in pool per tenant',
    labelNames: ['tenant'],
  }),
  makeGaugeProvider({
    name: 'db_pool_waiting',
    help: 'Number of clients waiting for a connection per tenant',
    labelNames: ['tenant'],
  }),
  makeGaugeProvider({
    name: 'db_active_connections',
    help: 'Number of active database connections per tenant',
    labelNames: ['tenant'],
  }),

  // Tier 2: Latency & Error Metrics
  makeHistogramProvider({
    name: 'db_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['tenant', 'operation', 'status'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
  }),
  makeCounterProvider({
    name: 'db_connection_errors_total',
    help: 'Total number of database connection errors',
    labelNames: ['tenant', 'error_type'],
  }),
  makeGaugeProvider({
    name: 'db_queries_per_second',
    help: 'Database queries per second',
    labelNames: ['tenant', 'operation'],
  }),
  makeHistogramProvider({
    name: 'db_connection_acquisition_duration_seconds',
    help: 'Time to acquire a database connection in seconds',
    labelNames: ['tenant'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  }),
];

@Module({
  imports: [ScheduleModule],
  providers: [DatabaseMetricsService, ...databaseMetricsProviders],
  exports: [DatabaseMetricsService, ...databaseMetricsProviders],
})
export class DatabaseMetricsModule {}
