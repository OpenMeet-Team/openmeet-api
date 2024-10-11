import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventService } from '../event/event.service';
import { GroupService } from '../group/group.service';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

describe('DashboardController', () => {
  let controller: DashboardController;
  let eventService: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        {
          provide: TenantConnectionService,
          useValue: {},
        },
        {
          provide: EventService,
          useValue: {
            getEventsByCreator: jest.fn(),
            getEventsByAttendee: jest.fn(),
          },
        },
        {
          provide: GroupService,
          useValue: {
            getGroupsByMember: jest.fn(),
          },
        },
        {
          provide: CategoryService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
    eventService = module.get<EventService>(EventService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('myEvents', () => {
    it('should have an endpoint at my-events', () => {
      expect(controller['myEvents']).toBeDefined();
    });

    it('should call eventService.getEventsByCreator', async () => {
      await controller['myEvents']({ user: { id: 1 } });
      expect(eventService.getEventsByCreator).toHaveBeenCalledWith(1);
      expect(eventService.getEventsByAttendee).toHaveBeenCalledWith(1);
    });

    it('should return events created by the user', async () => {
      const mockEvents: Partial<EventEntity>[] = [
        {
          id: 1,
          name: 'Event 1',
          attendeesCount: 2,
          image: 'image1.jpg',
          type: 'online',
          locationOnline: 'true',
          description: 'Description 1',
        },
        {
          id: 2,
          name: 'Event 2',
          attendeesCount: 1,
          image: 'image2.jpg',
          type: 'in-person',
          locationOnline: 'false',
          description: 'Description 2',
        },
      ];
      jest
        .spyOn(eventService, 'getEventsByCreator')
        .mockResolvedValue(mockEvents as unknown as EventEntity[]);

      const result = await controller.myEvents('userId');

      expect(eventService.getEventsByCreator).toHaveBeenCalledWith('userId');
      expect(result).toEqual(mockEvents);
    });

    it('should return events attended by the user', async () => {
      const mockEvents: Partial<EventEntity>[] = [
        {
          id: 3,
          name: 'Event 3',
          attendeesCount: 3,
          image: 'image3.jpg',
          type: 'hybrid',
          locationOnline: 'true',
          description: 'Description 3',
        },
        {
          id: 4,
          name: 'Event 4',
          attendeesCount: 2,
          image: 'image4.jpg',
          type: 'online',
          locationOnline: 'true',
          description: 'Description 4',
        },
      ];

      jest
        .spyOn(eventService, 'getEventsByAttendee')
        .mockResolvedValue(mockEvents as unknown as EventEntity[]);

      const result = await controller.myEvents('userId');

      expect(eventService.getEventsByAttendee).toHaveBeenCalledWith('userId');
      expect(result).toEqual(expect.arrayContaining(mockEvents));
    });
  });

  describe('myGroups', () => {
    it('should have an endpoint at my-groups', () => {
      expect(controller['myGroups']).toBeDefined();
    });
  });
});
