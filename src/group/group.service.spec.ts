import { Test, TestingModule } from '@nestjs/testing';
import { GroupService } from './group.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { GroupMemberService } from '../group-member/group-member.service';
import { EventService } from '../event/event.service';
import { NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { GroupEntity } from './infrastructure/persistence/relational/entities/group.entity';
import { TESTING_TENANT_ID } from '../../test/utils/constants';
import { mockGroup } from '../test/mocks';

describe('GroupService', () => {
  let service: GroupService;
  let eventService: EventService;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupService,
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
          },
        },
        {
          provide: GroupMemberService,
          useValue: {
            createGroupMember: jest.fn(),
          },
        },
        {
          provide: EventService,
          useValue: {
            findRecommendedEventsForGroup: jest.fn(),
            findRandomEventsForGroup: jest.fn(),
          },
        },
      ],
    }).compile();

    service = await module.resolve<GroupService>(GroupService);
    eventService = module.get<EventService>(EventService);

    // Initialize the groupRepository
    await service.getTenantSpecificGroupRepository();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findGroupDetails', () => {
    it('should return group with details', async () => {
      jest.spyOn(service, 'findGroupDetails').mockResolvedValue(mockGroup);
      const result = await service.findGroupDetails(1, 1);
      expect(result).toEqual(mockGroup);
    });
  });

  describe('getTenantSpecificGroupRepository', () => {
    it('should get the tenant specific group repository', async () => {
      await service.getTenantSpecificGroupRepository();
      expect(service['groupRepository']).toBeDefined();
    });

    it('should throw an error if the tenant specific group repository is not found', async () => {
      const mockTenantConnectionService = service['tenantConnectionService'];
      jest
        .spyOn(mockTenantConnectionService, 'getTenantConnection')
        .mockRejectedValue(
          new Error('Tenant specific group repository not found'),
        );
      await expect(service.getTenantSpecificGroupRepository()).rejects.toThrow(
        'Tenant specific group repository not found',
      );
    });
  });

  describe('getRecommendedEvents', () => {
    it('should throw NotFoundException if group is not found', async () => {
      jest.spyOn(service['groupRepository'], 'findOne').mockResolvedValue(null);

      await expect(service.getRecommendedEvents(1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if not enough recommended events are found', async () => {
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockEvents = [{ id: 1 }, { id: 2 }];
      const minEvents = 3;

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockEvents as any);

      await expect(
        service.getRecommendedEvents(mockGroup.id, minEvents),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if not enough random events are found', async () => {
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockEvents = [{ id: 1 }, { id: 2 }];
      const minEvents = 3;

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRandomEventsForGroup')
        .mockResolvedValue(mockEvents as any);

      await expect(
        service.getRecommendedEvents(mockGroup.id, minEvents),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return recommended events if enough are found', async () => {
      const minEvents = 3;
      const maxEvents = 5;
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockEvents = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
        { id: 4 },
        { id: 5 },
      ];

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockEvents as any);

      const result = await service.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual(mockEvents);
      expect(eventService.findRecommendedEventsForGroup).toHaveBeenCalledWith(
        1,
        [1, 2],
        minEvents,
        maxEvents,
      );
      expect(eventService.findRandomEventsForGroup).not.toHaveBeenCalled();
    });

    it('should fetch additional random events if not enough recommended events are found', async () => {
      const minEvents = 3;
      const maxEvents = 5;
      const mockGroup = { id: 1, categories: [{ id: 1 }, { id: 2 }] };
      const mockRecommendedEvents = [{ id: 1 }, { id: 2 }];
      const mockRandomEvents = [{ id: 3 }, { id: 4 }, { id: 5 }];

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockRecommendedEvents as any);
      jest
        .spyOn(eventService, 'findRandomEventsForGroup')
        .mockResolvedValue(mockRandomEvents as any);

      const result = await service.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([...mockRecommendedEvents, ...mockRandomEvents]);
      expect(eventService.findRecommendedEventsForGroup).toHaveBeenCalledWith(
        1,
        [1, 2],
        minEvents,
        maxEvents,
      );
      expect(eventService.findRandomEventsForGroup).toHaveBeenCalledWith(
        1,
        minEvents,
        maxEvents - mockRecommendedEvents.length,
      );
    });

    it('should deduplicate events', async () => {
      const mockGroup = { id: 1, categories: [{ id: 2 }, { id: 3 }] };
      const mockRecommendedEvents = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const mockRandomEvents = [{ id: 2 }, { id: 3 }, { id: 4 }];
      const minEvents = 3;
      const maxEvents = 5;

      jest
        .spyOn(service['groupRepository'], 'findOne')
        .mockResolvedValue(mockGroup as GroupEntity);
      jest
        .spyOn(eventService, 'findRecommendedEventsForGroup')
        .mockResolvedValue(mockRecommendedEvents as any);
      jest
        .spyOn(eventService, 'findRandomEventsForGroup')
        .mockResolvedValue(mockRandomEvents as any);

      const result = await service.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    });
  });
});
