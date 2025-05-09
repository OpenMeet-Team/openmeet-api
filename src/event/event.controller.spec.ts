import { Test, TestingModule } from '@nestjs/testing';
import { EventController } from './event.controller';
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
  mockGroup,
  mockGroupMemberService,
  mockGroupService,
  mockUser,
} from '../test/mocks';
import { mockEvents } from '../test/mocks';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventAttendeeRole, UserPermission } from '../core/constants/constant';
import { EventAttendeeStatus } from '../core/constants/constant';
import { PermissionsGuard } from '../shared/guard/permissions.guard';
import { ExecutionContext } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../shared/guard/permissions.decorator';
import { GroupMemberService } from '../group-member/group-member.service';
import { VisibilityGuard } from '../shared/guard/visibility.guard';
import { EventManagementService } from './services/event-management.service';
import { EventQueryService } from './services/event-query.service';
import { EventRecommendationService } from './services/event-recommendation.service';
import { ICalendarService } from './services/ical/ical.service';
import { EventSeriesOccurrenceService } from '../event-series/services/event-series-occurrence.service';

const createEventDto: CreateEventDto = {
  name: 'Test Event',
  description: 'Test Description',
  startDate: new Date(),
  endDate: new Date(),
  group: { id: mockGroup.id },
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

const mockEventManagementService = {
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  attendEvent: jest.fn(),
  cancelAttendingEvent: jest.fn(),
  updateEventAttendee: jest.fn(),
  deleteEventsByGroup: jest.fn(),
};

const mockEventQueryService = {
  showAllEvents: jest.fn(),
  showEvent: jest.fn(),
  editEvent: jest.fn(),
  findEventBySlug: jest.fn(),
  showDashboardEvents: jest.fn(),
  showEventAttendees: jest.fn(),
  getEventsByCreator: jest.fn(),
  getEventsByAttendee: jest.fn(),
  showEventBySlug: jest.fn(),
};

const mockEventRecommendationService = {
  showRecommendedEventsByEventSlug: jest.fn(),
};

const mockICalendarService = {
  generateICalendar: jest.fn(),
};

const mockEventSeriesOccurrenceService = {
  getEffectiveEventForDate: jest.fn(),
  updateFutureOccurrences: jest.fn(),
};

// Discussion service mock has been moved to chat.controller.spec.ts

describe('EventController', () => {
  let controller: EventController;
  let eventManagementService: EventManagementService;
  let eventQueryService: EventQueryService;
  let guard: PermissionsGuard;

  const createMockExecutionContext = (
    handler: (...args: any[]) => Promise<any>,
    user = mockUser,
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => EventController,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
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
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: EventRecommendationService,
          useValue: mockEventRecommendationService,
        },
        {
          provide: ICalendarService,
          useValue: mockICalendarService,
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: mockEventSeriesOccurrenceService,
        },
        // EventDiscussionService has been moved to ChatController
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
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
        PermissionsGuard,
        VisibilityGuard,
      ],
    }).compile();

    controller = module.get<EventController>(EventController);
    eventManagementService = module.get<EventManagementService>(
      EventManagementService,
    );
    eventQueryService = module.get<EventQueryService>(EventQueryService);
    // EventDiscussionService has been moved to ChatController
    guard = module.get<PermissionsGuard>(PermissionsGuard);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('showEvent', () => {
    it('should return event with details', async () => {
      jest.spyOn(eventQueryService, 'showEvent').mockResolvedValue(mockEvent);

      const result = await controller.showEvent(mockEvent.slug, mockUser);

      expect(result).toEqual(mockEvent);
      expect(eventQueryService.showEvent).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new event with all the data', async () => {
      jest
        .spyOn(eventManagementService, 'create')
        .mockResolvedValue(mockEvent as EventEntity);

      const result = await controller.create(createEventDto, mockUser, {
        user: mockUser,
        headers: {},
        body: createEventDto,
      } as unknown as Request);

      expect(result).toEqual(mockEvent);
      expect(eventManagementService.create).toHaveBeenCalledWith(
        createEventDto,
        mockUser.id,
      );
    });

    it('should handle service errors', async () => {
      jest
        .spyOn(eventManagementService, 'create')
        .mockRejectedValue(new Error('Database error'));
      await expect(controller.create(createEventDto, mockUser, {
        user: mockUser,
        headers: {},
        body: createEventDto,
      } as unknown as Request)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('showAllEvents', () => {
    it('should return an array of events', async () => {
      const events = [mockEvent, { ...mockEvent, id: 2 }];
      jest
        .spyOn(eventQueryService, 'showAllEvents')
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
      expect(eventQueryService.showAllEvents).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an event', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(eventManagementService, 'update')
        .mockResolvedValue({ ...mockEvent, ...updateEventDto } as EventEntity);
      const result = await controller.update(mockEvent.slug, updateEventDto, {
        user: mockUser,
      } as unknown as Request);
      expect(result).toEqual({ ...mockEvent, ...updateEventDto });
      expect(eventManagementService.update).toHaveBeenCalledWith(
        mockEvent.slug,
        updateEventDto,
        mockUser.id,
      );
    });

    it('should handle service errors during update', async () => {
      const updateEventDto: UpdateEventDto = { name: 'Updated Event' };
      jest
        .spyOn(eventManagementService, 'update')
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
      mockEventQueryService.getEventsByCreator.mockResolvedValue([mockEvent]);
      const events = await eventQueryService.getEventsByCreator(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });

    it('should get events by attendee', async () => {
      mockEventQueryService.getEventsByAttendee.mockResolvedValue([mockEvent]);
      const events = await eventQueryService.getEventsByAttendee(mockUser.id);
      expect(events).toEqual([mockEvent]);
    });
  });

  describe('delete', () => {
    it('should delete an event', async () => {
      jest.spyOn(eventManagementService, 'remove').mockResolvedValue(undefined);
      const result = await controller.remove(mockEvent.slug);
      expect(result).toBeUndefined();
      expect(eventManagementService.remove).toHaveBeenCalledWith(
        mockEvent.slug,
      );
    });
  });

  describe('getRecommendedEvents', () => {
    it('should return recommended events', async () => {
      mockEventRecommendationService.showRecommendedEventsByEventSlug.mockResolvedValue(
        mockEvents,
      );
      const result = await controller.showRecommendedEvents(mockEvent.slug);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('editEvent', () => {
    it('should return an event', async () => {
      jest.spyOn(eventQueryService, 'editEvent').mockResolvedValue(mockEvent);
      const result = await controller.editEvent(mockEvent.slug);
      expect(result).toEqual(mockEvent);
    });
  });

  describe('attendEvent', () => {
    it('should attend an event', async () => {
      jest
        .spyOn(eventManagementService, 'attendEvent')
        .mockResolvedValue(mockEventAttendee);
      // Convert entity to DTO
      const mockAttendeeDto = {
        ...mockEventAttendee,
        sourceType: mockEventAttendee.sourceType || undefined,
        sourceId: mockEventAttendee.sourceId || undefined,
        sourceUrl: mockEventAttendee.sourceUrl || undefined,
        sourceData: mockEventAttendee.sourceData || undefined,
        lastSyncedAt: mockEventAttendee.lastSyncedAt || undefined,
      };
      const result = await controller.attendEvent(
        mockUser,
        mockAttendeeDto,
        mockEvent.slug,
      );
      expect(result).toEqual(mockEventAttendee);
    });
  });

  describe('cancelAttendingEvent', () => {
    it('should cancel attending an event', async () => {
      jest
        .spyOn(eventManagementService, 'cancelAttendingEvent')
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
        .spyOn(eventQueryService, 'showEventAttendees')
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

  // Discussion-related tests have been moved to chat.controller.spec.ts

  describe('showDashboardEvents', () => {
    it('should return dashboard events', async () => {
      mockEventQueryService.showDashboardEvents.mockResolvedValue(mockEvents);
      const result = await controller.showDashboardEvents(mockUser);
      expect(result).toEqual(mockEvents);
    });
  });

  describe('getICalendar', () => {
    it('should return iCalendar content', async () => {
      const mockEvent = { slug: 'test-event' };
      const mockICalContent = 'BEGIN:VCALENDAR\nEND:VCALENDAR';
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        setHeader: jest.fn(),
      };

      mockEventQueryService.showEvent.mockResolvedValue(mockEvent);
      mockICalendarService.generateICalendar.mockReturnValue(mockICalContent);

      await controller.getICalendar('test-event', mockResponse as any);

      expect(mockEventQueryService.showEvent).toHaveBeenCalledWith(
        'test-event',
      );
      expect(mockICalendarService.generateICalendar).toHaveBeenCalledWith(
        mockEvent,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=test-event.ics',
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockICalContent);
    });

    it('should return 404 if event not found', async () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      mockEventQueryService.showEvent.mockResolvedValue(null);

      await controller.getICalendar('non-existent-event', mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.send).toHaveBeenCalledWith('Event not found');
    });
  });

  describe('modifyThisAndFutureOccurrences', () => {
    it('should call eventSeriesOccurrenceService.updateFutureOccurrences with correct parameters', async () => {
      const slug = 'weekly-meeting';
      const date = '2025-06-15T10:00:00.000Z';
      const updateEventDto = { name: 'Updated Weekly Meeting' };
      const mockUser = { id: 1, name: 'Test User' };

      // Create a valid EventEntity-compatible object
      const expectedResult = {
        ...mockEvent,
        id: 2,
        name: 'Updated Weekly Meeting',
      } as EventEntity;

      // Mock the eventManagementService.update method
      jest
        .spyOn(eventManagementService, 'update')
        .mockResolvedValue(expectedResult);

      // Mock the eventQueryService.findEventBySlug method
      jest
        .spyOn(eventQueryService, 'findEventBySlug')
        .mockResolvedValue(expectedResult);

      // Mock the eventSeriesOccurrenceService.updateFutureOccurrences method
      mockEventSeriesOccurrenceService.updateFutureOccurrences.mockResolvedValue(
        2,
      );

      const result = await controller.modifyThisAndFutureOccurrences(
        slug,
        date,
        updateEventDto,
        mockUser as any,
      );

      expect(eventManagementService.update).toHaveBeenCalledWith(
        slug,
        updateEventDto,
        mockUser.id,
      );
      expect(
        mockEventSeriesOccurrenceService.updateFutureOccurrences,
      ).toHaveBeenCalledWith(slug, date, updateEventDto, mockUser.id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getEffectiveProperties', () => {
    it('should call eventSeriesOccurrenceService.getEffectiveEventForDate with correct parameters', async () => {
      const slug = 'weekly-meeting';
      const date = '2025-06-15T10:00:00.000Z';
      const expectedResult = {
        ...mockEvent,
        id: 2,
        name: 'Weekly Meeting (June Update)',
      } as EventEntity;

      mockEventSeriesOccurrenceService.getEffectiveEventForDate.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.getEffectiveProperties(slug, date);

      expect(
        mockEventSeriesOccurrenceService.getEffectiveEventForDate,
      ).toHaveBeenCalledWith(slug, date);
      expect(result).toEqual(expectedResult);
    });

    it('should use current date when date parameter is not provided', async () => {
      const slug = 'weekly-meeting';
      const expectedResult = { id: 1, name: 'Weekly Meeting' };

      mockEventSeriesOccurrenceService.getEffectiveEventForDate.mockResolvedValue(
        expectedResult,
      );

      const result = await controller.getEffectiveProperties(slug, '');

      expect(
        mockEventSeriesOccurrenceService.getEffectiveEventForDate,
      ).toHaveBeenCalledWith(
        slug,
        expect.any(String), // Should be the current date as ISO string
      );
      expect(result).toEqual(expectedResult);
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

        expect(permissions).toEqual([
          { context: 'user', permissions: [UserPermission.CreateEvents] },
        ]);
      });

      it('should allow access with CreateEvents permission', async () => {
        const createdEvent = { id: 1, ...createEventDto };
        mockEventManagementService.create.mockResolvedValue(createdEvent);

        // Mock the AuthService to return the proper permissions
        mockAuthService.getUserPermissions.mockResolvedValue([
          { name: UserPermission.CreateEvents },
        ]);

        const context = createMockExecutionContext(controller.create, mockUser);

        await expect(guard.canActivate(context)).resolves.toBe(true);

        const result = await controller.create(createEventDto, mockUser, {
          user: mockUser,
          headers: {},
          body: createEventDto,
        } as unknown as Request);
        expect(result).toEqual(createdEvent);
      });

      it.skip('should deny access without CreateEvents permission', async () => {
        // Mock the AuthService to return no permissions
        mockAuthService.getUserPermissions.mockResolvedValue([]);

        const context = createMockExecutionContext(controller.create, mockUser);

        await expect(guard.canActivate(context)).rejects.toThrow(
          'Insufficient permissions',
        );
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
        mockEventQueryService.showAllEvents.mockResolvedValue(events);
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
          mockUser,
        );
        expect(result).toEqual(events);
      });
    });
  });
});
