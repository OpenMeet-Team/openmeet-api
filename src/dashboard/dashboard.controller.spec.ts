import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import {
  mockGroupService,
  mockGroup,
  mockEvent,
  mockUser,
  mockEventService,
  mockDashboardService,
} from '../test/mocks';

describe('DashboardController', () => {
  let controller: DashboardController;

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
  });

  describe('myEvents', () => {
    it('should return events for the user', async () => {
      const result = await controller.myEvents(mockUser);
      expect(result).toEqual([mockEvent]);
    });
  });

  describe('myGroups', () => {
    it('should return groups for the user', async () => {
      const result = await controller.myGroups(mockUser);
      expect(result).toEqual([mockGroup]);
    });
  });
});
