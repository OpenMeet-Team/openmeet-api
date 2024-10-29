import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { GroupService } from '../group/group.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { Request } from 'express';
import { GroupEntity } from '../group/infrastructure/persistence/relational/entities/group.entity';
import { AuthService } from '../auth/auth.service';
import { Reflector } from '@nestjs/core';
import { PaginationOptions } from '../utils/generic-pagination';
import { QueryEventDto } from '../event/dto/query-events.dto';

// Mock services
const mockGroupService = {};
const mockEventService = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getEventsByCreator: jest.fn(),
  getEventsByAttendee: jest.fn(),
};

const mockUser = {
  id: 1,
  email: 'test@example.com',
  password: 'password',
  firstName: 'John',
  lastName: 'Doe',
  createdAt: new Date(),
  updatedAt: new Date(),
} as UserEntity;

const mockCategory = {
  id: 1,
  name: 'Test Category',
} as CategoryEntity;

const mockGroup = {
  id: 1,
  name: 'Test Group',
} as GroupEntity;

const createEventDto: CreateEventDto = {
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  group: mockGroup.id,
  type: 'in_person',
  location: 'Test Location',
  locationOnline: 'Test Location Online',
  maxAttendees: 100,
  categories: [mockCategory.id],
  lat: 0,
  lon: 0,
};

const mockEvent: Partial<EventEntity> = {
  id: 1,
  attendeesCount: 1,
  ...createEventDto,
  user: mockUser,
  group: mockGroup,
  categories: createEventDto.categories.map((id) => ({ id }) as CategoryEntity),
};

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
      mockEventService.findOne.mockResolvedValue(mockEvent);
      const event = await eventService.findOne(mockEvent.id as number);
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

  describe('findAll', () => {
    it('should return an array of events', async () => {
      const events = [mockEvent, { ...mockEvent, id: 2 }];
      jest
        .spyOn(eventService, 'findAll')
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
      const result = await controller.findAll(
        pagination,
        queryEventDto,
        mockUser,
      );
      expect(result).toEqual(events);
      expect(eventService.findAll).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(eventService, 'update')
        .mockResolvedValue({ ...mockEvent, ...updateEventDto } as EventEntity);
      const result = await controller.update(1, updateEventDto, {
        user: mockUser,
      } as unknown as Request);
      expect(result).toEqual({ ...mockEvent, ...updateEventDto });
      expect(eventService.update).toHaveBeenCalledWith(
        1,
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
        controller.update(1, updateEventDto, {
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
      const result = await controller.remove(mockEvent.id as number);
      expect(result).toBeUndefined();
      expect(eventService.remove).toHaveBeenCalledWith(mockEvent.id);
    });
  });
});
