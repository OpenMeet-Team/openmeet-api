import { Test, TestingModule } from '@nestjs/testing';
import { DIDApiService } from './did-api.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { REQUEST } from '@nestjs/core';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

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
});
