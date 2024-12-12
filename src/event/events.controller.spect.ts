import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { GroupService } from '../group/group.service';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { Reflector } from '@nestjs/core';
import { PaginationOptions } from '../utils/generic-pagination';
import { QueryEventDto } from '../event/dto/query-events.dto';
import {
  mockCategory,
  mockEvent,
  mockEventAttendees,
  mockEventService,
  mockGroup,
  mockGroupService,
  mockUser,
} from '../test/mocks';

// const mockUser = {
//   id: 1,
//   email: 'test@openmeet.net',
//   password: 'password',
//   firstName: 'John',
//   lastName: 'Doe',
//   createdAt: new Date(),
//   updatedAt: new Date(),
// } as UserEntity;

const createEventDto: CreateEventDto = {
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  group: mockGroup.id,
  type: 'in_person',
  locationOnline: 'Test Location Online',
  maxAttendees: 100,
  categories: [mockCategory.id],
  lat: 0,
  lon: 0,
};

// const mockEvent: Partial<EventEntity> = {
//   id: 1,
//   attendeesCount: 1,
//   ...createEventDto,
//   user: mockUser,
//   group: mockGroup,
//   categories: createEventDto.categories.map((id) => ({ id }) as CategoryEntity),
// };

describe('EventController', () => {
  let controller: EventController;
  let eventService: EventService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventController],
      providers: [
        {
          provide: EventService,
          useValue: mockEventService,
        },
        {
          provide: AuthService,
          useValue: {
            validateToken: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    eventService = module.get<EventService>(EventService);
  });

  describe('Event Service Methods', () => {
    it('should get events by creator', async () => {
      mockEventService.getEventsByCreator.mockResolvedValue([mockEvent]);
      const events = await eventService.getEventsByCreator(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });

    it('should get events by attendee', async () => {
      mockEventService.getEventsByAttendee.mockResolvedValue([mockEvent]);
      const events = await eventService.getEventsByAttendee(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });

    it('should get attendees count from an event', async () => {
      mockEventService.showEventAttendees.mockResolvedValue(mockEventAttendees);
      const event = await eventService.showEvent(mockEvent.slug);
      expect(event.attendeesCount).toEqual(1);
    });
  });

  describe('create', () => {
    it('should create a new event with all the data', async () => {
      jest
        .spyOn(eventService, 'create')
        .mockResolvedValue(mockEvent as EventEntity);

      const result = await controller.create(createEventDto, mockUser);

      expect(result).toEqual(mockEvent);
      expect(eventService.create).toHaveBeenCalledWith(
        createEventDto,
        mockUser.id,
      );
    });

    it('should handle service errors', async () => {
      jest
        .spyOn(eventService, 'create')
        .mockRejectedValue(new Error('Database error'));
      await expect(controller.create(createEventDto, mockUser)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('showAllEvents', () => {
    it('should return an array of events', async () => {
      const events = [mockEvent, { ...mockEvent, id: 2 }];
      jest
        .spyOn(eventService, 'showAllEvents')
        .mockResolvedValue(events as EventEntity[]);
      const pagination: PaginationOptions = {
        page: 1,
        limit: 10,
      };
      const queryEventDto: QueryEventDto = {
        search: '',
        userId: mockUser.id,
        fromDate: new Date('2023-01-01').toISOString(),
        toDate: new Date().toISOString(),
        location: 'New York',
        type: 'conference',
        categories: ['Technology'],
      };
      const result = await controller.showAllEvents(
        pagination,
        queryEventDto,
        mockUser,
      );
      expect(result).toEqual(events);
      expect(eventService.showAllEvents).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(eventService, 'update')
        .mockResolvedValue({ ...mockEvent, ...updateEventDto } as EventEntity);
      const result = await controller.update(mockEvent.slug, updateEventDto, {
        user: mockUser,
      } as unknown as Request);
      expect(result).toEqual({ ...mockEvent, ...updateEventDto });
      expect(eventService.update).toHaveBeenCalledWith(
        mockEvent.slug,
        updateEventDto,
        mockUser.id,
      );
    });

    it('should handle service errors during update', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(eventService, 'update')
        .mockRejectedValue(new Error('Update failed'));
      await expect(
        controller.update(mockEvent.slug, updateEventDto, {
          user: mockUser,
        } as unknown as Request),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('Event Service Methods', () => {
    it('should get events by creator', async () => {
      mockEventService.getEventsByCreator.mockResolvedValue([mockEvent]);
      const events = await eventService.getEventsByCreator(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });

    it('should get events by attendee', async () => {
      mockEventService.getEventsByAttendee.mockResolvedValue([mockEvent]);
      const events = await eventService.getEventsByAttendee(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });
  });

  describe('delete', () => {
    it('should delete an event', async () => {
      jest.spyOn(eventService, 'remove').mockResolvedValue(undefined);
      const result = await controller.remove(mockEvent.slug);
      expect(result).toBeUndefined();
      expect(eventService.remove).toHaveBeenCalledWith(mockEvent.slug);
    });
  });
});
