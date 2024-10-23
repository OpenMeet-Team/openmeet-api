import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TESTER_USER_ID, ADMIN_USER_ID } from '../../test/utils/constants';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';

describe('EventService', () => {
  let service: EventService;

  beforeEach(async () => {
    const mockQueryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([{ event_id: 1 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue({
                createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                find: jest.fn().mockResolvedValue([]),
                findOne: jest.fn(),
                save: jest.fn(),
              }),
            }),
          },
        },
        {
          provide: CategoryService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = await module.resolve<EventService>(EventService);
    await service.getTenantSpecificEventRepository();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findRandomEventsForGroup', () => {
    it('should return random events for a group', async () => {
      const result = await service.findRandomEventsForGroup(1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getTenantSpecificEventRepository', () => {
    it('should get the tenant specific event repository', async () => {
      await service.getTenantSpecificEventRepository();
      expect(service['eventRepository']).toBeDefined();
    });

    it('should throw an error if the tenant specific event repository is not found', async () => {
      const mockTenantConnectionService = service['tenantConnectionService'];
      jest
        .spyOn(mockTenantConnectionService, 'getTenantConnection')
        .mockRejectedValue(
          new Error('Tenant specific event repository not found'),
        );
      await expect(service.getTenantSpecificEventRepository()).rejects.toThrow(
        'Tenant specific event repository not found',
      );
    });
  });

  describe('getEventsByCreator', () => {
    let mockEvents: Partial<EventEntity>[];
    let mockUserEntity: Partial<UserEntity>;
    const mockEventAttendeesEntity0: Partial<EventAttendeesEntity>[] = [];
    const mockEventAttendeesEntity1: Partial<EventAttendeesEntity>[] = [
      {
        userId: ADMIN_USER_ID,
      },
    ];
    const mockEventAttendeesEntity2: Partial<EventAttendeesEntity>[] = [
      {
        userId: ADMIN_USER_ID,
      },
      {
        userId: TESTER_USER_ID,
      },
    ];
    beforeAll(() => {
      mockEvents = [
        {
          id: 1,
          name: 'Event 1',
          user: mockUserEntity as unknown as UserEntity,
          attendees:
            mockEventAttendeesEntity0 as unknown as EventAttendeesEntity[],
        },
        {
          id: 2,
          name: 'Event 2',
          user: mockUserEntity as unknown as UserEntity,
          attendees:
            mockEventAttendeesEntity1 as unknown as EventAttendeesEntity[],
        },
        {
          id: 3,
          name: 'Event 3',
          user: mockUserEntity as unknown as UserEntity,
          attendees:
            mockEventAttendeesEntity2 as unknown as EventAttendeesEntity[],
        },
      ];

      jest
        .spyOn(service['eventRepository'], 'find')
        .mockResolvedValue(mockEvents as unknown as EventEntity[]);
    });

    it('should return events created by the user when empty', async () => {
      const events = await service.getEventsByCreator(TESTER_USER_ID);
      expect(events).toEqual([]);
    });

    it('should return events created by the user', async () => {
      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue(mockRepository),
        } as any);

      const events = await service.getEventsByCreator(TESTER_USER_ID);

      expect(mockRepository.find).toHaveBeenCalled();

      expect(events).toHaveLength(mockEvents.length);
      expect(events[0]).toEqual({
        ...mockEvents[0],
        attendeesCount: 0,
      });
      expect(events[1]).toEqual({
        ...mockEvents[1],
        attendeesCount: 1,
      });
      expect(events[2]).toEqual({
        ...mockEvents[2],
        attendeesCount: 2,
      });
    });
  });

  describe('getEventsByAttendee', () => {
    it('should return events attended by the user when empty', async () => {
      const events = await service.getEventsByAttendee(TESTER_USER_ID);
      expect(events).toEqual([]);
    });
  });

  describe.skip('findRecommendedEventsForGroup', () => {
    it('should throw error when not enough recommended events are found', async () => {
      const mockEvents = [];
      const minEvents = 3;

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['eventRepository'], 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      await expect(
        service.findRecommendedEventsForGroup(1, [1, 2], minEvents),
      ).rejects.toThrow();
    });

    it('should return recommended events for a group', async () => {
      const minEvents = 3;
      const maxEvents = 5;
      const mockEvents = [
        { id: 1, name: 'Event 1' },
        { id: 2, name: 'Event 2' },
        { id: 3, name: 'Event 3' },
      ];

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['eventRepository'], 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.findRecommendedEventsForGroup(
        1,
        [1, 2],
        minEvents,
        maxEvents,
      );

      expect(result).toBeDefined();
      expect(result).toEqual(mockEvents);
    });
  });

  describe('findRandomEventsForGroup', () => {
    it('should throw an error if not enough events are found', async () => {
      const mockEvents = [
        { id: 1, name: 'Event 1' },
        { id: 2, name: 'Event 2' },
      ];
      const minEvents = 5;
      const maxEvents = 10;

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['eventRepository'], 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      await expect(
        service.findRandomEventsForGroup(1, minEvents, maxEvents),
      ).rejects.toThrow();
    });

    it('should return random events for a group', async () => {
      // mock a single event
      const mockEvents = [{ id: 1, name: 'Event 1' }];

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Test Event' }]),
        getRawMany: jest.fn().mockResolvedValue([{ event_id: 1 }]),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue({
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          }),
        } as any);

      await service.getTenantSpecificEventRepository();

      const randomEvents = await service.findRandomEventsForGroup(1, 1, 1);
      expect(Array.isArray(randomEvents)).toBe(true);
      expect(randomEvents.length).toBeGreaterThan(0);
      expect(randomEvents[0].id).toBe(1);
    });
  });
});
