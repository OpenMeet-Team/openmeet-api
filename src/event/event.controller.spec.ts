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
import { QueryEventDto } from './dto/query-events.dto';
import {
  mockCategory,
  mockEvent,
  mockEventAttendee,
  mockEventAttendeeService,
  mockEventService,
  mockGroup,
  mockGroupService,
  mockUser,
  mockZulipMessage,
  mockZulipMessageResponse,
} from '../test/mocks';
import { mockEvents } from '../test/mocks';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeRole } from '../core/constants/constant';
import { EventAttendeeStatus } from '../core/constants/constant';

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
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    eventService = module.get<EventService>(EventService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('showEvent', () => {
    it('should return event with details', async () => {
      jest.spyOn(eventService, 'showEvent').mockResolvedValue(mockEvent);

      const result = await controller.showEvent(mockEvent.slug, mockUser);

      expect(result).toEqual(mockEvent);
      expect(eventService.showEvent).toHaveBeenCalled();
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
      const result = await controller.showAllEvents(pagination, queryEventDto);
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

  describe('getRecommendedEvents', () => {
    it('should return recommended events', async () => {
      const result = await controller.showRecommendedEvents(mockEvent.slug);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest.spyOn(eventService, 'editEvent').mockResolvedValue(mockEvent);
      const result = await controller.editEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('attendEvent', () => {
    it('should attend an event', async () => {
      jest
        .spyOn(eventService, 'attendEvent')
        .mockResolvedValue(mockEventAttendee);
      const result = await controller.attendEvent(
        mockUser,
        mockEventAttendee,
        mockEvent.slug,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('cancelAttendingEvent', () => {
    it('should cancel attending an event', async () => {
      jest
        .spyOn(eventService, 'cancelAttendingEvent')
        .mockResolvedValue(mockEventAttendee);
      const result = await controller.cancelAttendingEvent(
        mockEvent.slug,
        mockUser,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('showEventAttendees', () => {
    it('should return event attendees', async () => {
      jest
        .spyOn(eventService, 'showEventAttendees')
        .mockResolvedValue([mockEventAttendee]);
      const result = await controller.showEventAttendees(
        mockEvent.slug,
        { page: 1, limit: 10 },
        {
          userId: mockUser.id,
          search: '',
          role: EventAttendeeRole.Participant,
          status: EventAttendeeStatus.Confirmed,
        },
        mockUser,
      );
      expect(result).toEqual([mockEventAttendee]);
    });
  });

  describe('sendEventDiscussionMessage', () => {
    it('should send an event discussion message', async () => {
      jest
        .spyOn(eventService, 'sendEventDiscussionMessage')
        .mockResolvedValue(mockZulipMessageResponse);
      const result = await controller.sendEventDiscussionMessage(
        mockEvent.slug,
        mockUser,
        { message: 'Test Message', topicName: 'Test Topic' },
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('updateEventDiscussionMessage', () => {
    it('should update an event discussion message', async () => {
      jest
        .spyOn(eventService, 'updateEventDiscussionMessage')
        .mockResolvedValue(mockZulipMessageResponse);
      const result = await controller.updateEventDiscussionMessage(
        mockEvent.slug,
        mockZulipMessage.id,
        mockUser,
        { message: 'Updated Message' },
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('deleteEventDiscussionMessage', () => {
    it('should delete an event discussion message', async () => {
      jest
        .spyOn(eventService, 'deleteEventDiscussionMessage')
        .mockResolvedValue(mockZulipMessageResponse);
      const result = await controller.deleteEventDiscussionMessage(
        mockEvent.slug,
        mockZulipMessage.id,
      );
      expect(result).toEqual(mockZulipMessageResponse);
    });
  });

  describe('showDashboardEvents', () => {
    it('should return dashboard events', async () => {
      const result = await controller.showDashboardEvents(mockUser);
      expect(result).toEqual(mockEvents);
    });
  });
});
