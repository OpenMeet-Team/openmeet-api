import { Test, TestingModule } from '@nestjs/testing';
import { DIDApiService } from './did-api.service';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';
import { UserAtprotoIdentityService } from '../user-atproto-identity/user-atproto-identity.service';
import { REQUEST } from '@nestjs/core';
import {
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

describe('DIDApiService', () => {
  let service: DIDApiService;
  let mockGroupRepo: any;
  let mockGroupMemberRepo: any;
  let mockEventRepo: any;
  let mockEventAttendeeRepo: any;
  let mockTenantConnectionService: any;
  let mockUserAtprotoIdentityService: any;

  const mockRequest = { tenantId: 'test-tenant' };

  // Helper to create a chainable query builder mock
  function createQueryBuilderMock(returnValue: any = []) {
    const qb: any = {};
    const methods = [
      'innerJoin',
      'leftJoin',
      'leftJoinAndSelect',
      'innerJoinAndSelect',
      'loadRelationCountAndMap',
      'addSelect',
      'select',
      'where',
      'andWhere',
      'orWhere',
      'orderBy',
      'addOrderBy',
      'take',
      'skip',
      'groupBy',
      'limit',
    ];
    for (const method of methods) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue(returnValue);
    qb.getOne = jest.fn().mockResolvedValue(null);
    qb.getCount = jest.fn().mockResolvedValue(0);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getRawAndEntities = jest
      .fn()
      .mockResolvedValue({ entities: [], raw: [] });
    return qb;
  }

  beforeEach(async () => {
    mockGroupRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock()),
      findOne: jest.fn(),
    };
    mockGroupMemberRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock()),
      findOne: jest.fn(),
    };
    mockEventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock()),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    mockEventAttendeeRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock()),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };

    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn((entity: any) => {
          const name = entity.name || '';
          if (name === 'GroupEntity') return mockGroupRepo;
          if (name === 'GroupMemberEntity') return mockGroupMemberRepo;
          if (name === 'EventEntity') return mockEventRepo;
          if (name === 'EventAttendeesEntity') return mockEventAttendeeRepo;
          return {};
        }),
      }),
    };

    mockUserAtprotoIdentityService = {
      findByUserUlids: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DIDApiService,
        { provide: REQUEST, useValue: mockRequest },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: UserAtprotoIdentityService,
          useValue: mockUserAtprotoIdentityService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'file.driver') return 'local';
              if (key === 'app.backendDomain') return 'http://localhost:3000';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = await module.resolve<DIDApiService>(DIDApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMyGroups', () => {
    it('should return empty groups array when user has no memberships', async () => {
      const result = await service.getMyGroups(1);
      expect(result).toEqual({ groups: [] });
    });

    it('should call tenant connection service with correct tenant ID', async () => {
      await service.getMyGroups(1);
      expect(
        mockTenantConnectionService.getTenantConnection,
      ).toHaveBeenCalledWith('test-tenant');
    });
  });

  describe('getMyEvents', () => {
    it('should return empty events and null cursor when no events found', async () => {
      const result = await service.getMyEvents(1, {});
      expect(result).toEqual({ events: [], cursor: null });
    });

    it('should apply default limit of 50', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyEvents(1, {});

      // The service fetches limit + 1 to check for next page
      expect(qb.take).toHaveBeenCalledWith(51);
    });

    it('should use custom limit when provided', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyEvents(1, { limit: 10 });

      expect(qb.take).toHaveBeenCalledWith(11);
    });
  });

  describe('getEventBySlug', () => {
    it('should throw NotFoundException when event does not exist', async () => {
      mockEventRepo.findOne.mockResolvedValue(null);

      await expect(service.getEventBySlug(1, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for private event when user has no access', async () => {
      mockEventRepo.findOne.mockResolvedValue({
        id: 1,
        slug: 'private-event',
        visibility: 'private',
        group: { id: 10 },
      });
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockGroupMemberRepo.findOne.mockResolvedValue(null);

      await expect(service.getEventBySlug(1, 'private-event')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return event detail for public events without access check', async () => {
      const publicEvent = {
        id: 1,
        slug: 'public-event',
        name: 'Public Event',
        description: 'A public event',
        startDate: new Date(),
        endDate: new Date(),
        location: 'Test Location',
        locationOnline: null,
        type: 'in-person',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        user: null,
        categories: [],
        lat: null,
        lon: null,
        timeZone: 'UTC',
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(5);

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'public-event');

      expect(result.slug).toBe('public-event');
      expect(result.attendeesCount).toBe(5);
    });

    it('should include organizer (user) with displayName, did, handle, and avatar', async () => {
      const publicEvent = {
        id: 1,
        slug: 'event-with-organizer',
        name: 'Event With Organizer',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: null,
        locationOnline: null,
        type: 'in-person',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: 40.7128,
        lon: -74.006,
        timeZone: 'America/New_York',
        categories: [],
        user: {
          name: 'Jane Organizer',
          slug: 'jane-organizer-abc123',
          ulid: 'ulid-jane',
          photo: { path: 'avatars/jane.jpg' },
        },
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(0);
      mockUserAtprotoIdentityService.findByUserUlids.mockResolvedValue(
        new Map([
          ['ulid-jane', { did: 'did:plc:abc123', handle: 'jane.bsky.social' }],
        ]),
      );

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'event-with-organizer');

      expect(result.user).toEqual({
        did: 'did:plc:abc123',
        handle: 'jane.bsky.social',
        displayName: 'Jane Organizer',
        avatar: 'http://localhost:3000/avatars/jane.jpg',
      });
    });

    it('should include lat, lon, and timeZone', async () => {
      const publicEvent = {
        id: 1,
        slug: 'geo-event',
        name: 'Geo Event',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: 'NYC',
        locationOnline: null,
        type: 'in-person',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: 40.7128,
        lon: -74.006,
        timeZone: 'America/New_York',
        categories: [],
        user: null,
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(0);

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'geo-event');

      expect(result.lat).toBe(40.7128);
      expect(result.lon).toBe(-74.006);
      expect(result.timeZone).toBe('America/New_York');
    });

    it('should preserve zero values for lat and lon', async () => {
      const publicEvent = {
        id: 1,
        slug: 'zero-coords',
        name: 'Zero Coords',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: 'Gulf of Guinea',
        locationOnline: null,
        type: 'in-person',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: 0,
        lon: 0,
        timeZone: 'UTC',
        categories: [],
        user: null,
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(0);

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'zero-coords');

      expect(result.lat).toBe(0);
      expect(result.lon).toBe(0);
    });

    it('should include categories', async () => {
      const publicEvent = {
        id: 1,
        slug: 'categorized-event',
        name: 'Categorized Event',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: null,
        locationOnline: null,
        type: 'online',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: null,
        lon: null,
        timeZone: 'UTC',
        user: null,
        categories: [
          { name: 'Tech', slug: 'tech' },
          { name: 'Meetup', slug: 'meetup' },
        ],
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(0);

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'categorized-event');

      expect(result.categories).toEqual([
        { name: 'Tech', slug: 'tech' },
        { name: 'Meetup', slug: 'meetup' },
      ]);
    });

    it('should include attendees with user profiles and roles', async () => {
      const publicEvent = {
        id: 1,
        slug: 'event-with-attendees',
        name: 'Event With Attendees',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: null,
        locationOnline: null,
        type: 'online',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: null,
        lon: null,
        timeZone: 'UTC',
        user: null,
        categories: [],
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(2);

      // Mock attendee query
      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([
        {
          status: 'confirmed',
          role: { name: 'organizer' },
          user: {
            name: 'Alice',
            slug: 'alice-abc',
            ulid: 'ulid-alice',
            photo: { path: 'avatars/alice.jpg' },
          },
        },
        {
          status: 'confirmed',
          role: { name: 'attendee' },
          user: {
            name: 'Bob',
            slug: 'bob-xyz',
            ulid: 'ulid-bob',
            photo: null,
          },
        },
      ]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);
      mockUserAtprotoIdentityService.findByUserUlids.mockResolvedValue(
        new Map([
          ['ulid-alice', { did: 'did:plc:alice', handle: 'alice.bsky.social' }],
        ]),
      );

      const result = await service.getEventBySlug(1, 'event-with-attendees');

      expect(result.attendees).toHaveLength(2);
      expect(result.attendees[0]).toEqual({
        did: 'did:plc:alice',
        handle: 'alice.bsky.social',
        name: 'Alice',
        avatar: 'http://localhost:3000/avatars/alice.jpg',
        url: '/p/alice.bsky.social',
        role: 'organizer',
      });
      expect(result.attendees[1]).toEqual({
        did: null,
        handle: null,
        name: 'Bob',
        avatar: null,
        url: null,
        role: 'attendee',
      });
      expect(result.attendeesCount).toBe(2);
    });

    it('should return null user when event has no organizer', async () => {
      const publicEvent = {
        id: 1,
        slug: 'no-organizer',
        name: 'No Organizer',
        description: 'Test',
        startDate: new Date(),
        endDate: new Date(),
        location: null,
        locationOnline: null,
        type: 'online',
        visibility: 'public',
        status: 'published',
        atprotoUri: null,
        group: null,
        image: null,
        lat: null,
        lon: null,
        timeZone: 'UTC',
        user: null,
        categories: [],
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(0);

      const attendeeQb = createQueryBuilderMock();
      attendeeQb.getMany.mockResolvedValue([]);
      mockEventAttendeeRepo.createQueryBuilder.mockReturnValue(attendeeQb);

      const result = await service.getEventBySlug(1, 'no-organizer');

      expect(result.user).toBeNull();
    });
  });

  describe('tenantId guard', () => {
    it('should throw UnauthorizedException when tenantId is missing', async () => {
      // Create a service instance with no tenantId
      const noTenantModule: TestingModule = await Test.createTestingModule({
        providers: [
          DIDApiService,
          { provide: REQUEST, useValue: {} },
          {
            provide: TenantConnectionService,
            useValue: mockTenantConnectionService,
          },
          {
            provide: UserAtprotoIdentityService,
            useValue: mockUserAtprotoIdentityService,
          },
          {
            provide: ConfigService,
            useValue: { get: jest.fn(() => null) },
          },
        ],
      }).compile();
      const noTenantService =
        await noTenantModule.resolve<DIDApiService>(DIDApiService);

      await expect(noTenantService.getMyGroups(1)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(noTenantService.getMyEvents(1, {})).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(noTenantService.getEventBySlug(1, 'test')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getMyGroups N+1 fix', () => {
    it('should not make per-group queries for membership role', async () => {
      // Setup: main query returns one group with groupRole already joined
      const groupQb = createQueryBuilderMock();
      const groupWithRole = {
        id: 10,
        slug: 'test-group',
        name: 'Test Group',
        description: 'A test group',
        visibility: 'public',
        image: null,
        groupMembersCount: 5,
        groupMembers: [{ groupRole: { name: 'owner' } }],
      };
      groupQb.getMany.mockResolvedValue([groupWithRole]);
      mockGroupRepo.createQueryBuilder.mockReturnValue(groupQb);

      // Batch event count query
      const eventQb = createQueryBuilderMock();
      eventQb.getRawMany.mockResolvedValue([{ groupId: 10, count: '3' }]);
      mockEventRepo.createQueryBuilder.mockReturnValue(eventQb);

      const result = await service.getMyGroups(1);

      // After the fix, groupMemberRepo should NOT be queried per group
      expect(mockGroupMemberRepo.createQueryBuilder).not.toHaveBeenCalled();

      // Should use the role from the joined data
      expect(result.groups[0].role).toBe('owner');
      expect(result.groups[0].upcomingEventCount).toBe(3);
    });
  });

  describe('getMyEvents join syntax', () => {
    it('should use raw table joins for groupMembers and groupRoles', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyEvents(1, {});

      // Verify leftJoin calls use raw table names (not entity relation paths)
      const leftJoinCalls = qb.leftJoin.mock.calls;

      // Find the groupRoles join - should use raw table name, not 'gm.groupRole'
      const groupRoleJoin = leftJoinCalls.find(
        (call: any[]) => call[1] === 'groupRole',
      );
      expect(groupRoleJoin).toBeDefined();
      // Should be raw table name 'groupRoles', not relation path 'gm.groupRole'
      expect(groupRoleJoin[0]).toBe('groupRoles');
    });
  });

  describe('getMyEvents raw column aliases', () => {
    it('should use getRawMany instead of getRawAndEntities to get correct aliases', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyEvents(1, {});

      // getRawAndEntities returns raw keys as tableAlias_columnName (e.g., groupRole_name)
      // which breaks addSelect alias. getRawMany respects the alias parameter.
      // The service should NOT use getRawAndEntities.
      expect(qb.getRawAndEntities).not.toHaveBeenCalled();
    });
  });

  describe('getMyEvents cursor encoding', () => {
    it('should decode cursor without a separate database lookup', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      // Cursor encodes id and startDate as base64
      const cursorData = JSON.stringify({
        id: 42,
        startDate: '2026-04-01T10:00:00.000Z',
      });
      const cursor = Buffer.from(cursorData).toString('base64');

      await service.getMyEvents(1, { cursor });

      // Should NOT call findOne to look up the cursor event
      expect(mockEventRepo.findOne).not.toHaveBeenCalled();

      // Should apply the cursor condition
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('cursorDate'),
        expect.objectContaining({ cursorId: 42 }),
      );
    });
  });

  describe('getMyEvents duplicate visibility params', () => {
    it('should not use duplicate nonPublicVisibilities parameters when includePublic is false', async () => {
      const qb = createQueryBuilderMock();
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getMyEvents(1, { includePublic: false });

      // Check that andWhere was NOT called with nonPublicVisibilities2
      const andWhereCalls = qb.andWhere.mock.calls;
      const hasVisibilities2 = andWhereCalls.some(
        (call: any[]) =>
          call[1] &&
          typeof call[1] === 'object' &&
          'nonPublicVisibilities2' in call[1],
      );
      expect(hasVisibilities2).toBe(false);
    });
  });

  describe('getMyEvents FlatEventRecord normalization', () => {
    function buildRawEventRow(overrides: Record<string, any> = {}) {
      return {
        event_id: 1,
        event_slug: 'test-event-abc123',
        event_name: 'Test Event',
        event_description: 'A test event',
        event_startDate: new Date('2026-04-01T10:00:00.000Z'),
        event_endDate: new Date('2026-04-01T12:00:00.000Z'),
        event_location: 'Room 101',
        event_locationOnline: 'https://zoom.us/j/123',
        event_type: 'hybrid',
        event_visibility: 'public',
        event_status: 'published',
        event_atprotoUri:
          'at://did:plc:xyz/community.lexicon.calendar.event/abc',
        eventGroup_id: null,
        eventGroup_slug: null,
        eventGroup_name: null,
        userGroupRole: null,
        userRsvpStatus: 'confirmed',
        image_id: null,
        image_path: null,
        event_userId: 42,
        user_ulid: 'ulid-organizer',
        ...overrides,
      };
    }

    it('should rename startDate to startsAt as ISO string', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).toHaveProperty('startsAt');
      expect(result.events[0]).not.toHaveProperty('startDate');
      expect(result.events[0].startsAt).toBe('2026-04-01T10:00:00.000Z');
    });

    it('should rename endDate to endsAt as ISO string', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).toHaveProperty('endsAt');
      expect(result.events[0]).not.toHaveProperty('endDate');
      expect(result.events[0].endsAt).toBe('2026-04-01T12:00:00.000Z');
    });

    it('should set endsAt to null when endDate is null', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({ event_endDate: null }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].endsAt).toBeNull();
    });

    it('should transform location string to locations array', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).not.toHaveProperty('location');
      expect(result.events[0].locations).toEqual([
        {
          $type: 'community.lexicon.location.address',
          description: 'Room 101',
        },
      ]);
    });

    it('should return empty locations array when location is null', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({ event_location: null }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].locations).toEqual([]);
    });

    it('should transform locationOnline to uris array', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).not.toHaveProperty('locationOnline');
      expect(result.events[0].uris).toEqual([
        { uri: 'https://zoom.us/j/123', name: 'Online' },
      ]);
    });

    it('should return empty uris array when locationOnline is null', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({ event_locationOnline: null }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].uris).toEqual([]);
    });

    it('should map type to mode with lexicon values', async () => {
      const cases = [
        {
          type: 'online',
          mode: 'community.lexicon.calendar.event#virtual',
        },
        {
          type: 'in_person',
          mode: 'community.lexicon.calendar.event#inperson',
        },
        {
          type: 'hybrid',
          mode: 'community.lexicon.calendar.event#hybrid',
        },
      ];

      for (const { type, mode } of cases) {
        const qb = createQueryBuilderMock();
        qb.getRawMany.mockResolvedValue([
          buildRawEventRow({ event_type: type }),
        ]);
        mockEventRepo.createQueryBuilder.mockReturnValue(qb);

        const result = await service.getMyEvents(1, {});

        expect(result.events[0]).not.toHaveProperty('type');
        expect(result.events[0].mode).toBe(mode);
      }
    });

    it('should rename atprotoUri to uri', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).not.toHaveProperty('atprotoUri');
      expect(result.events[0].uri).toBe(
        'at://did:plc:xyz/community.lexicon.calendar.event/abc',
      );
    });

    it('should transform image to media array', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({
          image_id: 5,
          image_path: 'events/banner.jpg',
        }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0]).not.toHaveProperty('image');
      expect(result.events[0].media).toEqual([
        {
          role: 'thumbnail',
          alt: 'Test Event',
          url: 'http://localhost:3000/events/banner.jpg',
        },
      ]);
    });

    it('should return empty media array when no image', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([buildRawEventRow()]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].media).toEqual([]);
    });

    it('should include did field from batch DID resolution', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({ user_ulid: 'ulid-organizer' }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);
      mockUserAtprotoIdentityService.findByUserUlids.mockResolvedValue(
        new Map([
          [
            'ulid-organizer',
            { did: 'did:plc:org123', handle: 'org.bsky.social' },
          ],
        ]),
      );

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].did).toBe('did:plc:org123');
    });

    it('should set did to null when organizer has no AT Protocol identity', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({ user_ulid: 'ulid-no-atproto' }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);
      mockUserAtprotoIdentityService.findByUserUlids.mockResolvedValue(
        new Map(),
      );

      const result = await service.getMyEvents(1, {});

      expect(result.events[0].did).toBeNull();
    });

    it('should keep slug, name, description, visibility, status, group, attendeesCount, userRsvpStatus', async () => {
      const qb = createQueryBuilderMock();
      qb.getRawMany.mockResolvedValue([
        buildRawEventRow({
          eventGroup_id: 10,
          eventGroup_slug: 'my-group',
          eventGroup_name: 'My Group',
          userGroupRole: 'admin',
          userRsvpStatus: 'confirmed',
        }),
      ]);
      mockEventRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getMyEvents(1, {});
      const evt = result.events[0];

      expect(evt.slug).toBe('test-event-abc123');
      expect(evt.name).toBe('Test Event');
      expect(evt.description).toBe('A test event');
      expect(evt.visibility).toBe('public');
      expect(evt.status).toBe('published');
      expect(evt.group).toEqual({
        slug: 'my-group',
        name: 'My Group',
        role: 'admin',
      });
      expect(evt.attendeesCount).toBe(0);
      expect(evt.userRsvpStatus).toBe('confirmed');
    });
  });
});
