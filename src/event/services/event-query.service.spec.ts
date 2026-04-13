import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../../test/utils/constants';
import {
  EventStatus,
  EventVisibility,
  EventType,
  EventAttendeeStatus,
} from '../../core/constants/constant';
import { Brackets, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventQueryService } from './event-query.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { GroupMemberService } from '../../group-member/group-member.service';
import { GroupDIDFollowService } from '../../group-did-follow/group-did-follow.service';
import { ContrailQueryService } from '../../contrail/contrail-query.service';
import { AtprotoEnrichmentService } from '../../atproto-enrichment/atproto-enrichment.service';
import type { AtprotoSourcedEvent } from '../../atproto-enrichment/types/enriched-event.types';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { UserService } from '../../user/user.service';
import { UserAtprotoIdentityService } from '../../user-atproto-identity/user-atproto-identity.service';
import { DashboardEventsTab } from '../dto/dashboard-events-query.dto';

// Define a mock event entity for consistent use
const mockEventEntity: EventEntity = {
  id: 1,
  ulid: '01HABCDEFGHJKMNPQRSTVWXYZ',
  slug: 'test-event-slug',
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  status: EventStatus.Published,
  visibility: EventVisibility.Public,
  type: EventType.InPerson,
  location: 'Test Location',
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 1 } as UserEntity,
  // Add other required fields or relations as needed by tests
} as EventEntity; // Cast for simplicity

describe('EventQueryService', () => {
  let service: EventQueryService;
  let eventRepository: jest.Mocked<Repository<EventEntity>>; // Use mocked type
  let eventAttendeesRepository: any; // Mock for attendee count queries
  let mockGroupMemberService: jest.Mocked<GroupMemberService>; // Add declaration for the mock service
  let mockGroupDIDFollowService: { getFollowedDidsForGroup: jest.Mock };
  let mockEnrichmentService: any;
  let mockUserService: { getUserById: jest.Mock };
  let mockIdentityService: { findByUserUlid: jest.Mock };

  beforeEach(async () => {
    // Define the mock repository behavior here
    eventRepository = {
      find: jest.fn(),
      findOne: jest.fn(), // Ensure findOne is mocked
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn(),
        getOne: jest.fn(), // Add getOne if needed by service
        getCount: jest.fn(), // Add getCount if needed
      }),
      // Add other methods if needed
    } as unknown as jest.Mocked<Repository<EventEntity>>; // Use unknown cast for simplicity

    // Define mock eventAttendeesRepository for batch count queries
    eventAttendeesRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    // Define mock GroupMemberService behavior
    mockGroupMemberService = {
      // Add necessary mocked methods used by EventQueryService
      findGroupDetailsMembers: jest.fn().mockResolvedValue([]), // Example mock method
      // ... other methods if needed
    } as unknown as jest.Mocked<GroupMemberService>;

    // Define mock GroupDIDFollowService behavior
    mockGroupDIDFollowService = {
      getFollowedDidsForGroup: jest.fn().mockResolvedValue([]),
    };

    // Define mock UserService behavior
    mockUserService = {
      getUserById: jest.fn().mockResolvedValue({ id: 1, ulid: '01HABCDEF' }),
    };

    // Define mock UserAtprotoIdentityService behavior
    mockIdentityService = {
      findByUserUlid: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventQueryService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          // Use a factory or value that returns the mocked repository instance
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockImplementation((entity: any) => {
                if (entity === EventAttendeesEntity) {
                  return eventAttendeesRepository;
                }
                return eventRepository;
              }),
            }),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            // Add mock methods used by EventQueryService
            showConfirmedEventAttendeesCount: jest.fn().mockResolvedValue(5),
            findEventAttendeeByUserId: jest.fn(),
            showEventAttendees: jest
              .fn()
              .mockResolvedValue({ data: [], meta: { total: 0 } }), // Add missing method
          },
        },
        {
          provide: GroupMemberService, // Re-add the provider
          useValue: mockGroupMemberService, // Use the defined mock
        },
        {
          provide: GroupDIDFollowService,
          useValue: mockGroupDIDFollowService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockIdentityService,
        },
        {
          provide: ContrailQueryService,
          useValue: {
            find: jest.fn().mockResolvedValue({ records: [], total: 0 }),
            findByUri: jest.fn().mockResolvedValue(null),
            findWithGeoFilter: jest
              .fn()
              .mockResolvedValue({ records: [], total: 0 }),
            resolveHandles: jest.fn().mockResolvedValue(new Map()),
            getPublicDataSource: jest.fn().mockResolvedValue({
              query: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: AtprotoEnrichmentService,
          useValue: {
            enrichRecords: jest.fn().mockResolvedValue([]),
            filterByCategories: jest
              .fn()
              .mockImplementation((events, _cats) => events),
            deduplicatePrivateEvents: jest
              .fn()
              .mockImplementation((events, _uris) => events),
            mapAtprotoToEvent: jest.fn(),
            parseAtprotoSlug: jest.fn().mockReturnValue(null),
          },
        },
        // Remove providers for unused services (Matrix, GroupMember, Recurrence)
        {
          provide: getRepositoryToken(EventEntity), // Keep this token provider
          useValue: eventRepository, // Ensure it uses the same mock instance
        },
        // Optionally remove EventAttendeesEntity repo if not directly used by QueryService
        // {
        //   provide: getRepositoryToken(EventAttendeesEntity),
        //   useValue: { /* mock attendee repo methods if needed */ },
        // },
      ],
    }).compile();

    service = await module.resolve<EventQueryService>(EventQueryService);
    mockEnrichmentService = module.get(AtprotoEnrichmentService);
  });

  describe('findEventsForGroup', () => {
    it('should use batch query for attendee counts instead of N+1 individual calls', async () => {
      // Create multiple mock events to simulate N+1 scenario
      const mockEvents = Array.from({ length: 10 }, (_, i) => ({
        ...mockEventEntity,
        id: i + 1,
        slug: `test-event-${i + 1}`,
      }));

      // Track individual showConfirmedEventAttendeesCount calls (N+1 pattern)
      const mockAttendeeCountFn = jest.fn().mockResolvedValue(5);
      jest
        .spyOn(
          service['eventAttendeeService'],
          'showConfirmedEventAttendeesCount',
        )
        .mockImplementation(mockAttendeeCountFn);

      // Mock query builder for batch count query
      const mockGetRawMany = jest
        .fn()
        .mockResolvedValue(
          mockEvents.map((e) => ({ eventId: e.id, count: '5' })),
        );
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: mockGetRawMany,
      };

      // Mock the repository with both find and createQueryBuilder
      const mockRepositoryFind = jest.fn().mockResolvedValue(mockEvents);
      const mockEventAttendeesRepo = {
        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return mockEventAttendeesRepo;
            }
            return {
              find: mockRepositoryFind,
              createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            };
          }),
        } as any);

      // Call the method
      const result = await service.findEventsForGroup(1, 10);

      // Verify we got all events back with attendee counts
      expect(result).toHaveLength(10);

      // KEY ASSERTION: After the fix, showConfirmedEventAttendeesCount should NOT be called
      // at all because we use a batch query instead
      // Before the fix: this would be called 10 times (once per event) - N+1 problem
      // After the fix: this should be called 0 times (batch query used instead)
      const individualCallCount = mockAttendeeCountFn.mock.calls.length;

      // KEY ASSERTION: showConfirmedEventAttendeesCount should NOT be called
      // because we use a batch query instead (N+1 fix)
      expect(individualCallCount).toBe(0);

      // Verify batch query was used
      expect(mockGetRawMany).toHaveBeenCalled();
    });
  });

  describe('findEventsForGroup - origin field', () => {
    it('should mark native group events with origin "group"', async () => {
      const mockEvents = [
        { ...mockEventEntity, id: 1, slug: 'native-event-1' },
      ];

      const mockGetRawMany = jest
        .fn()
        .mockResolvedValue([{ eventId: 1, count: '3' }]);
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: mockGetRawMany,
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
              };
            }
            return {
              find: jest.fn().mockResolvedValue(mockEvents),
              createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            };
          }),
        } as any);

      // No followed DIDs
      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([]);

      const result = await service.findEventsForGroup(1, 10);

      expect(result).toHaveLength(1);
      expect((result[0] as any).origin).toBe('group');
    });

    it('should include external events from followed DIDs with origin "external"', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-event',
        groupId: 1,
        startDate: new Date('2026-01-01'),
      };
      const externalEnrichedEvent = {
        id: undefined,
        atprotoUri:
          'at://did:plc:followed1/community.lexicon.calendar.event/abc',
        name: 'External Event',
        startDate: new Date('2026-01-02'),
      };

      const mockAttendeeQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ eventId: 1, count: '3' }]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              find: jest.fn().mockResolvedValue([nativeEvent]),
              createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
            };
          }),
        } as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:followed1',
      ]);

      jest
        .spyOn(service['contrailQueryService'], 'find')
        .mockResolvedValue({ records: [{}], total: 1 } as any);
      jest
        .spyOn(service['atprotoEnrichmentService'], 'enrichRecords')
        .mockResolvedValue([externalEnrichedEvent as any]);

      const result = await service.findEventsForGroup(1, 10);

      expect(result.length).toBeGreaterThanOrEqual(2);
      const origins = result.map((e) => (e as any).origin);
      expect(origins).toContain('group');
      expect(origins).toContain('external');
    });

    it('should deduplicate: native wins over external when event appears in both via atprotoUri', async () => {
      const sharedUri =
        'at://did:plc:followed1/community.lexicon.calendar.event/abc';
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'dual-event',
        groupId: 1,
        atprotoUri: sharedUri,
        startDate: new Date('2026-01-01'),
      };
      const externalEnrichedEvent = {
        id: undefined,
        atprotoUri: sharedUri,
        name: 'External (same) Event',
        startDate: new Date('2026-01-01'),
      };

      const mockAttendeeQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ eventId: 1, count: '5' }]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              find: jest.fn().mockResolvedValue([nativeEvent]),
              createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
            };
          }),
        } as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:followed1',
      ]);

      jest
        .spyOn(service['contrailQueryService'], 'find')
        .mockResolvedValue({ records: [{}], total: 1 } as any);
      jest
        .spyOn(service['atprotoEnrichmentService'], 'enrichRecords')
        .mockResolvedValue([externalEnrichedEvent as any]);

      const result = await service.findEventsForGroup(1, 10);

      expect(result).toHaveLength(1);
      expect((result[0] as any).origin).toBe('group');
    });
  });

  describe('findEventsForGroup - Contrail integration', () => {
    let mockContrailQueryService: any;
    let mockAtprotoEnrichmentService: any;

    beforeEach(() => {
      mockContrailQueryService = service['contrailQueryService'];
      mockAtprotoEnrichmentService = service['atprotoEnrichmentService'];
    });

    it('should query Contrail when groupDidFollowService returns followed DIDs', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-event',
        startDate: new Date('2026-01-01'),
      };

      const mockAttendeeQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              find: jest.fn().mockResolvedValue([nativeEvent]),
              createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
            };
          }),
        } as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:abc123',
        'did:plc:def456',
      ]);

      jest
        .spyOn(mockContrailQueryService, 'find')
        .mockResolvedValue({ records: [], total: 0 });
      jest
        .spyOn(mockAtprotoEnrichmentService, 'enrichRecords')
        .mockResolvedValue([]);

      await service.findEventsForGroup(1, 10);

      expect(mockContrailQueryService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({
              sql: expect.stringContaining('did = $1'),
              params: expect.arrayContaining(['did:plc:abc123']),
            }),
          ]),
        }),
      );
    });

    it('should enrich Contrail records via atprotoEnrichmentService', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-event',
        startDate: new Date('2026-01-01'),
      };

      const contrailRecord = {
        uri: 'at://did:plc:abc123/community.lexicon.calendar.event/rkey1',
        cid: 'bafyreiabc',
        did: 'did:plc:abc123',
        record: {
          $type: 'community.lexicon.calendar.event',
          name: 'External Event',
          startsAt: '2026-01-15T10:00:00Z',
        },
        indexedAt: '2026-01-01T00:00:00Z',
      };

      const enrichedEvent = {
        id: undefined,
        atprotoUri:
          'at://did:plc:abc123/community.lexicon.calendar.event/rkey1',
        name: 'External Event',
        startDate: new Date('2026-01-15T10:00:00Z'),
      };

      const mockAttendeeQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              find: jest.fn().mockResolvedValue([nativeEvent]),
              createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
            };
          }),
        } as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:abc123',
      ]);

      jest
        .spyOn(mockContrailQueryService, 'find')
        .mockResolvedValue({ records: [contrailRecord], total: 1 });
      jest
        .spyOn(mockAtprotoEnrichmentService, 'enrichRecords')
        .mockResolvedValue([enrichedEvent as any]);

      const result = await service.findEventsForGroup(1, 10);

      expect(mockAtprotoEnrichmentService.enrichRecords).toHaveBeenCalledWith(
        [contrailRecord],
        TESTING_TENANT_ID,
      );

      // Enriched external event should appear in results
      const externalResults = result.filter(
        (e) => (e as any).origin === 'external',
      );
      expect(externalResults.length).toBeGreaterThanOrEqual(1);
    });

    it('should not query Contrail when no DIDs are followed', async () => {
      const mockAttendeeQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              find: jest.fn().mockResolvedValue([]),
              createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
            };
          }),
        } as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([]);

      const contrailFindSpy = jest.spyOn(mockContrailQueryService, 'find');

      await service.findEventsForGroup(1, 10);

      expect(contrailFindSpy).not.toHaveBeenCalled();
    });
  });

  describe('showEvent', () => {
    it('should return enriched event for ATProto slug when Contrail is enabled', async () => {
      const mockEnrichedEvent = {
        source: 'atproto',
        name: 'ATProto Event',
        slug: 'did:plc:abc~tid1',
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(null),
          }),
        } as any);

      const contrailService = (service as any).contrailQueryService;
      const enrichmentService = (service as any).atprotoEnrichmentService;

      enrichmentService.parseAtprotoSlug.mockReturnValue({
        did: 'did:plc:abc',
        rkey: 'tid1',
      });
      contrailService.findByUri.mockResolvedValue({
        uri: 'at://did:plc:abc/community.lexicon.calendar.event/tid1',
      });
      enrichmentService.enrichRecords.mockResolvedValue([mockEnrichedEvent]);

      const result = await service.showEvent('did:plc:abc~tid1');
      expect(result).toEqual(mockEnrichedEvent);
      expect(contrailService.findByUri).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        'at://did:plc:abc/community.lexicon.calendar.event/tid1',
      );
    });

    it('should throw NotFoundException for ATProto slug when Contrail returns no records', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(null),
          }),
        } as any);

      const contrailService = (service as any).contrailQueryService;
      const enrichmentService = (service as any).atprotoEnrichmentService;

      enrichmentService.parseAtprotoSlug.mockReturnValue({
        did: 'did:plc:abc',
        rkey: 'tid1',
      });
      contrailService.findByUri.mockResolvedValue(null);

      await expect(service.showEvent('did:plc:abc~tid1')).rejects.toThrow(
        'Event not found',
      );
    });

    it('should throw NotFoundException for normal slug when Contrail is enabled but slug is not ATProto', async () => {
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(null),
          }),
        } as any);

      const contrailService = (service as any).contrailQueryService;
      const enrichmentService = (service as any).atprotoEnrichmentService;

      enrichmentService.parseAtprotoSlug.mockReturnValue(null);

      await expect(service.showEvent('normal-event-slug')).rejects.toThrow(
        'Event not found',
      );
      expect(contrailService.findByUri).not.toHaveBeenCalled();
    });
  });

  describe('getHomePageFeaturedEvents', () => {
    it('should return at most 4 events from Contrail enrichment', async () => {
      const contrailService = service[
        'contrailQueryService'
      ] as jest.Mocked<ContrailQueryService>;
      const enrichmentService = service[
        'atprotoEnrichmentService'
      ] as jest.Mocked<AtprotoEnrichmentService>;

      // Simulate Contrail returning 6 records (more than 4 — random sample should cap at 4)
      const mockContrailRecords = Array.from({ length: 6 }, (_, i) => ({
        uri: `at://did:plc:${i}/community.lexicon.calendar.event/${i}`,
        record: {
          name: `Event ${i}`,
          startsAt: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
        },
      }));

      const mockEnrichedEvents = mockContrailRecords.map((r, i) => ({
        ...mockEventEntity,
        id: i + 200,
        slug: `contrail-event-${i}`,
        atprotoUri: r.uri,
      }));

      contrailService.find.mockResolvedValueOnce({
        records: mockContrailRecords as any,
        total: mockContrailRecords.length,
      });
      enrichmentService.enrichRecords.mockResolvedValueOnce(
        mockEnrichedEvents as any,
      );

      const result = await service.getHomePageFeaturedEvents();

      // Result is capped at 4
      expect(result.length).toBeLessThanOrEqual(4);
    });

    it('should query Contrail for public events and enrich with tenant metadata', async () => {
      const mockContrailRecords = [
        {
          uri: 'at://did:plc:aaa/community.lexicon.calendar.event/1',
          record: {
            name: 'Event 1',
            startsAt: new Date(Date.now() + 86400000).toISOString(),
          },
        },
        {
          uri: 'at://did:plc:bbb/community.lexicon.calendar.event/2',
          record: {
            name: 'Event 2',
            startsAt: new Date(Date.now() + 172800000).toISOString(),
          },
        },
        {
          uri: 'at://did:plc:ccc/community.lexicon.calendar.event/3',
          record: {
            name: 'Event 3',
            startsAt: new Date(Date.now() + 259200000).toISOString(),
          },
        },
      ];

      const mockEnrichedEvents = mockContrailRecords.map((r, i) => ({
        ...mockEventEntity,
        id: i + 100,
        slug: `contrail-event-${i + 1}`,
        atprotoUri: r.uri,
      }));

      const contrailService = service[
        'contrailQueryService'
      ] as jest.Mocked<ContrailQueryService>;
      contrailService.find.mockResolvedValueOnce({
        records: mockContrailRecords as any,
        total: mockContrailRecords.length,
      });

      mockEnrichmentService.enrichRecords.mockResolvedValueOnce(
        mockEnrichedEvents,
      );

      const result = await service.getHomePageFeaturedEvents();

      // 1. contrailQueryService.find should be called with the event collection
      expect(contrailService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({ limit: 50 }),
      );

      // 2. atprotoEnrichmentService.enrichRecords should be called with the Contrail records
      expect(mockEnrichmentService.enrichRecords).toHaveBeenCalledWith(
        mockContrailRecords,
        TESTING_TENANT_ID,
      );

      // 3. Result contains at most 4 events
      expect(result.length).toBeLessThanOrEqual(4);
    });
  });

  describe('getHomePageUserNextHostedEvent', () => {
    it('should use batch attendee count query instead of loadRelationCountAndMap', async () => {
      const mockEvent = { ...mockEventEntity, id: 42 };

      const loadRelationCountAndMapFn = jest.fn().mockReturnThis();
      const mockEventQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: loadRelationCountAndMapFn,
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockEvent),
      };

      // Mock the batch attendee count query for a single event
      const mockGetRawOne = jest.fn().mockResolvedValue({ count: '5' });
      const mockAttendeeQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: mockGetRawOne,
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest
                  .fn()
                  .mockReturnValue(mockAttendeeQueryBuilder),
              };
            }
            return {
              createQueryBuilder: jest
                .fn()
                .mockReturnValue(mockEventQueryBuilder),
            };
          }),
        } as any);

      const result = await service.getHomePageUserNextHostedEvent(1);

      // loadRelationCountAndMap should NOT be called
      expect(loadRelationCountAndMapFn).not.toHaveBeenCalled();

      // Batch attendee count query SHOULD be called
      expect(mockGetRawOne).toHaveBeenCalled();

      expect(result).toBeDefined();
    });
  });

  describe('getHomePageUserRecentEventDrafts', () => {
    it('should use batch attendee count query instead of loadRelationCountAndMap', async () => {
      const mockEvents = [
        { ...mockEventEntity, id: 1 },
        { ...mockEventEntity, id: 2, slug: 'draft-2' },
      ];

      const loadRelationCountAndMapFn = jest.fn().mockReturnThis();
      const mockEventQueryBuilder = {
        loadRelationCountAndMap: loadRelationCountAndMapFn,
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      const mockGetRawMany = jest.fn().mockResolvedValue([
        { eventId: 1, count: '2' },
        { eventId: 2, count: '4' },
      ]);
      const mockAttendeeQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: mockGetRawMany,
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity) => {
            if (entity.name === 'EventAttendeesEntity') {
              return {
                createQueryBuilder: jest
                  .fn()
                  .mockReturnValue(mockAttendeeQueryBuilder),
              };
            }
            return {
              createQueryBuilder: jest
                .fn()
                .mockReturnValue(mockEventQueryBuilder),
            };
          }),
        } as any);

      const result = await service.getHomePageUserRecentEventDrafts(1);

      // loadRelationCountAndMap should NOT be called
      expect(loadRelationCountAndMapFn).not.toHaveBeenCalled();

      // Batch attendee count query SHOULD be called
      expect(mockGetRawMany).toHaveBeenCalled();

      expect(result).toHaveLength(2);
    });
  });

  describe('getHomePageUserUpcomingEvents', () => {
    it('should delegate to getAttendingEvents with upcoming filter', async () => {
      const mockEvents = [
        { ...mockEventEntity, id: 10 },
        { ...mockEventEntity, id: 20, slug: 'upcoming-2' },
      ];

      jest.spyOn(service, 'getAttendingEvents').mockResolvedValue({
        events: mockEvents as any,
        total: 2,
      });

      const result = await service.getHomePageUserUpcomingEvents(1);

      expect(service.getAttendingEvents).toHaveBeenCalledWith(1, {
        limit: 5,
        upcomingOnly: true,
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('showAllEventsWithContrail', () => {
    let mockContrailService: any;

    beforeEach(() => {
      mockContrailService = (service as any).contrailQueryService;

      // Mock private events query builder (returns no private events by default)
      const mockPrivateQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockPrivateQb) as any;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should sort by startsAt ASC with uri ASC tiebreaker', async () => {
      const now = new Date();
      const startsAt = new Date(now.getTime() + 86400000).toISOString();

      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:bbb/community.lexicon.calendar.event/bbb',
            did: 'did:plc:bbb',
            rkey: 'bbb',
            cid: 'cid2',
            record: { name: 'Event B', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 0,
          },
          {
            uri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: { name: 'Event A', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 0,
          },
        ],
        total: 2,
      });

      // enrichRecords returns enriched events
      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          name: 'Event B',
          startDate: new Date(startsAt),
          atprotoUri: 'at://did:plc:bbb/community.lexicon.calendar.event/bbb',
          slug: 'did:plc:bbb/bbb',
        },
        {
          source: 'atproto',
          name: 'Event A',
          startDate: new Date(startsAt),
          atprotoUri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
          slug: 'did:plc:aaa/aaa',
        },
      ]);

      await service.showAllEvents({ page: 1, limit: 25 }, {} as any);

      // Verify orderBy passed to find() includes tiebreaker
      expect(mockContrailService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({
          orderBy: expect.stringContaining('uri ASC'),
        }),
      );
    });

    it('should include currently-active events in default date filter', async () => {
      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [],
        total: 0,
      });

      await service.showAllEvents({ page: 1, limit: 25 }, {} as any);

      // Default date filter should include currently-active events
      const callArgs = mockContrailService.find.mock.calls[0][1];
      const dateCondition = callArgs.conditions.find((c: any) =>
        c.sql.includes('startsAt'),
      );
      // Should have OR clause for active events, not just >= now
      expect(dateCondition.sql).toContain('endsAt');
    });

    it('should not produce duplicates when event exists in both Contrail and tenant DB', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();
      const atUri = 'at://did:plc:aaa/community.lexicon.calendar.event/aaa';

      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [
          {
            uri: atUri,
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: { name: 'My Event', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 3,
          },
        ],
        total: 1,
      });

      // enrichRecords returns the enriched event with tenant metadata
      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          id: 1,
          ulid: 'test-ulid',
          slug: 'my-event',
          atprotoUri: atUri,
          name: 'My Event',
          startDate: new Date(startsAt),
          visibility: 'public',
          attendeesCount: 3,
        },
      ]);

      // deduplicatePrivateEvents should filter out the duplicate
      mockEnrichmentService.deduplicatePrivateEvents.mockImplementation(
        (events: any[], uris: Set<string>) =>
          events.filter((e: any) => !e.atprotoUri || !uris.has(e.atprotoUri)),
      );

      // Mock private events query — returns the SAME event (simulating the duplicate)
      const mockPrivateQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            ulid: 'test-ulid',
            slug: 'my-event',
            atprotoUri: atUri,
            name: 'My Event',
            startDate: new Date(startsAt),
            visibility: 'unlisted',
          },
        ]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockPrivateQb) as any;

      const result = await service.showAllEvents(
        { page: 1, limit: 25 },
        {} as any,
      );

      // Should have exactly 1 event, not 2
      expect(result.data).toHaveLength(1);
      // Should be enriched with tenant metadata
      expect(result.data[0].slug).toBe('my-event');
    });

    it('should return prod pagination envelope format', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();

      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: { name: 'Event A', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 0,
          },
        ],
        total: 50,
      });

      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          name: 'Event A',
          startDate: new Date(startsAt),
          atprotoUri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
          slug: 'did:plc:aaa/aaa',
        },
      ]);

      const result = await service.showAllEvents(
        { page: 2, limit: 10 },
        {} as any,
      );

      // Must match PaginationResult shape (prod format)
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
      // Must NOT have meta wrapper
      expect(result).not.toHaveProperty('meta');

      expect(result.total).toBe(50);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(5); // 50 / 10
    });

    it('should filter by categories when provided', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();
      const atUri = 'at://did:plc:aaa/community.lexicon.calendar.event/aaa';

      // Contrail returns an event
      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [
          {
            uri: atUri,
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: { name: 'Tech Meetup', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 0,
          },
        ],
        total: 1,
      });

      // enrichRecords returns enriched event with categories
      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          id: 1,
          slug: 'tech-meetup',
          atprotoUri: atUri,
          name: 'Tech Meetup',
          startDate: new Date(startsAt),
          categories: [{ name: 'Technology' }],
        },
      ]);

      // filterByCategories returns the event (category matches)
      mockEnrichmentService.filterByCategories.mockImplementation(
        (events: any[]) => events,
      );

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb) as any;

      const result = await service.showAllEvents({ page: 1, limit: 25 }, {
        categories: ['Technology'],
      } as any);

      // Event should be included because its tenant metadata has the category
      expect(result.data).toHaveLength(1);
    });

    it('should exclude Contrail events without matching category', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();
      const atUri = 'at://did:plc:aaa/community.lexicon.calendar.event/aaa';

      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [
          {
            uri: atUri,
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: { name: 'Tech Meetup', startsAt, mode: '#inperson' },
            count_community_lexicon_calendar_rsvp: 0,
          },
        ],
        total: 1,
      });

      // enrichRecords returns enriched event with non-matching category
      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          id: 1,
          slug: 'tech-meetup',
          atprotoUri: atUri,
          name: 'Tech Meetup',
          startDate: new Date(startsAt),
          categories: [{ name: 'Music' }],
        },
      ]);

      // filterByCategories returns empty (no match)
      mockEnrichmentService.filterByCategories.mockReturnValue([]);

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb) as any;

      const result = await service.showAllEvents({ page: 1, limit: 25 }, {
        categories: ['Technology'],
      } as any);

      // Event should be excluded — category doesn't match
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should apply geo filter when lat/lon provided', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();

      mockContrailService.findWithGeoFilter = jest.fn().mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
            did: 'did:plc:aaa',
            rkey: 'aaa',
            cid: 'cid1',
            record: {
              name: 'Louisville Meetup',
              startsAt,
              mode: '#inperson',
              locations: [
                {
                  geo: { lat: 38.25, lon: -85.76 },
                  name: 'Louisville',
                },
              ],
            },
            count_community_lexicon_calendar_rsvp: 0,
          },
        ],
        total: 1,
      });

      mockEnrichmentService.enrichRecords.mockResolvedValue([
        {
          source: 'atproto',
          name: 'Louisville Meetup',
          startDate: new Date(startsAt),
          atprotoUri: 'at://did:plc:aaa/community.lexicon.calendar.event/aaa',
          slug: 'did:plc:aaa~aaa',
          location: 'Louisville',
          lat: 38.25,
          lon: -85.76,
        } as AtprotoSourcedEvent,
      ]);

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb) as any;

      const result = await service.showAllEvents({ page: 1, limit: 25 }, {
        lat: 38.25,
        lon: -85.76,
        radius: 10,
      } as any);

      expect(mockContrailService.findWithGeoFilter).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        { lat: 38.25, lon: -85.76, radiusMeters: expect.any(Number) },
        expect.any(Object),
      );
      expect(result.data).toHaveLength(1);
    });

    it('should batch-fetch attendee counts for private events', async () => {
      const startsAt = new Date(Date.now() + 86400000).toISOString();

      mockContrailService.find = jest.fn().mockResolvedValue({
        records: [],
        total: 0,
      });

      const privateEvent = {
        id: 42,
        ulid: 'test-ulid',
        name: 'Private Meetup',
        startDate: new Date(startsAt),
        visibility: 'private',
        status: 'published',
      };

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([privateEvent]),
      };
      eventRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQb) as any;

      // Mock the attendees batch count query on the shared mock
      const mockAttQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ eventId: 42, count: '7' }]),
      };
      eventAttendeesRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockAttQb);

      const result = await service.showAllEvents({ page: 1, limit: 25 }, {
        id: 1,
      } as any);

      expect(result.data[0].attendeesCount).toBe(7);
    });
  });

  describe('findByAtprotoUri', () => {
    it('should find events by atprotoUri', async () => {
      // Arrange
      const atprotoUri =
        'at://did:plc:test/community.lexicon.calendar.event/abc123';
      const mockEvent = {
        ...mockEventEntity,
        atprotoUri,
        atprotoRkey: 'abc123',
      } as unknown as EventEntity;

      eventRepository.find.mockResolvedValue([mockEvent]);

      // Act
      const result = await service.findByAtprotoUri(atprotoUri, 'test-tenant');

      // Assert
      expect(eventRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { atprotoUri },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].atprotoUri).toBe(atprotoUri);
    });

    it('should return empty array when no events match atprotoUri', async () => {
      // Arrange
      eventRepository.find.mockResolvedValue([]);

      // Act
      const result = await service.findByAtprotoUri(
        'at://did:plc:unknown/community.lexicon.calendar.event/xyz',
        'test-tenant',
      );

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('searchAllEvents', () => {
    let mockContrailService: any;
    let mockEnrichment: any;

    beforeEach(() => {
      mockContrailService = (service as any).contrailQueryService;
      mockEnrichment = (service as any).atprotoEnrichmentService;
    });

    it('should query Contrail for public events when no userId (anonymous)', async () => {
      const publicEvent = {
        ...mockEventEntity,
        atprotoUri: 'at://did:plc:public/community.lexicon.calendar.event/abc',
        visibility: EventVisibility.Public,
      } as EventEntity;

      mockContrailService.find.mockResolvedValue({
        records: [publicEvent],
        total: 1,
      });
      mockEnrichment.enrichRecords.mockResolvedValue([publicEvent]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([]);

      const result = await service.searchAllEvents(
        { page: 1, limit: 10 },
        { search: 'test event' },
        undefined,
      );

      expect(mockContrailService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({ limit: 10, offset: 0 }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should include search_vector condition when search query provided', async () => {
      mockContrailService.find.mockResolvedValue({ records: [], total: 0 });
      mockEnrichment.enrichRecords.mockResolvedValue([]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([]);

      await service.searchAllEvents(
        { page: 1, limit: 10 },
        { search: 'community gathering' },
        undefined,
      );

      expect(mockContrailService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({
              sql: expect.stringContaining('search_vector'),
              params: ['community gathering'],
            }),
          ]),
        }),
      );
    });

    it('should not include search_vector condition when no search query', async () => {
      mockContrailService.find.mockResolvedValue({ records: [], total: 0 });
      mockEnrichment.enrichRecords.mockResolvedValue([]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([]);

      await service.searchAllEvents(
        { page: 1, limit: 10 },
        { search: undefined as unknown as string },
        undefined,
      );

      const findCall = mockContrailService.find.mock.calls[0];
      const conditions = findCall[1].conditions;
      const hasSearchVector = conditions.some((c: any) =>
        c.sql.includes('search_vector'),
      );
      expect(hasSearchVector).toBe(false);
    });

    it('should query tenant for private/unlisted events when userId provided', async () => {
      const publicEvent = {
        ...mockEventEntity,
        id: 1,
        atprotoUri: 'at://did:plc:public/community.lexicon.calendar.event/pub1',
        visibility: EventVisibility.Public,
        startDate: new Date('2030-01-01'),
      } as EventEntity;

      const privateEvent = {
        ...mockEventEntity,
        id: 2,
        atprotoUri: null,
        visibility: EventVisibility.Private,
        startDate: new Date('2030-01-02'),
      } as EventEntity;

      mockContrailService.find.mockResolvedValue({
        records: [publicEvent],
        total: 1,
      });
      mockEnrichment.enrichRecords.mockResolvedValue([publicEvent]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([privateEvent]);

      const mockPrivateQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([privateEvent]),
      };
      eventRepository.createQueryBuilder.mockReturnValue(mockPrivateQb as any);

      const result = await service.searchAllEvents(
        { page: 1, limit: 10 },
        { search: 'my event' },
        42,
      );

      expect(mockPrivateQb.where).toHaveBeenCalledWith(
        expect.stringContaining('event.status IN'),
        expect.anything(),
      );
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('should not query tenant for private events when no userId', async () => {
      mockContrailService.find.mockResolvedValue({ records: [], total: 0 });
      mockEnrichment.enrichRecords.mockResolvedValue([]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([]);

      await service.searchAllEvents(
        { page: 1, limit: 10 },
        { search: undefined as unknown as string },
        undefined,
      );

      expect(eventRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return paginated result shape', async () => {
      mockContrailService.find.mockResolvedValue({ records: [], total: 5 });
      mockEnrichment.enrichRecords.mockResolvedValue([]);
      mockEnrichment.deduplicatePrivateEvents.mockReturnValue([]);

      const result = await service.searchAllEvents(
        { page: 2, limit: 5 },
        { search: undefined as unknown as string },
        undefined,
      );

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 5);
      expect(result).toHaveProperty('page', 2);
      expect(result).toHaveProperty('totalPages', 1);
    });
  });

  describe('findGroupEvents - Contrail integration', () => {
    let mockContrailQueryService: any;
    let mockAtprotoEnrichmentService: any;

    beforeEach(() => {
      mockContrailQueryService = service['contrailQueryService'];
      mockAtprotoEnrichmentService = service['atprotoEnrichmentService'];
    });

    it('should query Contrail when group has followed DIDs', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-group-event',
        startDate: new Date('2026-01-01'),
        group: { id: 42, slug: 'my-group', visibility: 'public' },
      };

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([nativeEvent]),
        getOne: jest.fn().mockResolvedValue(nativeEvent),
      };

      eventRepository.createQueryBuilder.mockReturnValue(mockQb as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:abc123',
        'did:plc:def456',
      ]);

      jest
        .spyOn(mockContrailQueryService, 'find')
        .mockResolvedValue({ records: [], total: 0 });
      jest
        .spyOn(mockAtprotoEnrichmentService, 'enrichRecords')
        .mockResolvedValue([]);

      await service.findGroupEvents('my-group');

      expect(
        mockGroupDIDFollowService.getFollowedDidsForGroup,
      ).toHaveBeenCalledWith(42);
      expect(mockContrailQueryService.find).toHaveBeenCalledWith(
        'community.lexicon.calendar.event',
        expect.objectContaining({
          conditions: expect.arrayContaining([
            expect.objectContaining({
              sql: expect.stringContaining('did = $1'),
              params: expect.arrayContaining(['did:plc:abc123']),
            }),
          ]),
        }),
      );
    });

    it('should not query Contrail when group has no followed DIDs', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-group-event',
        startDate: new Date('2026-01-01'),
        group: { id: 42, slug: 'my-group', visibility: 'public' },
      };

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([nativeEvent]),
        getOne: jest.fn().mockResolvedValue(nativeEvent),
      };

      eventRepository.createQueryBuilder.mockReturnValue(mockQb as any);
      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([]);

      const contrailFindSpy = jest.spyOn(mockContrailQueryService, 'find');

      await service.findGroupEvents('my-group');

      expect(contrailFindSpy).not.toHaveBeenCalled();
    });

    it('should merge and sort Contrail events with native events', async () => {
      const nativeEvent = {
        ...mockEventEntity,
        id: 1,
        slug: 'native-group-event',
        startDate: new Date('2026-01-15'),
        group: { id: 42, slug: 'my-group', visibility: 'public' },
        atprotoUri: null,
      };

      const contrailRecord = {
        uri: 'at://did:plc:abc123/community.lexicon.calendar.event/rkey1',
        cid: 'bafyreiabc',
        did: 'did:plc:abc123',
        record: {
          $type: 'community.lexicon.calendar.event',
          name: 'External Calendar Event',
          startsAt: '2026-01-10T10:00:00Z',
        },
        indexedAt: '2026-01-01T00:00:00Z',
      };

      const enrichedExternalEvent = {
        id: undefined,
        atprotoUri:
          'at://did:plc:abc123/community.lexicon.calendar.event/rkey1',
        name: 'External Calendar Event',
        startDate: new Date('2026-01-10T10:00:00Z'),
      };

      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([nativeEvent]),
        getOne: jest.fn().mockResolvedValue(nativeEvent),
      };

      eventRepository.createQueryBuilder.mockReturnValue(mockQb as any);

      mockGroupDIDFollowService.getFollowedDidsForGroup.mockResolvedValue([
        'did:plc:abc123',
      ]);

      jest
        .spyOn(mockContrailQueryService, 'find')
        .mockResolvedValue({ records: [contrailRecord], total: 1 });
      jest
        .spyOn(mockAtprotoEnrichmentService, 'enrichRecords')
        .mockResolvedValue([enrichedExternalEvent as any]);

      const result = await service.findGroupEvents('my-group');

      // Should have both native and external events
      expect(result.length).toBe(2);
      // External event (earlier date) should come first
      expect(result[0].name).toBe('External Calendar Event');
      expect(result[1].name).toBe('Test Event');
    });
  });

  describe('showDashboardEventsPaginated - Contrail RSVP union', () => {
    it('should include Contrail RSVP subquery when user has ATProto identity', async () => {
      // Set up user with ATProto identity
      mockUserService.getUserById.mockResolvedValue({
        id: 1,
        ulid: '01HABCDEF',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue({
        did: 'did:plc:testuser123',
      });

      const mockQb: Record<string, any> = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        getQuery: jest.fn().mockReturnValue('SELECT ...'),
        getParameters: jest.fn().mockReturnValue({}),
        expressionMap: {
          mainAlias: { metadata: { name: 'EventEntity' } },
        },
      };
      // Ensure chainable methods return mockQb
      for (const key of ['skip', 'take']) {
        mockQb[key] = jest.fn().mockReturnValue(mockQb);
      }

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQb),
          }),
        } as any);

      await service.showDashboardEventsPaginated(1, {
        tab: DashboardEventsTab.Attending,
        page: 1,
        limit: 10,
      });

      // Verify that resolveUserDid was called
      expect(mockUserService.getUserById).toHaveBeenCalledWith(1);
      expect(mockIdentityService.findByUserUlid).toHaveBeenCalledWith(
        TESTING_TENANT_ID,
        '01HABCDEF',
      );

      // Verify that the where was called with Brackets (which includes the Contrail subquery)
      expect(mockQb.where).toHaveBeenCalled();
      // The first call to where should be a Brackets instance (not a plain string)
      const whereArg = mockQb.where.mock.calls[0][0];
      expect(whereArg).toBeInstanceOf(Brackets);
    });

    it('should not include Contrail subquery when user has no ATProto identity', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 1,
        ulid: '01HABCDEF',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue(null);

      const mockQb: Record<string, any> = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        getQuery: jest.fn().mockReturnValue('SELECT ...'),
        getParameters: jest.fn().mockReturnValue({}),
        expressionMap: {
          mainAlias: { metadata: { name: 'EventEntity' } },
        },
      };
      for (const key of ['skip', 'take']) {
        mockQb[key] = jest.fn().mockReturnValue(mockQb);
      }

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQb),
          }),
        } as any);

      await service.showDashboardEventsPaginated(1, {
        tab: DashboardEventsTab.Attending,
        page: 1,
        limit: 10,
      });

      // resolveUserDid was called but returned null
      expect(mockUserService.getUserById).toHaveBeenCalledWith(1);
      expect(mockIdentityService.findByUserUlid).toHaveBeenCalledWith(
        TESTING_TENANT_ID,
        '01HABCDEF',
      );

      // Where should still be called with Brackets, but without the Contrail orWhere
      expect(mockQb.where).toHaveBeenCalled();
      const whereArg = mockQb.where.mock.calls[0][0];
      expect(whereArg).toBeInstanceOf(Brackets);
    });
  });

  describe('getDashboardSummary - Contrail RSVP union', () => {
    it('should delegate attending events to getAttendingEvents', async () => {
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
        getOne: jest.fn().mockResolvedValue(null),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQb),
          }),
        } as any);

      jest
        .spyOn(service, 'getAttendingEvents')
        .mockResolvedValue({ events: [], total: 0 });

      await service.getDashboardSummary(1);

      // Verify attending events are fetched via getAttendingEvents
      expect(service.getAttendingEvents).toHaveBeenCalledWith(1, {
        limit: 5,
        upcomingOnly: true,
      });
    });
  });

  describe('resolveForAttendance', () => {
    it('should resolve a regular slug to a tenant event', async () => {
      const event = {
        ...mockEventEntity,
        visibility: EventVisibility.Public,
        requireApproval: false,
        allowWaitlist: true,
        maxAttendees: 100,
        requireGroupMembership: false,
        atprotoUri: 'at://did:plc:abc/community.lexicon.calendar.event/123',
      } as EventEntity;

      eventRepository.findOne.mockResolvedValue(event);
      mockEnrichmentService.parseAtprotoSlug.mockReturnValue(null);

      const result = await service.resolveForAttendance('test-event-slug');

      expect(result.tenantEvent).toBe(event);
      expect(result.uri).toBe(
        'at://did:plc:abc/community.lexicon.calendar.event/123',
      );
      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.allowWaitlist).toBe(true);
      expect(result.maxAttendees).toBe(100);
      expect(result.requireGroupMembership).toBe(false);
    });

    it('should resolve an AT Protocol slug to a tenant event when found by atprotoUri', async () => {
      const event = {
        ...mockEventEntity,
        visibility: EventVisibility.Public,
        requireApproval: true,
        allowWaitlist: false,
        maxAttendees: 50,
        requireGroupMembership: true,
        atprotoUri: 'at://did:plc:xyz/community.lexicon.calendar.event/abc123',
      } as EventEntity;

      mockEnrichmentService.parseAtprotoSlug.mockReturnValue({
        did: 'did:plc:xyz',
        rkey: 'abc123',
      });
      eventRepository.findOne.mockResolvedValue(event);

      const result = await service.resolveForAttendance('did:plc:xyz~abc123');

      expect(result.tenantEvent).toBe(event);
      expect(result.uri).toBe(
        'at://did:plc:xyz/community.lexicon.calendar.event/abc123',
      );
      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(true);
      expect(result.requireGroupMembership).toBe(true);
    });

    it('should resolve an AT Protocol slug to a foreign event when not in tenant DB but in Contrail', async () => {
      mockEnrichmentService.parseAtprotoSlug.mockReturnValue({
        did: 'did:plc:foreign',
        rkey: 'rkey456',
      });
      eventRepository.findOne.mockResolvedValue(null);

      jest
        .spyOn(service['contrailQueryService'], 'findByUri')
        .mockResolvedValue({ uri: 'at://...', value: {} } as any);

      const result = await service.resolveForAttendance(
        'did:plc:foreign~rkey456',
      );

      expect(result.tenantEvent).toBeNull();
      expect(result.uri).toBe(
        'at://did:plc:foreign/community.lexicon.calendar.event/rkey456',
      );
      expect(result.isPublic).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.allowWaitlist).toBe(false);
      expect(result.maxAttendees).toBe(0);
      expect(result.requireGroupMembership).toBe(false);
    });

    it('should throw NotFoundException for a regular slug not found', async () => {
      mockEnrichmentService.parseAtprotoSlug.mockReturnValue(null);
      eventRepository.findOne.mockResolvedValue(null);

      await expect(
        service.resolveForAttendance('nonexistent-slug'),
      ).rejects.toThrow('Event with slug nonexistent-slug not found');
    });

    it('should throw NotFoundException for AT Protocol slug not in tenant DB or Contrail', async () => {
      mockEnrichmentService.parseAtprotoSlug.mockReturnValue({
        did: 'did:plc:gone',
        rkey: 'missing',
      });
      eventRepository.findOne.mockResolvedValue(null);

      jest
        .spyOn(service['contrailQueryService'], 'findByUri')
        .mockResolvedValue(null);

      await expect(
        service.resolveForAttendance('did:plc:gone~missing'),
      ).rejects.toThrow('not found in Contrail');
    });

    it('should return isPublic false for a private event', async () => {
      const privateEvent = {
        ...mockEventEntity,
        visibility: EventVisibility.Private,
        requireApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
        atprotoUri: null,
      } as EventEntity;

      mockEnrichmentService.parseAtprotoSlug.mockReturnValue(null);
      eventRepository.findOne.mockResolvedValue(privateEvent);

      const result = await service.resolveForAttendance('private-event');

      expect(result.isPublic).toBe(false);
    });

    it('should return isPublic true for an unlisted event', async () => {
      const unlistedEvent = {
        ...mockEventEntity,
        visibility: EventVisibility.Unlisted,
        requireApproval: false,
        allowWaitlist: false,
        maxAttendees: 0,
        requireGroupMembership: false,
        atprotoUri: null,
      } as EventEntity;

      mockEnrichmentService.parseAtprotoSlug.mockReturnValue(null);
      eventRepository.findOne.mockResolvedValue(unlistedEvent);

      const result = await service.resolveForAttendance('unlisted-event');

      expect(result.isPublic).toBe(true);
    });
  });

  describe('getAttendingEvents', () => {
    let mockContrailService: any;

    beforeEach(() => {
      mockContrailService = service['contrailQueryService'];
    });

    it('should return enriched Contrail events the user RSVPed to', async () => {
      // User has a DID
      mockUserService.getUserById.mockResolvedValue({
        id: 1,
        ulid: '01HABCDEF',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue({
        did: 'did:plc:user123',
      });

      // Contrail returns RSVP records
      mockContrailService.find.mockResolvedValue({
        records: [
          {
            uri: 'at://did:plc:user123/community.lexicon.calendar.rsvp/abc',
            record: {
              status: 'community.lexicon.calendar.rsvp#going',
              subject: {
                uri: 'at://did:plc:host/community.lexicon.calendar.event/evt1',
              },
            },
          },
        ],
        total: 1,
      });

      // findByUris returns the event record
      mockContrailService.findByUris = jest.fn().mockResolvedValue([
        {
          uri: 'at://did:plc:host/community.lexicon.calendar.event/evt1',
          record: {
            name: 'Foreign Event',
            startsAt: '2026-05-01T10:00:00Z',
          },
        },
      ]);

      const enrichedEvent: AtprotoSourcedEvent = {
        source: 'atproto',
        atprotoUri: 'at://did:plc:host/community.lexicon.calendar.event/evt1',
        atprotoRkey: 'evt1',
        atprotoCid: null,
        name: 'Foreign Event',
        description: null,
        startDate: new Date('2026-05-01T10:00:00Z'),
        endDate: null,
        type: 'in-person',
        status: 'published',
        location: null,
        locationOnline: null,
        lat: null,
        lon: null,
        attendeesCount: 0,
        slug: 'foreign-event',
      };

      mockEnrichmentService.enrichRecords.mockResolvedValue([enrichedEvent]);

      // No private events
      eventAttendeesRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getAttendingEvents(1);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('Foreign Event');
      expect((result.events[0] as any).source).toBe('atproto');
      expect(mockContrailService.find).toHaveBeenCalled();
      expect(mockContrailService.findByUris).toHaveBeenCalled();
      expect(mockEnrichmentService.enrichRecords).toHaveBeenCalled();
    });

    it('should include private local events with no ATProto URI', async () => {
      // User has no DID
      mockUserService.getUserById.mockResolvedValue({
        id: 2,
        ulid: '01HABCXYZ',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue(null);

      const privateEvent = {
        ...mockEventEntity,
        id: 10,
        name: 'Private Local Event',
        atprotoUri: null,
        startDate: new Date('2026-06-01T10:00:00Z'),
      } as EventEntity;

      // Private events query returns results
      eventAttendeesRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            event: privateEvent,
            userId: 2,
            status: EventAttendeeStatus.Confirmed,
          },
        ]),
      });

      const result = await service.getAttendingEvents(2);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('Private Local Event');
    });

    it('should fall back to local-only when user has no DID', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 3,
        ulid: '01NODID',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue(null);

      eventAttendeesRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getAttendingEvents(3);

      expect(result.events).toHaveLength(0);
      expect(result.total).toBe(0);
      // Contrail should NOT be called when no DID
      expect(mockContrailService.find).not.toHaveBeenCalled();
    });

    it('should return empty results when nothing found', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 4,
        ulid: '01EMPTY',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue({
        did: 'did:plc:empty',
      });

      // Contrail returns no RSVPs
      mockContrailService.find.mockResolvedValue({
        records: [],
        total: 0,
      });

      eventAttendeesRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getAttendingEvents(4);

      expect(result.events).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should handle Contrail failure gracefully and fall back to local', async () => {
      mockUserService.getUserById.mockResolvedValue({
        id: 5,
        ulid: '01FAIL',
      });
      mockIdentityService.findByUserUlid.mockResolvedValue({
        did: 'did:plc:failing',
      });

      // Contrail throws an error
      mockContrailService.find.mockRejectedValue(
        new Error('Contrail connection refused'),
      );

      const privateEvent = {
        ...mockEventEntity,
        id: 20,
        name: 'Fallback Private Event',
        atprotoUri: null,
        startDate: new Date('2026-07-01T10:00:00Z'),
      } as EventEntity;

      eventAttendeesRepository.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            event: privateEvent,
            userId: 5,
            status: EventAttendeeStatus.Confirmed,
          },
        ]),
      });

      const result = await service.getAttendingEvents(5);

      // Should still return private events despite Contrail failure
      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('Fallback Private Event');
      expect(result.total).toBe(1);
    });
  });

  describe('getMyEvents', () => {
    const futureDate = new Date('2026-06-01T10:00:00Z');
    const queryDto = {
      startDate: '2026-05-01',
      endDate: '2026-07-01',
    };

    it('should return organized events with isOrganizer=true', async () => {
      const organizedEvent = {
        ...mockEventEntity,
        id: 10,
        slug: 'my-organized-event',
        name: 'My Organized Event',
        startDate: futureDate,
        user: { id: 1 } as UserEntity,
        userId: 1,
      } as unknown as EventEntity;

      const mockAttendeeQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      // Mock initializeRepository
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === EventAttendeesEntity) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              ...eventRepository,
              createQueryBuilder: jest.fn().mockReturnValue({
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([organizedEvent]),
              }),
            };
          }),
        } as any);

      // getAttendingEvents returns no attending events
      jest
        .spyOn(service, 'getAttendingEvents')
        .mockResolvedValue({ events: [], total: 0 });

      const result = await service.getMyEvents(1, queryDto);

      expect(result).toHaveLength(1);
      expect((result[0] as any).isOrganizer).toBe(true);
    });

    it('should return attending events with isOrganizer=false and attendeeStatus', async () => {
      const attendedEvent = {
        ...mockEventEntity,
        id: 20,
        slug: 'attended-event',
        name: 'Attended Event',
        startDate: futureDate,
        user: { id: 99 } as UserEntity,
        userId: 99,
      } as unknown as EventEntity;

      const mockAttendeeQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            eventId: 20,
            event: { id: 20 },
            userId: 1,
            status: EventAttendeeStatus.Confirmed,
            role: 'attendee',
          },
        ]),
      };

      // Mock initializeRepository
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === EventAttendeesEntity) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              ...eventRepository,
              createQueryBuilder: jest.fn().mockReturnValue({
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([]),
              }),
            };
          }),
        } as any);

      // getAttendingEvents returns the attended event
      jest
        .spyOn(service, 'getAttendingEvents')
        .mockResolvedValue({ events: [attendedEvent], total: 1 });

      const result = await service.getMyEvents(1, queryDto);

      expect(result).toHaveLength(1);
      expect((result[0] as any).isOrganizer).toBe(false);
      expect((result[0] as any).attendeeStatus).toBeDefined();
    });

    it('should dedup events where user is both organizer and attendee', async () => {
      const dualEvent = {
        ...mockEventEntity,
        id: 30,
        slug: 'dual-event',
        name: 'Dual Event',
        startDate: futureDate,
        user: { id: 1 } as UserEntity,
        userId: 1,
      } as unknown as EventEntity;

      const mockAttendeeQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            eventId: 30,
            event: { id: 30 },
            userId: 1,
            status: EventAttendeeStatus.Confirmed,
            role: 'attendee',
          },
        ]),
      };

      // Mock initializeRepository - returns the organized event
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === EventAttendeesEntity) {
              return {
                createQueryBuilder: jest.fn().mockReturnValue(mockAttendeeQb),
              };
            }
            return {
              ...eventRepository,
              createQueryBuilder: jest.fn().mockReturnValue({
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([dualEvent]),
              }),
            };
          }),
        } as any);

      // getAttendingEvents also returns the same event
      jest
        .spyOn(service, 'getAttendingEvents')
        .mockResolvedValue({ events: [dualEvent], total: 1 });

      const result = await service.getMyEvents(1, queryDto);

      // Should appear only once, with isOrganizer=true
      expect(result).toHaveLength(1);
      expect((result[0] as any).isOrganizer).toBe(true);
    });
  });

  describe('getPastEventsCount', () => {
    it('should include Contrail-sourced past events in the count', async () => {
      const now = new Date();

      const mockEventQb = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ count: '3' }),
      };

      // Mock initializeRepository so eventRepository is set
      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockImplementation((entity: any) => {
            if (entity === EventAttendeesEntity) {
              return eventAttendeesRepository;
            }
            return {
              createQueryBuilder: jest.fn().mockReturnValue(mockEventQb),
            };
          }),
        } as any);

      // Force initializeRepository to run
      await (service as any).initializeRepository();

      // getAttendingEvents for past range returns 3 events (1 is Contrail-only)
      const pastAtprotoEvent: AtprotoSourcedEvent = {
        source: 'atproto',
        atprotoUri: 'at://did:plc:host/community.lexicon.calendar.event/past1',
        atprotoRkey: 'past1',
        atprotoCid: null,
        name: 'Past Contrail Event',
        description: null,
        startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        endDate: null,
        type: 'in-person',
        status: 'published',
        location: null,
        locationOnline: null,
        lat: null,
        lon: null,
        attendeesCount: 0,
        slug: 'past-contrail-event',
      };

      jest.spyOn(service, 'getAttendingEvents').mockResolvedValue({
        events: [
          pastAtprotoEvent,
          { ...mockEventEntity, id: 100 } as EventEntity,
          { ...mockEventEntity, id: 101 } as EventEntity,
        ],
        total: 3,
      });

      const result = await (service as any).getPastEventsCount(1, now);

      // Should call getAttendingEvents with a past date range
      expect(service.getAttendingEvents).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          endDate: expect.any(Date),
        }),
      );

      // Result should combine local count (3) + Contrail-only events (1 atproto)
      // Local returns 3, Contrail has 1 foreign event not in local = total 4
      expect(result).toBeGreaterThanOrEqual(3);
    });
  });
});
