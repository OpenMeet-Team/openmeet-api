import { Test, TestingModule } from '@nestjs/testing';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { mockGroup, mockUser } from '../../test/mocks';

describe('GroupController', () => {
  let controller: GroupController;
  let groupService: GroupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupController],
      providers: [
        {
          provide: GroupService,
          useValue: {
            getRecommendedEvents: jest.fn(),
            findOneWithDetails: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GroupController>(GroupController);
    groupService = module.get<GroupService>(GroupService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOneWithDetails', () => {
    it('should return group with details', async () => {
      jest
        .spyOn(groupService, 'findOneWithDetails')
        .mockResolvedValue(mockGroup);

      const result = await controller.findOneProtected(1, mockUser);

      expect(result).toEqual(mockGroup);
      expect(groupService.findOneWithDetails).toHaveBeenCalled();
    });
  });

  describe('getRecommendedEvents', () => {
    it('should return 3-5 recommended events', async () => {
      const mockEvents = [
        { id: 1, name: 'Event 1' },
        { id: 2, name: 'Event 2' },
        { id: 3, name: 'Event 3' },
        { id: 4, name: 'Event 4' },
      ];
      const minEvents = 3;
      const maxEvents = 5;
      jest
        .spyOn(groupService, 'getRecommendedEvents')
        .mockResolvedValue(mockEvents as EventEntity[]);

      const result = await controller.getRecommendedEvents(
        1,
        minEvents,
        maxEvents,
      );

      expect(result.length).toBeGreaterThanOrEqual(minEvents);
      expect(result.length).toBeLessThanOrEqual(maxEvents);
    });

    it('should return empty array when limits are not valid', async () => {
      jest.spyOn(groupService, 'getRecommendedEvents').mockResolvedValue([]);

      const result = await controller.getRecommendedEvents(1, -1, 5);
      expect(result).toEqual([]);
    });

    it('should throw NotFoundException when group is not found', async () => {
      const eventId = 99999999;
      jest
        .spyOn(groupService, 'getRecommendedEvents')
        .mockRejectedValue(new Error('Not Found'));

      await expect(controller.getRecommendedEvents(eventId)).rejects.toThrow(
        HttpException,
      );
      await expect(
        controller.getRecommendedEvents(eventId),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });
});
