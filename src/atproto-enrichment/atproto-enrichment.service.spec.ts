import { Test, TestingModule } from '@nestjs/testing';
import { AtprotoEnrichmentService } from './atproto-enrichment.service';
import { AtprotoHandleCacheService } from '../bluesky/atproto-handle-cache.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { ContrailRecord } from '../contrail/contrail-record.types';
import { AtprotoSourcedEvent } from './types/enriched-event.types';

describe('AtprotoEnrichmentService', () => {
  let service: AtprotoEnrichmentService;
  let mockHandleCacheService: Partial<AtprotoHandleCacheService>;
  let mockTenantConnectionService: Partial<TenantConnectionService>;

  beforeEach(async () => {
    mockHandleCacheService = {
      resolveHandles: jest.fn().mockResolvedValue(new Map()),
    };
    mockTenantConnectionService = {
      getTenantConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AtprotoEnrichmentService,
        {
          provide: AtprotoHandleCacheService,
          useValue: mockHandleCacheService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<AtprotoEnrichmentService>(AtprotoEnrichmentService);
  });

  describe('parseAtprotoSlug', () => {
    it('should parse valid did:plc slug', () => {
      const result = service.parseAtprotoSlug('did:plc:abc123~rkey456');
      expect(result).toEqual({ did: 'did:plc:abc123', rkey: 'rkey456' });
    });

    it('should parse valid did:web slug', () => {
      const result = service.parseAtprotoSlug('did:web:example.com~rkey456');
      expect(result).toEqual({ did: 'did:web:example.com', rkey: 'rkey456' });
    });

    it('should return null for normal event slug', () => {
      const result = service.parseAtprotoSlug('normal-event-slug');
      expect(result).toBeNull();
    });

    it('should return null for old slash format', () => {
      const result = service.parseAtprotoSlug('did:plc:abc123/rkey456');
      expect(result).toBeNull();
    });

    it('should return null for slug with empty rkey after tilde', () => {
      const result = service.parseAtprotoSlug('did:plc:abc~');
      expect(result).toBeNull();
    });
  });

  describe('mapAtprotoToEvent', () => {
    const baseRecord: ContrailRecord = {
      uri: 'at://did:plc:abc/community.lexicon.calendar.event/tid1',
      did: 'did:plc:abc',
      rkey: 'tid1',
      cid: 'bafyabc',
      record: {
        name: 'Test Event',
        description: 'A test',
        startsAt: '2026-04-01T10:00:00Z',
        endsAt: '2026-04-01T12:00:00Z',
        mode: 'community.lexicon.calendar.event#inperson',
        locations: [
          { name: 'Louisville', latitude: '38.25', longitude: '-85.76' },
        ],
      },
      time_us: '1000000',
      indexed_at: '2000000',
      count_community_lexicon_calendar_rsvp: 5,
    };

    it('should map ATProto record to AtprotoSourcedEvent without tenant data', () => {
      const result = service.mapAtprotoToEvent(
        baseRecord,
        undefined,
        'alice.bsky.social',
      );

      expect(result.source).toBe('atproto');
      expect(result.name).toBe('Test Event');
      expect(result.description).toBe('A test');
      expect(result.startDate).toEqual(new Date('2026-04-01T10:00:00Z'));
      expect(result.endDate).toEqual(new Date('2026-04-01T12:00:00Z'));
      expect(result.type).toBe('in-person');
      expect(result.atprotoUri).toBe(baseRecord.uri);
      expect(result.attendeesCount).toBe(5);
      expect(result.slug).toBe('did:plc:abc~tid1');
      expect(result.location).toBe('Louisville');
      expect(result.lat).toBe(38.25);
      expect(result.lon).toBe(-85.76);
      expect(result.user).toEqual({
        name: 'alice.bsky.social',
        slug: null,
      });
    });

    it('should merge tenant metadata when present', () => {
      const tenantEvent = {
        id: 42,
        ulid: 'ulid-123',
        slug: 'test-event-abc',
        group: { id: 1, name: 'Louisville Tech' } as any,
        image: { id: 1, path: '/img.jpg' } as any,
        categories: [{ id: 1, name: 'Tech' }] as any,
        series: null,
        seriesSlug: null,
        maxAttendees: 100,
        requireApproval: false,
        allowWaitlist: false,
        timeZone: 'America/New_York',
        conferenceData: null,
        visibility: 'public',
        user: { id: 1, name: 'Alice', slug: 'alice' } as any,
      } as any;

      const result = service.mapAtprotoToEvent(
        baseRecord,
        tenantEvent,
        undefined,
      );

      expect(result.source).toBe('atproto');
      expect(result.id).toBe(42);
      expect(result.slug).toBe('test-event-abc');
      expect(result.group).toEqual(tenantEvent.group);
      expect(result.image).toEqual(tenantEvent.image);
      expect(result.categories).toEqual(tenantEvent.categories);
      expect(result.user).toEqual(tenantEvent.user);
    });

    it('should map unknown mode to in-person', () => {
      const record = {
        ...baseRecord,
        record: { ...baseRecord.record, mode: 'some.unknown#mode' },
      };
      const result = service.mapAtprotoToEvent(record, undefined, undefined);
      expect(result.type).toBe('in-person');
    });

    it('should handle null record gracefully', () => {
      const record = { ...baseRecord, record: null };
      const result = service.mapAtprotoToEvent(record, undefined, undefined);
      expect(result.source).toBe('atproto');
      expect(result.name).toBeUndefined();
      expect(result.startDate).toBeNull();
    });

    it('should default attendeesCount to 0 when count column missing', () => {
      const record = { ...baseRecord };
      delete (record as any).count_community_lexicon_calendar_rsvp;
      const result = service.mapAtprotoToEvent(record, undefined, undefined);
      expect(result.attendeesCount).toBe(0);
    });
  });

  describe('enrichRecords', () => {
    it('should enrich records with tenant metadata and handles', async () => {
      const records: ContrailRecord[] = [
        {
          uri: 'at://did:plc:abc/col/tid1',
          did: 'did:plc:abc',
          rkey: 'tid1',
          cid: 'bafyabc',
          record: { name: 'Event 1', startsAt: '2026-04-01T10:00:00Z' },
          time_us: '1000',
          indexed_at: '2000',
          count_community_lexicon_calendar_rsvp: 3,
        },
        {
          uri: 'at://did:plc:xyz/col/tid2',
          did: 'did:plc:xyz',
          rkey: 'tid2',
          cid: 'bafyxyz',
          record: { name: 'Event 2', startsAt: '2026-04-02T10:00:00Z' },
          time_us: '1000',
          indexed_at: '2000',
          count_community_lexicon_calendar_rsvp: 0,
        },
      ];

      const tenantEvent = {
        id: 42,
        atprotoUri: 'at://did:plc:abc/col/tid1',
        slug: 'event-one',
        user: { name: 'Alice' },
      } as any;
      const mockRepo = { find: jest.fn().mockResolvedValue([tenantEvent]) };
      const mockDs = { getRepository: jest.fn().mockReturnValue(mockRepo) };
      (
        mockTenantConnectionService.getTenantConnection as jest.Mock
      ).mockResolvedValue(mockDs);
      (mockHandleCacheService.resolveHandles as jest.Mock).mockResolvedValue(
        new Map([['did:plc:xyz', 'xyz.bsky.social']]),
      );

      const result = await service.enrichRecords(records, 'test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('event-one');
      expect(result[0].id).toBe(42);
      expect(result[1].slug).toBe('did:plc:xyz~tid2');
      expect(result[1].user).toEqual({
        name: 'xyz.bsky.social',
        slug: null,
      });
      expect(mockHandleCacheService.resolveHandles).toHaveBeenCalledWith([
        'did:plc:xyz',
      ]);
    });

    it('should return empty array for empty records', async () => {
      const result = await service.enrichRecords([], 'test-tenant');
      expect(result).toEqual([]);
    });

    it('should skip records that throw during mapping and log a warning', async () => {
      const goodRecord: ContrailRecord = {
        uri: 'at://did:plc:abc/col/tid1',
        did: 'did:plc:abc',
        rkey: 'tid1',
        cid: 'bafyabc',
        record: { name: 'Good Event', startsAt: '2026-04-01T10:00:00Z' },
        time_us: '1000',
        indexed_at: '2000',
        count_community_lexicon_calendar_rsvp: 3,
      };
      const badRecord: ContrailRecord = {
        uri: 'at://did:plc:xyz/col/tid2',
        did: 'did:plc:xyz',
        rkey: 'tid2',
        cid: 'bafyxyz',
        record: { name: 'Bad Event' },
        time_us: '1000',
        indexed_at: '2000',
        count_community_lexicon_calendar_rsvp: 0,
      };

      const mockRepo = { find: jest.fn().mockResolvedValue([]) };
      const mockDs = { getRepository: jest.fn().mockReturnValue(mockRepo) };
      (
        mockTenantConnectionService.getTenantConnection as jest.Mock
      ).mockResolvedValue(mockDs);
      (mockHandleCacheService.resolveHandles as jest.Mock).mockResolvedValue(
        new Map([
          ['did:plc:abc', 'abc.bsky.social'],
          ['did:plc:xyz', 'xyz.bsky.social'],
        ]),
      );

      // Make mapAtprotoToEvent throw for the bad record only
      const originalMap = service.mapAtprotoToEvent.bind(service);
      jest
        .spyOn(service, 'mapAtprotoToEvent')
        .mockImplementation((r, te, h) => {
          if (r.uri === badRecord.uri) {
            throw new Error('Cannot read properties of malformed record');
          }
          return originalMap(r, te, h);
        });

      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      const result = await service.enrichRecords(
        [goodRecord, badRecord],
        'test-tenant',
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Good Event');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('at://did:plc:xyz/col/tid2'),
      );
    });
  });

  describe('filterByCategories', () => {
    const makeEvent = (
      name: string,
      categories?: any[],
    ): AtprotoSourcedEvent => ({
      source: 'atproto',
      atprotoUri: `at://d/col/${name}`,
      atprotoRkey: name,
      atprotoCid: null,
      name,
      description: null,
      startDate: new Date(),
      endDate: null,
      type: 'in-person',
      status: 'published',
      location: null,
      locationOnline: null,
      lat: null,
      lon: null,
      attendeesCount: 0,
      slug: name,
      categories,
    });

    it('should keep records whose tenant metadata matches categories', () => {
      const events = [
        makeEvent('Tech Meetup', [{ id: 1, name: 'Technology' }]),
        makeEvent('Art Show', [{ id: 2, name: 'Art' }]),
        makeEvent('Foreign Event'),
      ];

      const result = service.filterByCategories(events, ['tech']);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tech Meetup');
    });

    it('should return all events when categories is empty', () => {
      const events = [makeEvent('A')];
      expect(service.filterByCategories(events, [])).toEqual(events);
      expect(service.filterByCategories(events, undefined)).toEqual(events);
    });
  });

  describe('deduplicatePrivateEvents', () => {
    it('should remove private events that already appear in ATProto results', () => {
      const atprotoUris = new Set(['at://did:plc:abc/col/tid1']);
      const privateEvents = [
        { id: 1, atprotoUri: 'at://did:plc:abc/col/tid1', slug: 'dup' },
        { id: 2, atprotoUri: null, slug: 'private-only' },
        {
          id: 3,
          atprotoUri: 'at://did:plc:xyz/col/tid9',
          slug: 'not-in-results',
        },
      ] as any[];

      const result = service.deduplicatePrivateEvents(
        privateEvents,
        atprotoUris,
      );

      expect(result).toHaveLength(2);
      expect(result.map((e: any) => e.slug)).toEqual([
        'private-only',
        'not-in-results',
      ]);
    });
  });
});
