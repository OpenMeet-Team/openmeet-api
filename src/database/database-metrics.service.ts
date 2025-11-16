import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge, Histogram, Counter } from 'prom-client';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getConnectionCache } from './data-source';

// Global registry for accessing metrics service from non-NestJS code
let metricsServiceInstance: DatabaseMetricsService | null = null;

export function getMetricsService(): DatabaseMetricsService | null {
  return metricsServiceInstance;
}

/**
 * DatabaseMetricsService
 *
 * Provides comprehensive database connection pool and query performance metrics
 * for Tier 1 & 2 observability following OpenMeet's tenant-based metrics patterns.
 *
 * Tier 1 Metrics (Saturation):
 * - db_pool_size: Total pool size per tenant
 * - db_pool_idle: Idle connections per tenant
 * - db_pool_waiting: Connections waiting for pool per tenant
 * - db_active_connections: Active connections per tenant (total - idle)
 *
 * Tier 2 Metrics (Latency & Errors):
 * - db_query_duration_seconds: Query duration histogram (p50/p95/p99)
 * - db_connection_errors_total: Connection error counter
 * - db_queries_per_second: Current QPS gauge
 */
@Injectable()
export class DatabaseMetricsService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMetricsService.name);

  onModuleInit() {
    // Register this instance globally so data-source.ts can access it
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    metricsServiceInstance = this;
    this.logger.log('DatabaseMetricsService registered globally');
  }

  // Track query counts for QPS calculation
  private queryCountMap = new Map<string, number>();
  private lastQpsUpdate = Date.now();

  constructor(
    @InjectMetric('db_pool_size')
    private readonly poolSizeGauge: Gauge<string>,
    @InjectMetric('db_pool_idle')
    private readonly poolIdleGauge: Gauge<string>,
    @InjectMetric('db_pool_waiting')
    private readonly poolWaitingGauge: Gauge<string>,
    @InjectMetric('db_active_connections')
    private readonly activeConnectionsGauge: Gauge<string>,
    @InjectMetric('db_query_duration_seconds')
    private readonly queryDurationHistogram: Histogram<string>,
    @InjectMetric('db_connection_errors_total')
    private readonly connectionErrorsCounter: Counter<string>,
    @InjectMetric('db_queries_per_second')
    private readonly queriesPerSecondGauge: Gauge<string>,
    @InjectMetric('db_connection_acquisition_duration_seconds')
    private readonly connectionAcquisitionHistogram: Histogram<string>,
  ) {}

  /**
   * Periodically collect pool metrics from all cached connections
   * Runs every 30 seconds to match scrape interval
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  collectPoolMetrics() {
    try {
      const connectionCache = getConnectionCache();

      // Track aggregates across all tenants (following pattern from metrics.service.ts:42-48)
      let totalPoolSize = 0;
      let totalIdle = 0;
      let totalWaiting = 0;
      let totalActive = 0;

      for (const [, { connection, tenantId }] of connectionCache.entries()) {
        const poolMetrics = this.getPoolMetrics(connection);
        if (!poolMetrics) continue;

        const { totalCount, idleCount, waitingCount, activeCount } =
          poolMetrics;

        // Set per-tenant metrics (following pattern from metrics.service.ts:106)
        this.poolSizeGauge.set({ tenant: tenantId }, totalCount);
        this.poolIdleGauge.set({ tenant: tenantId }, idleCount);
        this.poolWaitingGauge.set({ tenant: tenantId }, waitingCount);
        this.activeConnectionsGauge.set({ tenant: tenantId }, activeCount);

        // Accumulate for aggregates
        totalPoolSize += totalCount;
        totalIdle += idleCount;
        totalWaiting += waitingCount;
        totalActive += activeCount;

        // Warn if pool is saturated
        if (waitingCount > 0) {
          this.logger.warn(
            `Pool saturation detected for tenant ${tenantId}: ${waitingCount} connections waiting`,
          );
        }
      }

      // Set aggregated metrics with 'all' as tenant ID (following pattern from metrics.service.ts:72)
      this.poolSizeGauge.set({ tenant: 'all' }, totalPoolSize);
      this.poolIdleGauge.set({ tenant: 'all' }, totalIdle);
      this.poolWaitingGauge.set({ tenant: 'all' }, totalWaiting);
      this.activeConnectionsGauge.set({ tenant: 'all' }, totalActive);
    } catch (error) {
      this.logger.error('Error collecting pool metrics:', error);
    }
  }

  /**
   * Update QPS metrics based on query counts
   * Called every 30 seconds to align with pool metrics collection
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  updateQpsMetrics() {
    try {
      const now = Date.now();
      const elapsedSeconds = (now - this.lastQpsUpdate) / 1000;

      if (elapsedSeconds === 0) return;

      // Track aggregate QPS
      let totalQps = 0;

      // Calculate QPS for each tenant/operation combination
      for (const [key, count] of this.queryCountMap.entries()) {
        const [tenantId, operation] = key.split(':');
        const qps = count / elapsedSeconds;

        this.queriesPerSecondGauge.set({ tenant: tenantId, operation }, qps);

        totalQps += qps;
      }

      // Set aggregate QPS
      this.queriesPerSecondGauge.set(
        { tenant: 'all', operation: 'all' },
        totalQps,
      );

      // Reset counters
      this.queryCountMap.clear();
      this.lastQpsUpdate = now;
    } catch (error) {
      this.logger.error('Error updating QPS metrics:', error);
    }
  }

  /**
   * Record query duration for performance tracking
   * Following pattern from rsvp-integration.service.ts:55-59
   */
  recordQueryDuration(
    tenantId: string,
    operation: string,
    durationMs: number,
  ): void {
    try {
      const durationSeconds = durationMs / 1000;

      this.queryDurationHistogram.observe(
        { tenant: tenantId, operation },
        durationSeconds,
      );

      // Track query count for QPS calculation
      const key = `${tenantId}:${operation}`;
      this.queryCountMap.set(key, (this.queryCountMap.get(key) || 0) + 1);

      // Warn on slow queries (> 1 second)
      if (durationMs > 1000) {
        this.logger.warn(
          `Slow query detected for tenant ${tenantId} (${operation}): ${durationMs}ms`,
        );
      }
    } catch (error) {
      this.logger.error('Error recording query duration:', error);
    }
  }

  /**
   * Record connection error for error tracking
   */
  recordConnectionError(tenantId: string, errorType: string): void {
    try {
      this.connectionErrorsCounter.inc({
        tenant: tenantId,
        error_type: errorType,
      });

      this.logger.error(
        `Connection error for tenant ${tenantId}: ${errorType}`,
      );
    } catch (error) {
      this.logger.error('Error recording connection error:', error);
    }
  }

  /**
   * Record connection acquisition time
   */
  recordConnectionAcquisition(tenantId: string, durationMs: number): void {
    try {
      const durationSeconds = durationMs / 1000;

      this.connectionAcquisitionHistogram.observe(
        { tenant: tenantId },
        durationSeconds,
      );

      // Warn if connection acquisition is slow (> 100ms)
      if (durationMs > 100) {
        this.logger.warn(
          `Slow connection acquisition for tenant ${tenantId}: ${durationMs}ms`,
        );
      }
    } catch (error) {
      this.logger.error('Error recording connection acquisition:', error);
    }
  }

  /**
   * Extract pool metrics from a TypeORM DataSource
   * Returns null if pool is not accessible
   */
  private getPoolMetrics(dataSource: DataSource): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    activeCount: number;
  } | null {
    try {
      if (!dataSource?.isInitialized || !dataSource.driver) {
        return null;
      }

      // Access the underlying PostgreSQL pool from TypeORM driver
      // TypeORM uses node-postgres (pg) under the hood
      const pool = (dataSource.driver as any).master;

      if (!pool) {
        return null;
      }

      // Pool properties from node-postgres Pool class
      const totalCount = pool.totalCount || 0;
      const idleCount = pool.idleCount || 0;
      const waitingCount = pool.waitingCount || 0;
      const activeCount = totalCount - idleCount;

      return { totalCount, idleCount, waitingCount, activeCount };
    } catch (error) {
      this.logger.error('Error accessing pool metrics:', error);
      return null;
    }
  }
}
