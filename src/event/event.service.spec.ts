import { Test, TestingModule } from '@nestjs/testing';
import { EventService } from './event.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';

describe('EventService', () => {
  let service: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventService,
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant-id' },
        },
        {
          provide: TenantConnectionService,
          useValue: {
            getTenantConnection: jest.fn().mockResolvedValue({
              getRepository: jest.fn().mockReturnValue({
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getEventsByCreator', () => {
    it('should return events created by the user when empty', async () => {
      const events = await service.getEventsByCreator('userId');
      expect(events).toEqual([]);
    });

    it('should return events created by the user', async () => {
      const mockEvents = [
        {
          id: 1,
          title: 'Event 1',
          user: { id: 1 },
          attendees: [{ id: 'attendee1' }, { id: 'attendee2' }],
        },
        {
          id: 2,
          title: 'Event 2',
          user: { id: 2 },
          attendees: [{ id: 'attendee3' }],
        },
      ];

      const mockRepository = {
        find: jest.fn().mockResolvedValue(mockEvents),
      };

      jest
        .spyOn(service['tenantConnectionService'], 'getTenantConnection')
        .mockResolvedValue({
          getRepository: jest.fn().mockReturnValue(mockRepository),
        } as any);

      const events = await service.getEventsByCreator('userId');

      expect(mockRepository.find).toHaveBeenCalled();

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        ...mockEvents[0],
        attendeesCount: 2,
      });
      expect(events[1]).toEqual({
        ...mockEvents[1],
        attendeesCount: 1,
      });
    });
  });

  describe('getEventsByAttendee', () => {
    it('should return events attended by the user when empty', async () => {
      const events = await service.getEventsByAttendee('userId');
      expect(events).toEqual([]);
    });
  });
});
