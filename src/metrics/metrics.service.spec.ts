import { MetricsService } from './metrics.service';
import { Gauge } from 'prom-client';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';

// Helper to create a mock Gauge
function createMockGauge(): jest.Mocked<Gauge<string>> {
  return {
    set: jest.fn(),
    inc: jest.fn(),
    dec: jest.fn(),
    labels: jest.fn(),
    reset: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<Gauge<string>>;
}

describe('MetricsService', () => {
  let service: MetricsService;
  let usersGauge: jest.Mocked<Gauge<string>>;
  let eventsGauge: jest.Mocked<Gauge<string>>;
  let groupsGauge: jest.Mocked<Gauge<string>>;
  let eventAttendeesGauge: jest.Mocked<Gauge<string>>;
  let groupMembersGauge: jest.Mocked<Gauge<string>>;
  let activeUsers30dGauge: jest.Mocked<Gauge<string>>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockTenantConnection: jest.Mocked<DataSource>;

  beforeEach(() => {
    usersGauge = createMockGauge();
    eventsGauge = createMockGauge();
    groupsGauge = createMockGauge();
    eventAttendeesGauge = createMockGauge();
    groupMembersGauge = createMockGauge();
    activeUsers30dGauge = createMockGauge();

    mockDataSource = {
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    mockTenantConnection = {
      query: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    mockTenantConnectionService = {
      getAllTenants: jest.fn(),
      getTenantConnection: jest.fn(),
    } as unknown as jest.Mocked<TenantConnectionService>;

    service = new MetricsService(
      usersGauge,
      eventsGauge,
      groupsGauge,
      eventAttendeesGauge,
      groupMembersGauge,
      activeUsers30dGauge,
      mockDataSource,
      mockTenantConnectionService,
    );
  });

  describe('collectMetricsForTenant', () => {
    it('should make exactly 1 query call per tenant instead of 6', async () => {
      const tenantId = 'test-tenant';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 100,
          events: 50,
          groups: 25,
          event_attendees: 200,
          group_members: 75,
          active_users: 30,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      // Should make exactly 1 query per tenant, not 6
      expect(mockTenantConnection.query).toHaveBeenCalledTimes(1);
    });

    it('should use pg_class for approximate counts', async () => {
      const tenantId = 'test-tenant';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 100,
          events: 50,
          groups: 25,
          event_attendees: 200,
          group_members: 75,
          active_users: 30,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      const query = mockTenantConnection.query.mock.calls[0][0] as string;
      expect(query).toContain('pg_class');
      expect(query).toContain('reltuples');
    });

    it('should include COUNT(DISTINCT) for active users', async () => {
      const tenantId = 'test-tenant';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 100,
          events: 50,
          groups: 25,
          event_attendees: 200,
          group_members: 75,
          active_users: 30,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      const query = mockTenantConnection.query.mock.calls[0][0] as string;
      expect(query).toContain('COUNT(DISTINCT');
      expect(query).toContain('sessions');
      expect(query).toContain('30 days');
    });

    it('should set gauge values correctly with tenant labels', async () => {
      const tenantId = 'test-tenant';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 100,
          events: 50,
          groups: 25,
          event_attendees: 200,
          group_members: 75,
          active_users: 30,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      // Per-tenant gauges
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 100);
      expect(eventsGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 50);
      expect(groupsGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 25);
      expect(eventAttendeesGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        200,
      );
      expect(groupMembersGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        75,
      );
      expect(activeUsers30dGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        30,
      );

      // Aggregated 'all' gauges
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 100);
      expect(eventsGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 50);
      expect(groupsGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 25);
      expect(eventAttendeesGauge.set).toHaveBeenCalledWith(
        { tenant: 'all' },
        200,
      );
      expect(groupMembersGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 75);
      expect(activeUsers30dGauge.set).toHaveBeenCalledWith(
        { tenant: 'all' },
        30,
      );
    });

    it('should use schema prefix for non-empty tenant IDs', async () => {
      const tenantId = 'abc123';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 10,
          events: 5,
          groups: 2,
          event_attendees: 20,
          group_members: 7,
          active_users: 3,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      const query = mockTenantConnection.query.mock.calls[0][0] as string;
      expect(query).toContain(`"tenant_${tenantId}"`);
    });

    it('should not use schema prefix for empty tenant IDs', async () => {
      const tenantId = '';
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: 10,
          events: 5,
          groups: 2,
          event_attendees: 20,
          group_members: 7,
          active_users: 3,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      const query = mockTenantConnection.query.mock.calls[0][0] as string;
      // Should NOT contain tenant_ prefix for empty tenant ID
      expect(query).not.toContain('tenant_.');
      // But should still reference the tables
      expect(query).toContain('"users"');
      expect(query).toContain('"events"');
    });

    it('should handle errors gracefully without throwing', async () => {
      const tenantId = 'test-tenant';
      mockTenantConnection.query.mockRejectedValueOnce(
        new Error('DB connection failed'),
      );

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Should not throw
      await expect(service.updateMetrics()).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should aggregate totals across multiple tenants', async () => {
      const tenant1Connection = {
        query: jest.fn().mockResolvedValueOnce([
          {
            users: 100,
            events: 50,
            groups: 25,
            event_attendees: 200,
            group_members: 75,
            active_users: 30,
          },
        ]),
      } as unknown as jest.Mocked<DataSource>;

      const tenant2Connection = {
        query: jest.fn().mockResolvedValueOnce([
          {
            users: 50,
            events: 20,
            groups: 10,
            event_attendees: 80,
            group_members: 30,
            active_users: 15,
          },
        ]),
      } as unknown as jest.Mocked<DataSource>;

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: 'tenant1' } as any,
        { id: 'tenant2' } as any,
      ]);
      mockTenantConnectionService.getTenantConnection
        .mockResolvedValueOnce(tenant1Connection)
        .mockResolvedValueOnce(tenant2Connection);

      await service.updateMetrics();

      // Aggregated 'all' gauges should sum both tenants
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 150);
      expect(eventsGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 70);
      expect(groupsGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 35);
      expect(eventAttendeesGauge.set).toHaveBeenCalledWith(
        { tenant: 'all' },
        280,
      );
      expect(groupMembersGauge.set).toHaveBeenCalledWith(
        { tenant: 'all' },
        105,
      );
      expect(activeUsers30dGauge.set).toHaveBeenCalledWith(
        { tenant: 'all' },
        45,
      );
    });

    it('should treat negative reltuples values as 0', async () => {
      const tenantId = 'test-tenant';
      // pg_class.reltuples can return -1 for tables that have never been analyzed
      mockTenantConnection.query.mockResolvedValueOnce([
        {
          users: -1,
          events: -1,
          groups: 0,
          event_attendees: -1,
          group_members: 10,
          active_users: 5,
        },
      ]);

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: tenantId } as any,
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );

      await service.updateMetrics();

      // Negative reltuples should be treated as 0
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 0);
      expect(eventsGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 0);
      expect(groupsGauge.set).toHaveBeenCalledWith({ tenant: tenantId }, 0);
      expect(eventAttendeesGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        0,
      );
      expect(groupMembersGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        10,
      );
      expect(activeUsers30dGauge.set).toHaveBeenCalledWith(
        { tenant: tenantId },
        5,
      );
    });
  });
});
