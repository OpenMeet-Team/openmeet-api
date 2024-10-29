import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import {
  mockGroupService,
  mockGroup,
  mockEvent,
  mockUser,
  mockEventService,
  mockDashboardService,
} from '../../test/mocks';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
        {
          provide: EventService,
          useValue: mockEventService,
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    dashboardService = module.get<DashboardService>(DashboardService);
  });

  describe('myEvents', () => {
    it('should return events for the user', async () => {
      const mockEvents = [mockEvent];
      jest
        .spyOn(dashboardService, 'getMyEvents')
        .mockResolvedValue(mockEvents as EventEntity[]);

      const result = await controller.myEvents({ user: mockUser });

      expect(result).toEqual(mockEvents);
      expect(dashboardService.getMyEvents).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle errors when fetching events', async () => {
      jest
        .spyOn(dashboardService, 'getMyEvents')
        .mockRejectedValue(new Error('Failed to fetch events'));

      await expect(controller.myEvents({ user: mockUser })).rejects.toThrow(
        'Failed to fetch events',
      );
    });
  });

  describe('myGroups', () => {
    it('should return groups for the user', async () => {
      const mockGroups = [mockGroup];
      jest
        .spyOn(dashboardService, 'getMyGroups')
        .mockResolvedValue(mockGroups as GroupEntity[]);

      const result = await controller.myGroups({ user: mockUser });

      expect(result).toEqual(mockGroups);
      expect(dashboardService.getMyGroups).toHaveBeenCalledWith(mockUser.id);
    });

    it('should handle errors when fetching groups', async () => {
      jest
        .spyOn(dashboardService, 'getMyGroups')
        .mockRejectedValue(new Error('Failed to fetch groups'));

      await expect(controller.myGroups({ user: mockUser })).rejects.toThrow(
        'Failed to fetch groups',
      );
    });
  });
});
