import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantConnectionService } from '../tenant/tenant.service';

/**
 * Advisory-lock key for the tenant metrics rollup. Any stable bigint works;
 * it only has to be unique among the advisory locks taken on this database.
 */
const METRICS_ROLLUP_LOCK_KEY = 2094601703;

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    @InjectMetric('users_total')
    private readonly usersGauge: Gauge<string>,
    @InjectMetric('events_total')
    private readonly eventsGauge: Gauge<string>,
    @InjectMetric('groups_total')
    private readonly groupsGauge: Gauge<string>,
    @InjectMetric('event_attendees_total')
    private readonly eventAttendeesGauge: Gauge<string>,
    @InjectMetric('group_members_total')
    private readonly groupMembersGauge: Gauge<string>,
    @InjectMetric('active_users_30d')
    private readonly activeUsers30dGauge: Gauge<string>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  async onModuleInit() {
    // Initialize metrics on startup
    await this.updateMetrics();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  public async updateMetrics() {
    await this.withRollupLock(() => this.collectAllTenantMetrics());
  }

  /**
   * Runs `work` on at most one replica at a time, guarded by a postgres
   * advisory lock. Losing the race is the normal steady state for every
   * replica but one, so it is logged at debug level and is not an error.
   *
   * Advisory locks are SESSION scoped, and `dataSource.query()` borrows an
   * arbitrary connection from the pool -- if the lock and the unlock land on
   * different backends the lock leaks until the holding connection is closed
   * and the rollup stops for good. Both statements are therefore issued on one
   * pinned QueryRunner, the unlock runs in a `finally` so a throwing body
   * cannot strand it, and the runner is only released after the unlock.
   */
  private async withRollupLock(work: () => Promise<void>): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    try {
      await runner.connect();

      const [{ locked }] = await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [METRICS_ROLLUP_LOCK_KEY],
      );

      if (!locked) {
        this.logger.debug(
          'Metrics rollup is already running on another replica; skipping',
        );
        return;
      }

      try {
        await work();
      } finally {
        await runner.query('SELECT pg_advisory_unlock($1)', [
          METRICS_ROLLUP_LOCK_KEY,
        ]);
      }
    } finally {
      await runner.release();
    }
  }

  private async collectAllTenantMetrics() {
    try {
      // Get all tenant IDs
      const allTenants = await (
        this.tenantConnectionService as any
      ).getAllTenants();

      // Track totals across all tenants
      let totalUsers = 0;
      let totalActiveUsers = 0;
      let totalEvents = 0;
      let totalGroups = 0;
      let totalEventAttendees = 0;
      let totalGroupMembers = 0;

      // Update metrics for each tenant connection
      for (const tenant of allTenants) {
        const tenantId = tenant.id;
        // Skip the public schema tenant - it contains no data
        if (!tenantId) continue;
        // Get the connection for this tenant
        const connection =
          await this.tenantConnectionService.getTenantConnection(tenantId);

        const tenantMetrics = await this.collectMetricsForTenant(
          tenantId,
          connection,
        );

        // Add to totals
        totalUsers += tenantMetrics.users;
        totalActiveUsers += tenantMetrics.activeUsers;
        totalEvents += tenantMetrics.events;
        totalGroups += tenantMetrics.groups;
        totalEventAttendees += tenantMetrics.eventAttendees;
        totalGroupMembers += tenantMetrics.groupMembers;
      }

      // Set aggregated metrics with 'all' as tenant ID
      this.usersGauge.set({ tenant: 'all' }, totalUsers);
      this.activeUsers30dGauge.set({ tenant: 'all' }, totalActiveUsers);
      this.eventsGauge.set({ tenant: 'all' }, totalEvents);
      this.groupsGauge.set({ tenant: 'all' }, totalGroups);
      this.eventAttendeesGauge.set({ tenant: 'all' }, totalEventAttendees);
      this.groupMembersGauge.set({ tenant: 'all' }, totalGroupMembers);
    } catch (error) {
      console.error('Error updating metrics', error);
    }
  }

  private async collectMetricsForTenant(
    tenantId: string,
    connection: DataSource,
  ) {
    const metrics = {
      users: 0,
      activeUsers: 0,
      events: 0,
      groups: 0,
      eventAttendees: 0,
      groupMembers: 0,
    };

    try {
      // Build regclass references with schema prefix for tenant tables
      // For non-empty tenantId, tables are in schema tenant_<tenantId>
      // For empty tenantId, tables are in the public schema
      const schemaPrefix =
        tenantId && tenantId !== '' ? `"tenant_${tenantId}".` : '';

      const query = `
        SELECT
          (SELECT COUNT(*) FROM ${schemaPrefix}"users") as users,
          (SELECT COUNT(*) FROM ${schemaPrefix}"events") as events,
          (SELECT COUNT(*) FROM ${schemaPrefix}"groups") as groups,
          (SELECT COUNT(*) FROM ${schemaPrefix}"eventAttendees") as event_attendees,
          (SELECT COUNT(*) FROM ${schemaPrefix}"groupMembers") as group_members,
          (SELECT COUNT(DISTINCT "userId")
           FROM ${schemaPrefix}"sessions"
           WHERE "updatedAt" > NOW() - INTERVAL '30 days') as active_users
      `;

      const result = await connection.query(query);
      const row = result[0];

      metrics.users = parseInt(row.users, 10) || 0;
      metrics.events = parseInt(row.events, 10) || 0;
      metrics.groups = parseInt(row.groups, 10) || 0;
      metrics.eventAttendees = parseInt(row.event_attendees, 10) || 0;
      metrics.groupMembers = parseInt(row.group_members, 10) || 0;
      metrics.activeUsers = parseInt(row.active_users, 10) || 0;

      // Set per-tenant gauge values
      this.usersGauge.set({ tenant: tenantId }, metrics.users);
      this.eventsGauge.set({ tenant: tenantId }, metrics.events);
      this.groupsGauge.set({ tenant: tenantId }, metrics.groups);
      this.eventAttendeesGauge.set(
        { tenant: tenantId },
        metrics.eventAttendees,
      );
      this.groupMembersGauge.set({ tenant: tenantId }, metrics.groupMembers);
      this.activeUsers30dGauge.set({ tenant: tenantId }, metrics.activeUsers);
    } catch (error) {
      console.error(`Error collecting metrics for tenant ${tenantId}`, error);
    }

    return metrics;
  }
}
