import { Test, TestingModule } from '@nestjs/testing';
import { CalendarSyncScheduler } from './calendar-sync-scheduler';
import { CalendarSourceService } from '../calendar-source/calendar-source.service';
import { ExternalCalendarService } from './external-calendar.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CalendarSourceEntity } from '../calendar-source/infrastructure/persistence/relational/entities/calendar-source.entity';
import { CalendarSourceType } from '../calendar-source/dto/create-calendar-source.dto';

describe('CalendarSyncScheduler', () => {
  let scheduler: CalendarSyncScheduler;
  let calendarSourceService: jest.Mocked<CalendarSourceService>;
  let externalCalendarService: jest.Mocked<ExternalCalendarService>;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;

  const mockCalendarSource1 = new CalendarSourceEntity();
  mockCalendarSource1.id = 1;
  mockCalendarSource1.ulid = 'calendar_ulid_1';
  mockCalendarSource1.userId = 1;
  mockCalendarSource1.type = CalendarSourceType.GOOGLE;
  mockCalendarSource1.name = 'Work Calendar';
  mockCalendarSource1.isActive = true;
  mockCalendarSource1.syncFrequency = 60; // 1 hour
  mockCalendarSource1.lastSyncedAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

  const mockCalendarSource2 = new CalendarSourceEntity();
  mockCalendarSource2.id = 2;
  mockCalendarSource2.ulid = 'calendar_ulid_2';
  mockCalendarSource2.userId = 2;
  mockCalendarSource2.type = CalendarSourceType.ICAL;
  mockCalendarSource2.name = 'Personal Calendar';
  mockCalendarSource2.isActive = true;
  mockCalendarSource2.syncFrequency = 30; // 30 minutes
  mockCalendarSource2.lastSyncedAt = new Date(Date.now() - 45 * 60 * 1000); // 45 minutes ago

  beforeEach(async () => {
    const mockCalendarSourceService = {
      findAllActiveSources: jest.fn(),
      updateSyncStatus: jest.fn(),
    };

    const mockExternalCalendarService = {
      syncCalendarSource: jest.fn(),
    };

    const mockTenantConnectionService = {
      getAllTenantIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarSyncScheduler,
        {
          provide: CalendarSourceService,
          useValue: mockCalendarSourceService,
        },
        {
          provide: ExternalCalendarService,
          useValue: mockExternalCalendarService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    scheduler = module.get<CalendarSyncScheduler>(CalendarSyncScheduler);
    calendarSourceService = module.get(CalendarSourceService);
    externalCalendarService = module.get(ExternalCalendarService);
    tenantConnectionService = module.get(TenantConnectionService);
  });

  describe('handlePeriodicSync', () => {
    it('should sync calendar sources that need syncing across all tenants', async () => {
      const tenantIds = ['tenant-1', 'tenant-2'];
      tenantConnectionService.getAllTenantIds.mockResolvedValue(tenantIds);

      // Mock calendar sources for different tenants
      calendarSourceService.findAllActiveSources
        .mockResolvedValueOnce([mockCalendarSource1]) // tenant-1
        .mockResolvedValueOnce([mockCalendarSource2]); // tenant-2

      const mockSyncResult = {
        success: true,
        eventsCount: 5,
        lastSyncedAt: new Date(),
      };

      externalCalendarService.syncCalendarSource.mockResolvedValue(
        mockSyncResult,
      );
      calendarSourceService.updateSyncStatus.mockResolvedValue(
        mockCalendarSource1,
      );

      await scheduler.handlePeriodicSync();

      expect(tenantConnectionService.getAllTenantIds).toHaveBeenCalled();
      expect(calendarSourceService.findAllActiveSources).toHaveBeenCalledTimes(
        2,
      );
      expect(calendarSourceService.findAllActiveSources).toHaveBeenCalledWith(
        'tenant-1',
      );
      expect(calendarSourceService.findAllActiveSources).toHaveBeenCalledWith(
        'tenant-2',
      );

      // Both sources should be synced as they are overdue
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledTimes(
        2,
      );
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledWith(
        mockCalendarSource1,
        'tenant-1',
      );
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledWith(
        mockCalendarSource2,
        'tenant-2',
      );

      expect(calendarSourceService.updateSyncStatus).toHaveBeenCalledTimes(2);
    });

    it('should skip calendar sources that do not need syncing', async () => {
      const recentlySync = new CalendarSourceEntity();
      recentlySync.id = 3;
      recentlySync.ulid = 'calendar_ulid_3';
      recentlySync.userId = 3;
      recentlySync.type = CalendarSourceType.GOOGLE;
      recentlySync.syncFrequency = 60;
      recentlySync.lastSyncedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      calendarSourceService.findAllActiveSources.mockResolvedValue([
        recentlySync,
      ]);

      await scheduler.handlePeriodicSync();

      expect(externalCalendarService.syncCalendarSource).not.toHaveBeenCalled();
      expect(calendarSourceService.updateSyncStatus).not.toHaveBeenCalled();
    });

    it('should handle sync failures gracefully', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      calendarSourceService.findAllActiveSources.mockResolvedValue([
        mockCalendarSource1,
      ]);

      const syncError = new Error('Google API rate limit exceeded');
      externalCalendarService.syncCalendarSource.mockRejectedValue(syncError);

      // Should not throw, but should log the error
      await expect(scheduler.handlePeriodicSync()).resolves.not.toThrow();

      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalled();
      expect(calendarSourceService.updateSyncStatus).not.toHaveBeenCalled();
    });

    it('should handle empty tenant list', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue([]);

      await scheduler.handlePeriodicSync();

      expect(calendarSourceService.findAllActiveSources).not.toHaveBeenCalled();
      expect(externalCalendarService.syncCalendarSource).not.toHaveBeenCalled();
    });

    it('should handle tenant with no calendar sources', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      calendarSourceService.findAllActiveSources.mockResolvedValue([]);

      await scheduler.handlePeriodicSync();

      expect(calendarSourceService.findAllActiveSources).toHaveBeenCalledWith(
        'tenant-1',
      );
      expect(externalCalendarService.syncCalendarSource).not.toHaveBeenCalled();
    });

    it('should respect individual source sync frequencies', async () => {
      // Create calendar sources with different sync frequencies
      const hourlySync = {
        ...mockCalendarSource1,
        syncFrequency: 60,
        lastSyncedAt: new Date(Date.now() - 90 * 60 * 1000),
      }; // 90 min ago, should sync
      const dailySync = {
        ...mockCalendarSource2,
        syncFrequency: 1440,
        lastSyncedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      }; // 12 hours ago, should not sync

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant-1']);
      calendarSourceService.findAllActiveSources.mockResolvedValue([
        hourlySync,
        dailySync,
      ] as any);

      const mockSyncResult = {
        success: true,
        eventsCount: 3,
        lastSyncedAt: new Date(),
      };

      externalCalendarService.syncCalendarSource.mockResolvedValue(
        mockSyncResult,
      );

      await scheduler.handlePeriodicSync();

      // Only the hourly sync should be called
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledTimes(
        1,
      );
      expect(externalCalendarService.syncCalendarSource).toHaveBeenCalledWith(
        hourlySync,
        'tenant-1',
      );
    });
  });

  describe('needsSync', () => {
    it('should return true for sources that have never been synced', async () => {
      const neverSynced = { ...mockCalendarSource1, lastSyncedAt: null };

      const result = await scheduler.needsSync(neverSynced as any);

      expect(result).toBe(true);
    });

    it('should return true for sources overdue for sync', async () => {
      const overdue = {
        ...mockCalendarSource1,
        syncFrequency: 30,
        lastSyncedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
      };

      const result = await scheduler.needsSync(overdue as any);

      expect(result).toBe(true);
    });

    it('should return false for sources not yet due for sync', async () => {
      const notDue = {
        ...mockCalendarSource1,
        syncFrequency: 60,
        lastSyncedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
      };

      const result = await scheduler.needsSync(notDue as any);

      expect(result).toBe(false);
    });

    it('should return false for inactive sources', async () => {
      const inactive = {
        ...mockCalendarSource1,
        isActive: false,
        lastSyncedAt: null,
      };

      const result = await scheduler.needsSync(inactive as any);

      expect(result).toBe(false);
    });
  });
});
