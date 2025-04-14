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
    console.log('MetricsService onModuleInit called - initializing metrics...');
    // Initialize metrics on startup
    await this.updateMetrics();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  public async updateMetrics() {
    console.log('Updating business metrics for all tenants...');
    try {
      // Get all tenant IDs
      const allTenants = await this.tenantConnectionService.getAllTenants();
      console.log(`Found ${allTenants.length} tenants to collect metrics from`);
      
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
        console.log(`Updating metrics for tenant: ${tenantId}`);
        // Get the connection for this tenant
        const connection = await this.tenantConnectionService.getTenantConnection(tenantId);
        
        const tenantMetrics = await this.collectMetricsForTenant(tenantId, connection);
        
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
      
      console.log(`Aggregated metrics - Users: ${totalUsers}, Active Users: ${totalActiveUsers}, Events: ${totalEvents}, Groups: ${totalGroups}, Attendees: ${totalEventAttendees}, Members: ${totalGroupMembers}`);
      
      console.log('Business metrics updated successfully for all tenants');
    } catch (error) {
      console.error('Error updating metrics', error);
    }
  }

  private async collectMetricsForTenant(tenantId: string, connection: DataSource) {
    const metrics = {
      users: 0,
      activeUsers: 0,
      events: 0,
      groups: 0,
      eventAttendees: 0,
      groupMembers: 0
    };
    
    try {
      // Get schema name for the tenant
      const schemaPrefix = tenantId && tenantId !== '' ? `tenant_${tenantId}.` : '';
      
      // Users
      const userCount = await connection.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}"users"`);
      metrics.users = parseInt(userCount[0].count, 10);
      this.usersGauge.set({ tenant: tenantId }, metrics.users);
      console.log(`Setting users_total metric for tenant ${tenantId} to ${metrics.users}`);
      
      // Active users
      const activeUserQuery = `
        SELECT COUNT(DISTINCT "userId") as count 
        FROM ${schemaPrefix}"sessions" 
        WHERE "createdAt" > NOW() - INTERVAL '30 days'
      `;
      const activeUserCount = await connection.query(activeUserQuery);
      metrics.activeUsers = parseInt(activeUserCount[0].count, 10);
      this.activeUsers30dGauge.set({ tenant: tenantId }, metrics.activeUsers);
      console.log(`Setting active_users_30d metric for tenant ${tenantId} to ${metrics.activeUsers}`);
      
      // Events
      const eventCount = await connection.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}"events"`);
      metrics.events = parseInt(eventCount[0].count, 10);
      this.eventsGauge.set({ tenant: tenantId }, metrics.events);
      console.log(`Setting events_total metric for tenant ${tenantId} to ${metrics.events}`);
      
      // Groups
      const groupCount = await connection.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}"groups"`);
      metrics.groups = parseInt(groupCount[0].count, 10);
      this.groupsGauge.set({ tenant: tenantId }, metrics.groups);
      console.log(`Setting groups_total metric for tenant ${tenantId} to ${metrics.groups}`);
      
      // Event attendees
      const attendeeCount = await connection.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}"eventAttendees"`);
      metrics.eventAttendees = parseInt(attendeeCount[0].count, 10);
      this.eventAttendeesGauge.set({ tenant: tenantId }, metrics.eventAttendees);
      console.log(`Setting event_attendees_total metric for tenant ${tenantId} to ${metrics.eventAttendees}`);
      
      // Group members
      const memberCount = await connection.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}"groupMembers"`);
      metrics.groupMembers = parseInt(memberCount[0].count, 10);
      this.groupMembersGauge.set({ tenant: tenantId }, metrics.groupMembers);
      console.log(`Setting group_members_total metric for tenant ${tenantId} to ${metrics.groupMembers}`);
    } catch (error) {
      console.error(`Error collecting metrics for tenant ${tenantId}`, error);
    }
    
    return metrics;
  }

  // Remove these individual methods as they're replaced by the collectMetricsForTenant method
  private async updateUserCountsForTenant(tenantId: string, connection: DataSource) {
    // Deprecated
  }

  private async updateEventCountsForTenant(tenantId: string, connection: DataSource) {
    // Deprecated
  }

  private async updateGroupCountsForTenant(tenantId: string, connection: DataSource) {
    // Deprecated
  }

  private async updateAttendeeAndMemberCountsForTenant(tenantId: string, connection: DataSource) {
    // Deprecated
  }
}
