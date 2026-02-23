import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge } from 'prom-client';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantConnectionService } from '../tenant/tenant.service';

@Injectable()
export class MetricsService implements OnModuleInit {
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

      // Use pg_class.reltuples for approximate row counts (essentially free,
      // updated by ANALYZE/VACUUM) instead of expensive COUNT(*) full table scans.
      // Only active_users needs a real COUNT since it has a WHERE clause.
      const query = `
        SELECT
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = '${schemaPrefix}"users"'::regclass) as users,
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = '${schemaPrefix}"events"'::regclass) as events,
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = '${schemaPrefix}"groups"'::regclass) as groups,
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = '${schemaPrefix}"eventAttendees"'::regclass) as event_attendees,
          (SELECT reltuples::bigint FROM pg_class
           WHERE oid = '${schemaPrefix}"groupMembers"'::regclass) as group_members,
          (SELECT COUNT(DISTINCT "userId")
           FROM ${schemaPrefix}"sessions"
           WHERE "updatedAt" > NOW() - INTERVAL '30 days') as active_users
      `;

      const result = await connection.query(query);
      const row = result[0];

      // pg_class.reltuples can return -1 for tables never analyzed; treat as 0
      metrics.users = Math.max(0, parseInt(row.users, 10) || 0);
      metrics.events = Math.max(0, parseInt(row.events, 10) || 0);
      metrics.groups = Math.max(0, parseInt(row.groups, 10) || 0);
      metrics.eventAttendees = Math.max(
        0,
        parseInt(row.event_attendees, 10) || 0,
      );
      metrics.groupMembers = Math.max(0, parseInt(row.group_members, 10) || 0);
      metrics.activeUsers = Math.max(0, parseInt(row.active_users, 10) || 0);

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
