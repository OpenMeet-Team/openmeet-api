import { Test, TestingModule } from '@nestjs/testing';
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
  let atprotoPublisherService: jest.Mocked<AtprotoPublisherService>;
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

    const mockAtprotoPublisherService = {
      publishEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoSyncScheduler,
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: AtprotoPublisherService,
          useValue: mockAtprotoPublisherService,
        },
      ],
    }).compile();

    scheduler = module.get<AtprotoSyncScheduler>(AtprotoSyncScheduler);
    tenantConnectionService = module.get(TenantConnectionService);
    atprotoPublisherService = module.get(AtprotoPublisherService);
  });

  describe('handlePendingSyncRetry', () => {
    it('should find events with updatedAt > atprotoSyncedAt and republish', async () => {
      const staleEvent = createMockStaleEvent();
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([staleEvent]);

      atprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/rkey-new',
        atprotoRkey: 'rkey-new',
        atprotoCid: 'cid-new',
      });

      await scheduler.handlePendingSyncRetry();

      // Verify publishEvent was called with the stale event
      expect(atprotoPublisherService.publishEvent).toHaveBeenCalledWith(
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
      atprotoPublisherService.publishEvent
        .mockRejectedValueOnce(new Error('PDS timeout'))
        .mockResolvedValueOnce({
          action: 'updated',
          atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/rkey2',
          atprotoRkey: 'rkey2',
          atprotoCid: 'cid2',
        });

      // Should not throw
      await expect(scheduler.handlePendingSyncRetry()).resolves.not.toThrow();

      // Both events should have been attempted
      expect(atprotoPublisherService.publishEvent).toHaveBeenCalledTimes(2);

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

      expect(atprotoPublisherService.publishEvent).not.toHaveBeenCalled();
      expect(mockEventRepository.update).not.toHaveBeenCalled();
    });

    it('should handle conflict result without updating the database', async () => {
      const staleEvent = createMockStaleEvent();
      tenantConnectionService.getAllTenantIds.mockResolvedValue(['tenant1']);
      mockQueryBuilder.getMany.mockResolvedValue([staleEvent]);

      atprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'conflict',
      });

      await scheduler.handlePendingSyncRetry();

      expect(atprotoPublisherService.publishEvent).toHaveBeenCalledTimes(1);
      // Should NOT update the database on conflict
      expect(mockEventRepository.update).not.toHaveBeenCalled();
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

      atprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:abc/community.lexicon.calendar.event/rkey-new',
        atprotoRkey: 'rkey-new',
        atprotoCid: 'cid-new',
      });

      // Should not throw
      await expect(scheduler.handlePendingSyncRetry()).resolves.not.toThrow();

      // publishEvent should have been called for the second tenant's event
      expect(atprotoPublisherService.publishEvent).toHaveBeenCalledTimes(1);
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
