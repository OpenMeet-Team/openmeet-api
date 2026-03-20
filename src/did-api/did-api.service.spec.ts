import { Test, TestingModule } from '@nestjs/testing';
import { DIDApiService } from './did-api.service';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DIDApiService,
        { provide: REQUEST, useValue: mockRequest },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
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
      };
      mockEventRepo.findOne.mockResolvedValue(publicEvent);
      mockEventAttendeeRepo.findOne.mockResolvedValue(null);
      mockEventAttendeeRepo.count.mockResolvedValue(5);

      const result = await service.getEventBySlug(1, 'public-event');

      expect(result.slug).toBe('public-event');
      expect(result.attendeesCount).toBe(5);
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
});
