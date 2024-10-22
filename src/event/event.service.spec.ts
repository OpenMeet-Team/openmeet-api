import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { NotFoundException } from '@nestjs/common';
import {
  TESTER_USER_ID,
  ADMIN_USER_ID,
  APP_URL,
} from '../../test/utils/constants';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { createGroup, loginAsTester } from '../../test/utils/functions';

describe('EventService', () => {
  let service: EventService;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto) => ({
        id: 1,
        ...dto,
        categories: dto.categories.map((id) => ({ id })),
        group: { id: dto.group },
        user: { id: TESTER_USER_ID },
      })),
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        EventAttendeeService,
        {
          provide: REQUEST,
          useValue: { tenantId: TESTING_TENANT_ID },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue(mockRepository),
            }),
          },
        },
        {
          provide: CategoryService,
          useValue: {
            findOne: jest.fn(),
            findByIds: jest.fn(),
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

  describe('create', () => {
    it('should create an event', async () => {
      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: 'in person',
        location: 'Test Location',
        locationOnline: 'Test Location Online',
        maxAttendees: 100,
        categories: [1, 2],
        lat: 1,
        lon: 1,
        group: 1,
      };
      jest
        .spyOn(service['categoryService'], 'findByIds')
        .mockResolvedValue([
          { id: 1, name: 'Category 1' } as unknown as CategoryEntity,
          { id: 2, name: 'Category 2' } as unknown as CategoryEntity,
        ]);
      const event = await service.create(createEventDto, TESTER_USER_ID);
      expect(event).toBeDefined();
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

  describe('findRecommendedEventsForGroup', () => {
    it('should return recommended events for a group', async () => {
      const minEvents = 0;
      const maxEvents = 5;

      const { token } = await loginAsTester();
      //  create a group
      const group = await createGroup(APP_URL, token, {
        name: 'Test Group',
        description: 'A test group',
      });
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
        group.id,
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
        service.findRandomEventsForGroup(1, [1, 2, 3], minEvents, maxEvents),
      ).rejects.toThrow();
    });

    it('should return random events for a group', async () => {
      const minEvents = 2;
      const maxEvents = 5;
      const mockEvents = [
        { id: 4, name: 'Event 4' },
        { id: 5, name: 'Event 5' },
        { id: 6, name: 'Event 6' },
        { id: 7, name: 'Event 7' },
        { id: 8, name: 'Event 8' },
        { id: 9, name: 'Event 9' },
      ];

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

      const result = await service.findRandomEventsForGroup(
        1,
        [1, 2, 3],
        minEvents,
        maxEvents,
      );

      expect(result).toEqual(mockEvents.slice(0, maxEvents));
      expect(result).toHaveLength(maxEvents);
    });
  });

  describe('getRecommendedEventsByEventId', () => {
    it('should return recommended events if enough are found', async () => {
      const eventId = 1;
      const minEvents = 3;
      const maxEvents = 5;
      const mockEvent = { id: eventId, categories: [{ id: 1 }, { id: 2 }] };
      const mockEvents = [
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
        { id: 6 },
      ];

      jest
        .spyOn(service['eventRepository'], 'findOne')
        .mockResolvedValue(mockEvent as EventEntity);
      jest
        .spyOn(service, 'findRecommendedEventsForEvent')
        .mockResolvedValue(mockEvents as EventEntity[]);
      jest.spyOn(service, 'findRandomEventsForEvent').mockResolvedValue([]);

      const result = await service.getRecommendedEventsByEventId(
        eventId,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual(mockEvents.slice(0, maxEvents));
      expect(service.findRecommendedEventsForEvent).toHaveBeenCalledWith(
        eventId,
        [1, 2],
        0,
        maxEvents,
      );
      // we found all 5 recommended events, and didn't need to fetch any random events
      expect(service.findRandomEventsForEvent).toHaveBeenCalledTimes(0);
    });

    it('should fetch additional random events if not enough recommended events are found', async () => {
      const eventId = 1;
      const minEvents = 3;
      const maxEvents = 5;
      const mockEvent = { id: eventId, categories: [{ id: 1 }, { id: 2 }] };
      const mockRecommendedEvents = [{ id: 2 }, { id: 3 }];
      const mockRandomEvents = [{ id: 4 }, { id: 5 }, { id: 6 }];

      jest
        .spyOn(service['eventRepository'], 'findOne')
        .mockResolvedValue(mockEvent as EventEntity);
      jest
        .spyOn(service, 'findRecommendedEventsForEvent')
        .mockResolvedValue(mockRecommendedEvents as EventEntity[]);
      jest
        .spyOn(service, 'findRandomEventsForEvent')
        .mockResolvedValue(mockRandomEvents as EventEntity[]);

      const result = await service.getRecommendedEventsByEventId(
        eventId,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([
        ...mockRecommendedEvents,
        ...mockRandomEvents.slice(0, 3),
      ]);
      expect(service.findRecommendedEventsForEvent).toHaveBeenCalledWith(
        eventId,
        [1, 2],
        0,
        maxEvents,
      );
      expect(service.findRandomEventsForEvent).toHaveBeenCalledWith(
        eventId,
        0,
        maxEvents - mockRecommendedEvents.length,
      );
    });

    it('should deduplicate events', async () => {
      const eventId = 1;
      const minEvents = 3;
      const maxEvents = 5;
      const mockEvent = { id: eventId, categories: [{ id: 2 }, { id: 3 }] };
      const mockRecommendedEvents = [{ id: 2 }, { id: 3 }, { id: 4 }];
      const mockRandomEvents = [{ id: 3 }, { id: 4 }, { id: 5 }];

      jest
        .spyOn(service['eventRepository'], 'findOne')
        .mockResolvedValue(mockEvent as EventEntity);
      jest
        .spyOn(service, 'findRecommendedEventsForEvent')
        .mockResolvedValue(mockRecommendedEvents as EventEntity[]);
      jest
        .spyOn(service, 'findRandomEventsForEvent')
        .mockResolvedValue(mockRandomEvents as EventEntity[]);

      const result = await service.getRecommendedEventsByEventId(
        eventId,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]);
    });

    it('should throw NotFoundException when not enough events are found', async () => {
      const eventId = 1;
      const minEvents = 3;
      const maxEvents = 5;
      const mockEvent = { id: eventId, categories: [{ id: 1 }, { id: 2 }] };
      const mockRecommendedEvents = [{ id: 2 }];
      const mockRandomEvents = [{ id: 3 }];

      jest
        .spyOn(service['eventRepository'], 'findOne')
        .mockResolvedValue(mockEvent as EventEntity);
      jest
        .spyOn(service, 'findRecommendedEventsForEvent')
        .mockResolvedValue(mockRecommendedEvents as EventEntity[]);
      jest
        .spyOn(service, 'findRandomEventsForEvent')
        .mockResolvedValue(mockRandomEvents as EventEntity[]);

      await expect(
        service.getRecommendedEventsByEventId(eventId, minEvents, maxEvents),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
