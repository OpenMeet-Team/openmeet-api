import { MetricsService } from './metrics.service';
import { Gauge } from 'prom-client';
import { DataSource } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { TenantConfig } from '../core/constants/constant';
import { Logger } from '@nestjs/common';

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

type MockQueryRunner = {
  connect: jest.Mock;
  query: jest.Mock;
  release: jest.Mock;
};

// Helper to create a mock QueryRunner that answers the advisory-lock probe.
function createMockQueryRunner(locked = true): MockQueryRunner {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('pg_try_advisory_lock')
          ? [{ locked }]
          : [{ pg_advisory_unlock: true }],
      ),
    ),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

// TenantConfig carries a lot of required fields; the rollup only reads `id`.
const rollupTenants = [{ id: 'test-tenant' }] as unknown as TenantConfig[];

describe('MetricsService', () => {
  let service: MetricsService;
  let usersGauge: jest.Mocked<Gauge<string>>;
  let eventsGauge: jest.Mocked<Gauge<string>>;
  let groupsGauge: jest.Mocked<Gauge<string>>;
  let eventAttendeesGauge: jest.Mocked<Gauge<string>>;
  let groupMembersGauge: jest.Mocked<Gauge<string>>;
  let activeUsers30dGauge: jest.Mocked<Gauge<string>>;
  let mockDataSource: jest.Mocked<DataSource>;
  let mockQueryRunner: MockQueryRunner;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockTenantConnection: jest.Mocked<DataSource>;

  beforeEach(() => {
    usersGauge = createMockGauge();
    eventsGauge = createMockGauge();
    groupsGauge = createMockGauge();
    eventAttendeesGauge = createMockGauge();
    groupMembersGauge = createMockGauge();
    activeUsers30dGauge = createMockGauge();

    mockQueryRunner = createMockQueryRunner();

    mockDataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => mockQueryRunner),
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

    it('should use COUNT(*) for exact counts', async () => {
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
      expect(query).toContain('COUNT(*)');
      expect(query).not.toContain('pg_class');
      expect(query).not.toContain('reltuples');
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

    it('should skip tenants with empty IDs (public schema)', async () => {
      const realTenantConnection = {
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

      mockTenantConnectionService.getAllTenants.mockResolvedValue([
        { id: '' } as any, // public schema - should be skipped
        { id: 'real-tenant' } as any, // real tenant - should be queried
      ]);
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        realTenantConnection,
      );

      await service.updateMetrics();

      // getTenantConnection should only be called for the real tenant
      expect(
        mockTenantConnectionService.getTenantConnection,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockTenantConnectionService.getTenantConnection,
      ).toHaveBeenCalledWith('real-tenant');

      // Only the real tenant's data should be in the 'all' aggregate
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 100);
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
  });

  describe('rollup advisory lock', () => {
    function singleTenantRollup() {
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
      mockTenantConnectionService.getAllTenants.mockResolvedValue(
        rollupTenants,
      );
      mockTenantConnectionService.getTenantConnection.mockResolvedValue(
        mockTenantConnection,
      );
    }

    function statements(runner: MockQueryRunner): string[] {
      return runner.query.mock.calls.map((call) => call[0] as string);
    }

    it('acquires the lock, runs the rollup, then releases the lock', async () => {
      singleTenantRollup();

      await service.updateMetrics();

      expect(statements(mockQueryRunner)).toEqual([
        expect.stringContaining('pg_try_advisory_lock'),
        expect.stringContaining('pg_advisory_unlock'),
      ]);
      // The work actually happened.
      expect(mockTenantConnection.query).toHaveBeenCalledTimes(1);
      expect(usersGauge.set).toHaveBeenCalledWith({ tenant: 'all' }, 100);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('uses the non-blocking try variant, never the blocking one', async () => {
      singleTenantRollup();

      await service.updateMetrics();

      const sql = statements(mockQueryRunner);
      expect(sql[0]).toContain('pg_try_advisory_lock');
      expect(sql.some((s) => /\bpg_advisory_lock\s*\(/.test(s))).toBe(false);
    });

    it('locks and unlocks with the same key', async () => {
      singleTenantRollup();

      await service.updateMetrics();

      const [lockCall, unlockCall] = mockQueryRunner.query.mock.calls;
      expect(lockCall[1]).toEqual(unlockCall[1]);
      expect(typeof (lockCall[1] as unknown[])[0]).toBe('number');
    });

    it('skips the rollup without doing any work when the lock is held elsewhere', async () => {
      mockQueryRunner = createMockQueryRunner(false);
      (mockDataSource.createQueryRunner as jest.Mock).mockReturnValue(
        mockQueryRunner,
      );
      singleTenantRollup();

      await service.updateMetrics();

      expect(mockTenantConnectionService.getAllTenants).not.toHaveBeenCalled();
      expect(
        mockTenantConnectionService.getTenantConnection,
      ).not.toHaveBeenCalled();
      expect(mockTenantConnection.query).not.toHaveBeenCalled();
      expect(usersGauge.set).not.toHaveBeenCalled();
      // Nothing was acquired, so nothing must be unlocked...
      expect(statements(mockQueryRunner)).toEqual([
        expect.stringContaining('pg_try_advisory_lock'),
      ]);
      // ...but the pinned connection still goes back to the pool.
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    // Advisory locks are session scoped: if the unlock lands on a different
    // pooled backend than the lock, the lock leaks forever and the rollup
    // stops permanently. Both statements must ride one pinned QueryRunner.
    it('issues the lock and the unlock on the same QueryRunner instance', async () => {
      const handedOut: MockQueryRunner[] = [];
      (mockDataSource.createQueryRunner as jest.Mock).mockImplementation(() => {
        const runner = createMockQueryRunner();
        handedOut.push(runner);
        return runner;
      });
      singleTenantRollup();

      await service.updateMetrics();

      expect(mockDataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(handedOut).toHaveLength(1);
      expect(handedOut[0].connect).toHaveBeenCalledTimes(1);
      expect(statements(handedOut[0])).toEqual([
        expect.stringContaining('pg_try_advisory_lock'),
        expect.stringContaining('pg_advisory_unlock'),
      ]);
      // Never the pool-borrowing shortcut.
      expect(mockDataSource.query).not.toHaveBeenCalled();
    });

    it('unlocks and releases even when the rollup body throws', async () => {
      // The rollup body is private; reach it through its structural shape
      // rather than widening the service to `any`.
      const rollupBody = service as unknown as {
        collectAllTenantMetrics: () => Promise<void>;
      };
      jest
        .spyOn(rollupBody, 'collectAllTenantMetrics')
        .mockRejectedValue(new Error('rollup exploded'));

      await expect(service.updateMetrics()).rejects.toThrow('rollup exploded');

      expect(statements(mockQueryRunner)).toEqual([
        expect.stringContaining('pg_try_advisory_lock'),
        expect.stringContaining('pg_advisory_unlock'),
      ]);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('runs the startup rollup through the lock exactly once', async () => {
      singleTenantRollup();

      await service.onModuleInit();

      // MetricsModule used to trigger a second startup rollup of its own.
      expect(mockDataSource.createQueryRunner).toHaveBeenCalledTimes(1);
      expect(mockTenantConnection.query).toHaveBeenCalledTimes(1);
      expect(statements(mockQueryRunner)).toEqual([
        expect.stringContaining('pg_try_advisory_lock'),
        expect.stringContaining('pg_advisory_unlock'),
      ]);
    });

    it('does not abort bootstrap when the startup rollup fails', async () => {
      mockQueryRunner.connect.mockRejectedValue(new Error('db unreachable'));
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(logged).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });
  });
});
