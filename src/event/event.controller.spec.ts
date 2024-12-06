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
import { EventAttendeeRole, UserPermission } from '../core/constants/constant';
import { EventAttendeeStatus } from '../core/constants/constant';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { ExecutionContext } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../shared/guard/permissions.decorator';

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

const mockAuthService = {
  getGroupMemberPermissions: jest.fn(),
  validateToken: jest.fn(),
  getGroup: jest.fn(),
  getGroupMembers: jest.fn(),
  getEvent: jest.fn(),
  getEventAttendees: jest.fn(),
  getUserPermissions: jest.fn(),
  getAttendeePermissions: jest.fn(),
};

describe('EventController', () => {
  let controller: EventController;
  let eventService: EventService;
  let guard: PermissionsGuard;

  const createMockExecutionContext = (
    handler: (...args: any[]) => Promise<any>,
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => EventController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: mockUser,
          headers: {
            'x-event-slug': 'test-event',
          },
        }),
      }),
      getArgs: () => [],
      getArgByIndex: () => null,
      switchToRpc: () => ({}),
      switchToWs: () => ({}),
      getType: () => 'http',
    }) as unknown as ExecutionContext;

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
          useValue: mockAuthService,
        },
        Reflector,
        {
          provide: GroupService,
          useValue: mockGroupService,
        },
        {
          provide: EventAttendeeService,
          useValue: mockEventAttendeeService,
        },
        PermissionsGuard,
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    eventService = module.get<EventService>(EventService);
    guard = module.get<PermissionsGuard>(PermissionsGuard);
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

  describe('Global Guards', () => {
    describe('POST /events', () => {
      const createEventDto = {
        name: 'New Event',
        description: 'Test Description',
        startDate: new Date(),
        endDate: new Date(),
        type: 'in_person',
        location: 'Test Location',
        locationOnline: 'Test Location Online',
        maxAttendees: 100,
        categories: [mockCategory.id],
        lat: 0,
        lon: 0,
      };

      beforeEach(() => {
        // Reset all mocks before each test
        Object.values(mockAuthService).forEach((mock) => mock.mockReset());
      });

      it('should have CreateEvents permission requirement', () => {
        // Get the actual metadata from the controller method
        const permissions = Reflect.getMetadata(
          PERMISSIONS_KEY,
          controller.create,
        );

        expect(permissions).toContain(UserPermission.CreateEvents);
      });

      it('should deny access without CreateEvents permission', async () => {
        mockAuthService.getEvent.mockResolvedValue({
          id: 1,
          name: 'Test Event',
        });

        mockAuthService.getEventAttendees.mockResolvedValue(null);
        mockAuthService.getGroup.mockResolvedValue(mockGroup);

        // Mock no permissions
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([]);
        mockAuthService.getUserPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.create);
        await expect(guard.canActivate(context)).rejects.toThrow();
      });

      it('should allow access with CreateEvents permission', async () => {
        const createdEvent = { id: 1, ...createEventDto };
        mockEventService.create.mockResolvedValue(createdEvent);

        mockAuthService.getEvent.mockResolvedValue({
          id: 1,
          name: 'Test Event',
        });
        mockAuthService.getEventAttendees.mockResolvedValue({
          id: 1,
          userId: mockUser.id,
          eventId: 1,
          status: EventAttendeeStatus.Confirmed,
          role: {
            name: EventAttendeeRole.Host,
          },
        });

        mockAuthService.getAttendeePermissions.mockResolvedValue([
          {
            role: {
              permission: {
                name: ZUserPermission.CreateEvents,
              },
            },
          },
        ]);

        mockAuthService.getGroup.mockResolvedValue(mockGroup);

        // Mock the group permissions
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([
          { groupPermission: { name: UserPermission.CreateEvents } },
        ]);

        const context = createMockExecutionContext(controller.create);
        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.create(createEventDto, mockUser);
        expect(result).toEqual(createdEvent);
      });
    });

    describe('GET /events', () => {
      it('should allow access without ViewEvents permission', async () => {
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.showAllEvents);
        await expect(guard.canActivate(context)).resolves.toBe(true);
      });

      it('should allow access with ViewEvents permission', async () => {
        const events = [{ id: 1, name: 'Test Event' }];
        mockEventService.showAllEvents.mockResolvedValue(events);
        mockAuthService.getGroupMemberPermissions.mockResolvedValue([
          { groupPermission: { name: UserPermission.ViewEvents } },
        ]);

        const context = createMockExecutionContext(controller.showAllEvents);
        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.showAllEvents(
          { page: 1, limit: 10 },
          {
            search: '',
            userId: mockUser.id,
            fromDate: new Date(
              new Date().setMonth(new Date().getMonth() - 1),
            ).toISOString(),
            toDate: new Date().toISOString(),
            location: 'Test Location',
            type: 'conference',
            categories: ['Technology'],
          },
        );
        expect(result).toEqual(events);
      });
    });
  });
});
