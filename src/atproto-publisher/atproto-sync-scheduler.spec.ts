import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { AtprotoSyncScheduler } from './atproto-sync-scheduler';
import { TenantConnectionService } from '../tenant/tenant.service';
import { AtprotoPublisherService } from './atproto-publisher.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventStatus, EventVisibility } from '../core/constants/constant';

// Helper to create a mock stale event
function createMockStaleEvent(
  overrides: Partial<EventEntity> = {},
): EventEntity {
  const event = new EventEntity();
  event.id = 1;
  event.slug = 'stale-event';
  event.name = 'Stale Event';
  event.status = EventStatus.Published;
  event.visibility = EventVisibility.Public;
  event.sourceType = null;
  event.atprotoUri = 'at://did:plc:abc/community.lexicon.calendar.event/rkey1';
  event.atprotoRkey = 'rkey1';
  event.atprotoCid = 'cid-old';
  event.atprotoSyncedAt = new Date('2026-02-15T10:00:00Z');
  event.updatedAt = new Date('2026-02-15T12:00:00Z'); // Updated AFTER sync
  event.user = {
    id: 1,
    ulid: 'user-ulid-123',
    slug: 'test-user',
    email: 'test@example.com',
  } as UserEntity;

  Object.assign(event, overrides);
  return event;
}

describe('AtprotoSyncScheduler', () => {
  let scheduler: AtprotoSyncScheduler;
  let tenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockPublisherService: { publishEvent: jest.Mock };
  let mockModuleRef: { resolve: jest.Mock };
  let mockEventRepository: {
    createQueryBuilder: jest.Mock;
    update: jest.Mock;
  };
  let mockQueryBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    // Set up query builder chain mock
    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    mockEventRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const mockTenantConnectionService = {
      getAllTenantIds: jest.fn().mockResolvedValue([]),
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockEventRepository),
      }),
    };

    mockPublisherService = {
      publishEvent: jest.fn(),
    };

    mockModuleRef = {
      resolve: jest.fn().mockResolvedValue(mockPublisherService),
      registerRequestByContextId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoSyncScheduler,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    scheduler = module.get<AtprotoSyncScheduler>(AtprotoSyncScheduler);
    tenantConnectionService = module.get(TenantConnectionService);
  });

  describe('handlePendingSyncRetry', () => {
    it('should find events with updatedAt > atprotoSyncedAt and republish', async () => {
      const staleEvent = createMockStaleEvent();
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([staleEvent]);

      mockPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/rkey-new',
        atprotoRkey: 'rkey-new',
        atprotoCid: 'cid-new',
      });

      await scheduler.handlePendingSyncRetry();

      // Verify ModuleRef.resolve was called to get a fresh publisher instance
      expect(mockModuleRef.resolve).toHaveBeenCalledWith(
        AtprotoPublisherService,
        expect.any(Object),
      );

      // Verify publishEvent was called with the stale event
      expect(mockPublisherService.publishEvent).toHaveBeenCalledWith(
        staleEvent,
        'tenant1',
      );

      // Verify repository.update was called with fresh metadata
      expect(mockEventRepository.update).toHaveBeenCalledWith(
        { id: staleEvent.id },
        expect.objectContaining({
          atprotoUri:
            'at://did:plc:abc/community.lexicon.calendar.event/rkey-new',
          atprotoRkey: 'rkey-new',
          atprotoCid: 'cid-new',
          atprotoSyncedAt: expect.any(Date),
        }),
      );
    });

    it('should not crash if publishEvent throws for one event', async () => {
      const event1 = createMockStaleEvent({ id: 1, slug: 'event-1' });
      const event2 = createMockStaleEvent({ id: 2, slug: 'event-2' });

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([event1, event2]);

      // First event fails, second succeeds
      mockPublisherService.publishEvent
        .mockRejectedValueOnce(new Error('PDS timeout'))
        .mockResolvedValueOnce({
          action: 'updated',
          atprotoUri:
            'at://did:plc:abc/community.lexicon.calendar.event/rkey2',
          atprotoRkey: 'rkey2',
          atprotoCid: 'cid2',
        });

      // Should not throw
      await expect(scheduler.handlePendingSyncRetry()).resolves.not.toThrow();

      // Both events should have been attempted
      expect(mockPublisherService.publishEvent).toHaveBeenCalledTimes(2);

      // Only the second event should have been updated in the DB
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.update).toHaveBeenCalledWith(
        { id: event2.id },
        expect.objectContaining({
          atprotoRkey: 'rkey2',
        }),
      );
    });

    it('should skip tenant if no stale events found', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await scheduler.handlePendingSyncRetry();

      expect(mockPublisherService.publishEvent).not.toHaveBeenCalled();
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should update atprotoSyncedAt on conflict to stop retry loop', async () => {
      const staleEvent = createMockStaleEvent();
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([staleEvent]);

      mockPublisherService.publishEvent.mockResolvedValue({
        action: 'conflict',
      });

      await scheduler.handlePendingSyncRetry();

      expect(mockPublisherService.publishEvent).toHaveBeenCalledTimes(1);
      // On conflict, should update atprotoSyncedAt to stop the retry loop.
      // The firehose will deliver the PDS version for reconciliation.
      expect(mockEventRepository.update).toHaveBeenCalledWith(
        { id: staleEvent.id },
        { atprotoSyncedAt: expect.any(Date) },
      );
    });

    it('should continue processing other tenants if one tenant fails', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue([
        'tenant1',
        'tenant2',
      ]);

      const staleEvent = createMockStaleEvent();

      // First tenant: getTenantConnection throws
      // Second tenant: succeeds
      const mockConnection = {
        getRepository: jest.fn().mockReturnValue(mockEventRepository),
      };

      tenantConnectionService.getTenantConnection
        .mockRejectedValueOnce(new Error('DB connection failed'))
        .mockResolvedValueOnce(mockConnection as any);

      mockQueryBuilder.getMany.mockResolvedValue([staleEvent]);

      mockPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/rkey-new',
        atprotoRkey: 'rkey-new',
        atprotoCid: 'cid-new',
      });

      // Should not throw
      await expect(scheduler.handlePendingSyncRetry()).resolves.not.toThrow();

      // publishEvent should have been called for the second tenant's event
      expect(mockPublisherService.publishEvent).toHaveBeenCalledTimes(1);
    });

    it('should skip events with null user and continue processing remaining events', async () => {
      const orphanEvent = createMockStaleEvent({
        id: 10,
        slug: 'orphan-event',
        user: null as any,
      });
      const normalEvent = createMockStaleEvent({
        id: 11,
        slug: 'normal-event',
      });

      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([orphanEvent, normalEvent]);

      mockPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/rkey-normal',
        atprotoRkey: 'rkey-normal',
        atprotoCid: 'cid-normal',
      });

      // Spy on logger to verify warning was emitted
      const loggerWarnSpy = jest.spyOn(
        scheduler['logger'],
        'warn',
      );

      await scheduler.handlePendingSyncRetry();

      // Should warn about the orphan event with tenantId context
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('orphan-event'),
        expect.objectContaining({ tenantId: 'tenant1' }),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('user'),
        expect.objectContaining({ tenantId: 'tenant1' }),
      );

      // publishEvent should only be called for the normal event, not the orphan
      expect(mockPublisherService.publishEvent).toHaveBeenCalledTimes(1);
      expect(mockPublisherService.publishEvent).toHaveBeenCalledWith(
        normalEvent,
        'tenant1',
      );

      // Only the normal event should be updated in the DB
      expect(mockEventRepository.update).toHaveBeenCalledTimes(1);
      expect(mockEventRepository.update).toHaveBeenCalledWith(
        { id: normalEvent.id },
        expect.objectContaining({
          atprotoRkey: 'rkey-normal',
        }),
      );
    });

    it('should query with correct filters', async () => {
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await scheduler.handlePendingSyncRetry();

      // Verify the query builder was configured correctly
      expect(mockEventRepository.createQueryBuilder).toHaveBeenCalledWith(
        'event',
      );
      expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'event.user',
        'user',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'event.atprotoUri IS NOT NULL',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.sourceType IS NULL',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'event.updatedAt > event.atprotoSyncedAt',
      );
    });
  });
});
