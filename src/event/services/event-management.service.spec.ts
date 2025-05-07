import { Test, TestingModule } from '@nestjs/testing';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CategoryService } from '../../category/category.service';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TESTING_USER_ID } from '../../../test/utils/constants';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  EventType,
  EventStatus,
  EventVisibility,
} from '../../../src/core/constants/constant';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { CategoryEntity } from '../../category/infrastructure/persistence/relational/entities/categories.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../../file/infrastructure/uploader/s3-presigned/file.service';
import { mockEventAttendee } from '../../test/mocks';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from '../../user/user.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { EventMailService } from '../../event-mail/event-mail.service';
import { BlueskyService } from '../../bluesky/bluesky.service';
import { stopCleanupInterval } from '../../database/data-source';
import { EventManagementService } from './event-management.service';
import { EventSeriesService } from '../../event-series/services/event-series.service';
import { EventQueryService } from './event-query.service';
import { GroupMemberService } from '../../group-member/group-member.service';
import { RoleEnum } from '../../role/role.enum';
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { UpdateEventDto } from '../dto/update-event.dto';
import { RecurrenceFrequency } from '../../event-series/interfaces/recurrence-frequency.enum';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';

describe('EventManagementService', () => {
  let service: EventManagementService;
  let eventAttendeeService: EventAttendeeService;
  let mockRepository: jest.Mocked<Repository<EventEntity>>;
  let mockUser: Partial<UserEntity> & { id: number };
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let mockEventSeriesService: jest.Mocked<EventSeriesService>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockDiscussionService: any;
  let mockEventQueryService: jest.Mocked<EventQueryService>;
  let mockGroupMemberService: jest.Mocked<GroupMemberService>;

  const mockSeriesId = 1;
  const mockSeriesSlug = 'test-series';

  // Base mock with common fields
  const baseMockEventEntity: Partial<EventEntity> = {
    ulid: '01HABCDEFGHJKMNPQRSTVWXYZ',
    createdAt: new Date(),
    updatedAt: new Date(),
    type: EventType.InPerson,
    description: 'Mock description',
    status: EventStatus.Published,
    visibility: EventVisibility.Public,
    locationOnline: 'false',
    maxAttendees: 100,
    requireApproval: false,
    allowWaitlist: true,
    series: { id: mockSeriesId } as any,
    seriesSlug: mockSeriesSlug,
    user: { id: TESTING_USER_ID } as UserEntity,
  };

  // Specific full mocks for findAndCount
  const fullMockEvent1: EventEntity = {
    ...baseMockEventEntity,
    id: 1,
    ulid: '01HABCDEFGHJKMNPQRSTVWXY1',
    slug: 'test-event-1',
    name: 'Test Event 1',
    startDate: new Date('2024-01-01T10:00:00Z'),
    endDate: new Date('2024-01-01T11:00:00Z'),
  } as EventEntity;

  const fullMockEvent2: EventEntity = {
    ...baseMockEventEntity,
    id: 2,
    ulid: '01HABCDEFGHJKMNPQRSTVWXY2',
    slug: 'test-event-2',
    name: 'Test Event 2',
    startDate: new Date('2024-01-02T10:00:00Z'),
    endDate: new Date('2024-01-02T11:00:00Z'),
  } as EventEntity;

  // Mock for findOne/create results
  const findOneMockEventEntity: EventEntity = {
    ...baseMockEventEntity,
    id: 123,
    ulid: '01HABCDEFGHJKMNPQRSTVWX99',
    slug: 'test-series-event-123',
    name: 'Test Series Event',
    startDate: new Date('2023-10-01T12:00:00Z'),
    endDate: new Date('2023-10-01T13:00:00Z'),
  } as EventEntity;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
        getMany: jest.fn(),
        getCount: jest.fn(),
      }),
    } as unknown as jest.Mocked<Repository<EventEntity>>;

    eventEmitter = {
      emit: jest.fn(),
    } as any;
    mockEventSeriesService = {
      findBySlug: jest
        .fn()
        .mockResolvedValue({ id: mockSeriesId, slug: mockSeriesSlug }),
    } as any;
    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === EventSeriesEntity) {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: mockSeriesId,
                slug: mockSeriesSlug,
              }),
            };
          }
          return mockRepository;
        }),
      }),
    } as any;
    mockUser = {
      id: TESTING_USER_ID,
      name: 'Test User',
      role: { id: 1, name: RoleEnum.User } as any,
      preferences: {},
    };

    mockDiscussionService = {
      createEventRoom: jest.fn(),
      cleanupEventChatRooms: jest.fn(),
    } as any;

    mockEventQueryService = {
      findEventBySlug: jest.fn(),
      findEventById: jest.fn(),
      findEventByDateAndSeries: jest.fn(),
      findByBlueskySource: jest.fn(),
      findEventsBySeriesSlug: jest
        .fn()
        .mockResolvedValue([[fullMockEvent1, fullMockEvent2], 2]),
      findEventsBySeriesId: jest.fn(),
    } as any;

    mockGroupMemberService = {
      findGroupMemberByUserId: jest.fn(),
    } as unknown as jest.Mocked<GroupMemberService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventManagementService,
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant', user: mockUser },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CategoryService,
          useValue: { findByIds: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            create: jest.fn(),
            findEventAttendeeByUserId: jest.fn(),
            findEventAttendeesByUserIdBatch: jest.fn(),
            createEventMember: jest.fn(),
            deleteEventAttendees: jest.fn(),
            update: jest.fn(),
            showEventAttendeesCount: jest.fn().mockResolvedValue(0),
            save: jest
              .fn()
              .mockImplementation((attendee) => Promise.resolve(attendee)),
            reactivateEventAttendance: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: FilesS3PresignedService,
          useValue: { create: jest.fn() },
        },
        {
          provide: EventRoleService,
          useValue: { getRoleByName: jest.fn() },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue(mockUser),
            getUserById: jest.fn().mockResolvedValue(mockUser),
            findByIdWithPreferences: jest.fn().mockResolvedValue(mockUser),
          },
        },
        {
          provide: EventMailService,
          useValue: {
            sendMailAttendeeGuestJoined: jest.fn(),
            sendMailAttendeeStatusChanged: jest.fn(),
          },
        },
        {
          provide: BlueskyService,
          useValue: {},
        },
        {
          provide: BlueskyIdService,
          useValue: {
            createUri: jest.fn(),
            parseUri: jest.fn(),
            isValidUri: jest.fn(),
          },
        },
        {
          provide: 'DiscussionService',
          useValue: {},
        },
        {
          provide: EventSeriesService,
          useValue: {},
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockRepository,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: GroupMemberService,
          useValue: mockGroupMemberService,
        },
      ],
    })
      // Override forwardRef dependencies explicitly
      .overrideProvider(BlueskyService)
      .useValue({
        getUserDid: jest.fn(),
        createEventRecord: jest.fn().mockResolvedValue({ rkey: 'test-rkey' }),
        createEvent: jest.fn(),
        updateEvent: jest.fn(),
        deleteEvent: jest.fn(),
      })
      .overrideProvider('DiscussionService')
      .useValue(mockDiscussionService)
      .overrideProvider(EventSeriesService)
      .useValue(mockEventSeriesService)
      .compile();

    eventAttendeeService =
      module.get<EventAttendeeService>(EventAttendeeService);

    const mockEventRoleService = module.get<EventRoleService>(
      EventRoleService,
    ) as jest.Mocked<EventRoleService>;
    mockEventRoleService.getRoleByName = jest
      .fn()
      .mockResolvedValue({ id: 1, name: EventAttendeeRole.Host });

    service = await module.resolve<EventManagementService>(
      EventManagementService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an event', async () => {
      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: EventType.Hybrid,
        location: 'Test Location',
        locationOnline: 'Test Location Online',
        maxAttendees: 100,
        categories: [1, 2],
        lat: 1,
        lon: 1,
      };

      const mockAttendees = [
        {
          id: 1,
          name: 'Attendee 1',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Participant,
        } as unknown as EventAttendeesEntity,
        {
          id: 2,
          name: 'Attendee 2',
          status: EventAttendeeStatus.Confirmed,
          role: EventAttendeeRole.Speaker,
        } as unknown as EventAttendeesEntity,
      ];

      // Mock category service response
      jest.spyOn(service['categoryService'], 'findByIds').mockResolvedValue([
        {
          id: 1,
          name: 'Category 1',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
        {
          id: 2,
          name: 'Category 2',
          attendees: mockAttendees,
        } as unknown as CategoryEntity,
      ]);

      // Mock event attendee service
      jest.spyOn(eventAttendeeService, 'create').mockResolvedValue({
        id: 1,
        userId: TESTING_USER_ID,
        eventId: 1,
        status: EventAttendeeStatus.Confirmed,
        role: EventAttendeeRole.Participant,
        event: { id: 1 } as EventEntity,
        user: { id: TESTING_USER_ID } as UserEntity,
      } as unknown as EventAttendeesEntity);

      jest
        .spyOn(mockRepository, 'save')
        .mockResolvedValue(findOneMockEventEntity);

      const event = await service.create(createEventDto, mockUser.id);
      expect(event).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('attendEvent', () => {
    it('should attend an event', async () => {
      const targetEvent = findOneMockEventEntity;
      const currentMockEventAttendee =
        mockEventAttendee ||
        ({ id: 1, status: EventAttendeeStatus.Confirmed } as any);

      // Restore the original implementation for this test
      jest.spyOn(service, 'attendEvent').mockRestore();

      // Mock repository findOne to return the event
      mockRepository.findOne.mockResolvedValueOnce(targetEvent);

      // Mock userService.getUserById
      const mockUserService = service[
        'userService'
      ] as jest.Mocked<UserService>;
      mockUserService.getUserById.mockResolvedValueOnce(mockUser as any);

      // Mock eventAttendeeService.findEventAttendeeByUserId to return null (no existing record)
      const mockEventAttendeeService = service[
        'eventAttendeeService'
      ] as jest.Mocked<EventAttendeeService>;
      mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
        null,
      );

      // Mock eventRoleService.getRoleByName
      const mockEventRoleService = service[
        'eventRoleService'
      ] as jest.Mocked<EventRoleService>;
      mockEventRoleService.getRoleByName.mockResolvedValueOnce({
        id: 1,
        name: EventAttendeeRole.Participant,
        attendees: [],
        permissions: [],
      } as any);

      // Mock eventAttendeeService.showEventAttendeesCount
      mockEventAttendeeService.showEventAttendeesCount.mockResolvedValueOnce(0);

      // Mock eventAttendeeService.create to return a new attendee
      mockEventAttendeeService.create.mockResolvedValueOnce(
        currentMockEventAttendee,
      );

      // Mock eventMailService.sendMailAttendeeGuestJoined
      const mockEventMailService = service[
        'eventMailService'
      ] as jest.Mocked<EventMailService>;
      mockEventMailService.sendMailAttendeeGuestJoined.mockResolvedValueOnce();

      // Mock the extra findEventAttendeeByUserId call that happens after we find a duplicate
      mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
        currentMockEventAttendee,
      );

      // Convert entity to DTO
      const mockAttendeeDto = {
        ...currentMockEventAttendee,
        sourceType: currentMockEventAttendee.sourceType || undefined,
        sourceId: currentMockEventAttendee.sourceId || undefined,
        sourceUrl: currentMockEventAttendee.sourceUrl || undefined,
        sourceData: currentMockEventAttendee.sourceData || undefined,
        lastSyncedAt: currentMockEventAttendee.lastSyncedAt || undefined,
      };

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        mockAttendeeDto,
      );

      expect(result).toBeDefined();
      expect(mockEventAttendeeService.create).toHaveBeenCalled();
      expect(
        mockEventMailService.sendMailAttendeeGuestJoined,
      ).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.attendee.added',
        expect.any(Object),
      );
    });

    it('should return existing attendee when already attending an event', async () => {
      const targetEvent = findOneMockEventEntity;
      const existingAttendee = {
        id: 1,
        status: EventAttendeeStatus.Confirmed,
        user: mockUser,
        event: targetEvent,
        role: { id: 1, name: EventAttendeeRole.Participant },
      } as any;

      // Restore the original implementation for this test
      jest.spyOn(service, 'attendEvent').mockRestore();

      // Mock repository findOne to return the event
      mockRepository.findOne.mockResolvedValueOnce(targetEvent);

      // Mock userService.getUserById
      const mockUserService = service[
        'userService'
      ] as jest.Mocked<UserService>;
      mockUserService.getUserById.mockResolvedValueOnce(mockUser as any);

      // Mock eventAttendeeService.findEventAttendeeByUserId to return an existing record
      const mockEventAttendeeService = service[
        'eventAttendeeService'
      ] as jest.Mocked<EventAttendeeService>;
      mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
        existingAttendee,
      );

      // Convert entity to DTO
      const mockAttendeeDto = {
        ...existingAttendee,
        sourceType: existingAttendee.sourceType || undefined,
        sourceId: existingAttendee.sourceId || undefined,
        sourceUrl: existingAttendee.sourceUrl || undefined,
        sourceData: existingAttendee.sourceData || undefined,
        lastSyncedAt: existingAttendee.lastSyncedAt || undefined,
      };

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        mockAttendeeDto,
      );

      // Should return the existing attendee without creating a new one
      expect(result).toEqual(existingAttendee);
      expect(mockEventAttendeeService.create).not.toHaveBeenCalled();
      expect(
        mockEventAttendeeService.findEventAttendeeByUserId,
      ).toHaveBeenCalledWith(targetEvent.id, mockUser.id);
    });

    it('should handle duplicate key errors when creating attendee record', async () => {
      const targetEvent = findOneMockEventEntity;
      const existingAttendee = {
        id: 1,
        status: EventAttendeeStatus.Confirmed,
        user: mockUser,
        event: targetEvent,
        role: { id: 1, name: EventAttendeeRole.Participant },
      } as any;

      // Restore the original implementation for this test
      jest.spyOn(service, 'attendEvent').mockRestore();

      // Mock repository findOne to return the event
      mockRepository.findOne.mockResolvedValueOnce(targetEvent);

      // Mock userService.getUserById
      const mockUserService = service[
        'userService'
      ] as jest.Mocked<UserService>;
      mockUserService.getUserById.mockResolvedValueOnce(mockUser as any);

      // Mock eventAttendeeService.findEventAttendeeByUserId to initially return null
      // and then return an existing record after the duplicate error
      const mockEventAttendeeService = service[
        'eventAttendeeService'
      ] as jest.Mocked<EventAttendeeService>;
      mockEventAttendeeService.findEventAttendeeByUserId
        .mockResolvedValueOnce(null) // Initial check - no record found
        .mockResolvedValueOnce(existingAttendee); // Second check after duplicate error

      // Mock eventRoleService.getRoleByName
      const mockEventRoleService = service[
        'eventRoleService'
      ] as jest.Mocked<EventRoleService>;
      mockEventRoleService.getRoleByName.mockResolvedValueOnce({
        id: 1,
        name: EventAttendeeRole.Participant,
        attendees: [],
        permissions: [],
      } as any);

      // Mock eventAttendeeService.showEventAttendeesCount
      mockEventAttendeeService.showEventAttendeesCount.mockResolvedValueOnce(0);

      // Mock eventAttendeeService.create to throw a duplicate error
      mockEventAttendeeService.create.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint'),
      );

      // Convert entity to DTO
      const mockAttendeeDto = {
        ...existingAttendee,
        sourceType: existingAttendee.sourceType || undefined,
        sourceId: existingAttendee.sourceId || undefined,
        sourceUrl: existingAttendee.sourceUrl || undefined,
        sourceData: existingAttendee.sourceData || undefined,
        lastSyncedAt: existingAttendee.lastSyncedAt || undefined,
      };

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        mockAttendeeDto,
      );

      // Should handle the duplicate error and return the existing record
      expect(result).toEqual(existingAttendee);
      expect(mockEventAttendeeService.create).toHaveBeenCalled();
      expect(
        mockEventAttendeeService.findEventAttendeeByUserId,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelAttendingEvent', () => {
    it('should cancel attending an event', async () => {
      const targetEvent = findOneMockEventEntity;
      const currentMockEventAttendee =
        mockEventAttendee ||
        ({ id: 1, status: EventAttendeeStatus.Cancelled } as any);

      jest
        .spyOn(service, 'cancelAttendingEvent')
        .mockResolvedValue(currentMockEventAttendee);

      const result = await service.cancelAttendingEvent(
        targetEvent.slug,
        mockUser.id,
      );
      expect(result).toEqual(currentMockEventAttendee);
    });
  });

  describe('Event Series Integration', () => {
    beforeEach(() => {
      mockRepository.findAndCount.mockResolvedValue([
        [fullMockEvent1, fullMockEvent2],
        2,
      ]);
    });

    it('should find events by series slug (preferred method)', async () => {
      const seriesSlug = mockSeriesSlug;
      const options = { page: 1, limit: 10 };

      // Call the actual method which delegates to eventQueryService
      const [events, count] = await service.findEventsBySeriesSlug(
        seriesSlug,
        options,
      );

      // Verify results
      expect(events).toHaveLength(2);
      expect(count).toBe(2);
      expect(events[0].id).toBe(fullMockEvent1.id);
      expect(events[1].id).toBe(fullMockEvent2.id);
      expect(events[0].seriesSlug).toBe(mockSeriesSlug);
      expect(events[1].seriesSlug).toBe(mockSeriesSlug);

      // Verify the eventQueryService.findEventsBySeriesSlug was called
      expect(mockEventQueryService.findEventsBySeriesSlug).toHaveBeenCalledWith(
        seriesSlug,
        options,
      );
    });

    it('should create an event occurence as part of a series using slug (preferred method)', async () => {
      const createdEvent = {
        ...findOneMockEventEntity,
        id: 999,
      } as EventEntity;
      jest.spyOn(service, 'create').mockResolvedValue(createdEvent);

      mockRepository.update.mockResolvedValue({ affected: 1 } as any);
      mockRepository.findOne.mockResolvedValue(createdEvent);

      const createDto: CreateEventDto = {
        name: 'Test Series Event',
        description: 'Test Description',
        type: EventType.InPerson,
        startDate: new Date('2023-10-01T12:00:00Z'),
        endDate: new Date('2023-10-01T13:00:00Z'),
        categories: [],
        locationOnline: 'false',
        maxAttendees: 100,
        lat: 0,
        lon: 0,
      };

      const result = await service.createSeriesOccurrence(
        createDto,
        mockUser.id,
        mockSeriesSlug,
        new Date('2023-10-01T12:00:00Z'),
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(createdEvent.id);
      expect(result.series.id).toBe(mockSeriesId);
      expect(result.seriesSlug).toBe(mockSeriesSlug);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          seriesSlug: mockSeriesSlug,
        }),
        mockUser.id,
        expect.anything(),
      );
      expect(mockRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: createdEvent.id } }),
      );
    });

    it('should create an event with recurrence rule and create a series', async () => {
      // Mock for the created event
      const eventWithoutSeries = {
        ...findOneMockEventEntity,
        id: 900,
        seriesSlug: null,
        series: null,
      } as unknown as EventEntity;

      // Mock for the event after series is created
      const eventWithSeries = {
        ...findOneMockEventEntity,
        id: 900,
        seriesSlug: mockSeriesSlug,
        series: { id: mockSeriesId, slug: mockSeriesSlug } as any,
      } as unknown as EventEntity;

      // Mock series for the createRecurringEvent method
      const mockSeries = {
        id: mockSeriesId,
        slug: mockSeriesSlug,
        templateEvent: eventWithSeries,
      };

      // First create returns event without series
      jest.spyOn(service, 'create').mockResolvedValueOnce(eventWithoutSeries);

      // Mock the eventSeriesService.create to return a series with the template event
      mockEventSeriesService.create = jest.fn().mockResolvedValue(mockSeries);

      // Initial event creation data with recurrence rule
      const createDto: CreateEventDto = {
        name: 'Recurring Test Event',
        description: 'Test Description for Recurring Event',
        type: EventType.InPerson,
        startDate: new Date('2023-10-01T12:00:00Z'),
        endDate: new Date('2023-10-01T13:00:00Z'),
        categories: [],
        locationOnline: 'false',
        maxAttendees: 100,
        lat: 0,
        lon: 0,
        recurrenceRule: {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          count: 5,
          byweekday: ['MO', 'WE', 'FR'],
        },
        timeZone: 'America/New_York',
      };

      // Call the createRecurringEvent method
      const result = await service.createRecurringEvent(createDto, mockUser.id);

      // Verify the result
      expect(result).toBeDefined();
      expect(result.id).toBe(eventWithSeries.id);
      expect(result.seriesSlug).toBe(mockSeriesSlug);

      // Verify create was called with the initial event data
      expect(service.create).toHaveBeenCalledWith(createDto, mockUser.id);

      // Verify eventSeriesService.create was called with correct data
      expect(mockEventSeriesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          description: createDto.description,
          recurrenceRule: createDto.recurrenceRule,
          templateEventSlug: eventWithoutSeries.slug,
        }),
        mockUser.id,
      );
    });

    it('should update an event to add recurrence rule and create a series', async () => {
      // Setup an existing event with an existing series
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 800,
        seriesSlug: 'existing-series',
        series: { id: 999, slug: 'existing-series' } as any,
      } as unknown as EventEntity;

      // Mock for the event after updating with series
      const updatedEventWithSeries = {
        ...existingEvent,
        name: 'Updated Recurring Event',
        seriesSlug: 'existing-series',
        series: { id: 999, slug: 'existing-series' } as any,
      } as unknown as EventEntity;

      // Mock series for the updateRecurringEvent method
      const mockSeries = {
        id: 999,
        slug: 'existing-series',
        templateEvent: updatedEventWithSeries,
      };

      // Initialize service.eventRepository
      await service['initializeRepository']();

      // Mock repository.findOne to return the existing event with series
      mockRepository.findOne.mockResolvedValueOnce(existingEvent);

      // Mock eventSeriesService.update to return a series with the updated event
      mockEventSeriesService.update = jest.fn().mockResolvedValue(mockSeries);

      // Update data with recurrence rule
      const updateDto: UpdateEventDto = {
        name: 'Updated Recurring Event',
        recurrenceRule: {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          count: 3,
          byweekday: ['TU', 'TH'],
        },
        timeZone: 'Europe/London',
      };

      // Call the updateRecurringEvent method
      const result = await service.updateRecurringEvent(
        existingEvent.id,
        updateDto,
        mockUser.id,
      );

      // Verify the result
      expect(result).toBeDefined();
      expect(result.id).toBe(updatedEventWithSeries.id);
      expect(result.name).toBe(updateDto.name);
      expect(result.seriesSlug).toBe('existing-series');

      // Verify repository.findOne was called with the event ID
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: existingEvent.id },
        relations: ['series'],
      });

      // Verify eventSeriesService.update was called with correct data
      expect(mockEventSeriesService.update).toHaveBeenCalledWith(
        'existing-series',
        expect.objectContaining({
          name: updateDto.name,
          recurrenceRule: updateDto.recurrenceRule,
        }),
        mockUser.id,
      );
    });

    it('should update an event and add recurrence rule through the update method', async () => {
      // Setup an existing event (no series yet)
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 700,
        slug: 'event-to-make-recurring',
        seriesSlug: null,
        series: null,
      } as unknown as EventEntity;

      // Initialize repositories
      await service['initializeRepository']();

      // Create a mock series that would be created by EventSeriesService
      const mockSeries = {
        id: 555,
        slug: 'new-series-slug',
        templateEventSlug: existingEvent.slug,
      } as EventSeriesEntity;

      // Mock updated event with series info that should be returned after the update
      const updatedEvent = {
        ...existingEvent,
        name: 'Now a Recurring Event',
        seriesSlug: 'new-series-slug',
        series: { id: 555, slug: 'new-series-slug' } as any,
        recurrenceRule: {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          count: 4,
        },
      } as unknown as EventEntity;

      // Reset mocks
      mockRepository.findOne.mockReset();
      mockEventSeriesService.createFromExistingEvent = jest
        .fn()
        .mockResolvedValue(mockSeries);

      // Mock multiple findOne calls for different stages of the update process
      mockRepository.findOne.mockImplementation((options: any) => {
        const whereOptions = options.where || {};
        const slugToFind =
          typeof whereOptions === 'object' ? whereOptions.slug : null;

        // First call will return the original event
        if (slugToFind === 'event-to-make-recurring') {
          // If relations include 'series' or 'user', etc., this is the second call after updating
          if (options.relations && options.relations.includes('user')) {
            return Promise.resolve(updatedEvent);
          }
          return Promise.resolve(existingEvent);
        }
        return Promise.resolve(null);
      });

      // Create the update DTO with recurrence rule
      const updateDto: UpdateEventDto = {
        name: 'Now a Recurring Event',
        recurrenceRule: {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          count: 4,
          byweekday: ['MO', 'WE'],
        },
        timeZone: 'America/Chicago',
        isRecurring: true, // Flag to indicate this should become a recurring event
      };

      // Call the update method
      const result = await service.update('event-to-make-recurring', updateDto);

      // Verify the result
      expect(result).toBeDefined();
      expect(result.name).toBe('Now a Recurring Event');
      expect(result.seriesSlug).toBe('new-series-slug');

      // Verify findOne was called with the correct slug
      expect(mockRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'event-to-make-recurring' },
        }),
      );

      // Verify the eventSeriesService.createFromExistingEvent was called
      expect(
        mockEventSeriesService.createFromExistingEvent,
      ).toHaveBeenCalledWith(
        'event-to-make-recurring',
        expect.objectContaining({
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          count: 4,
          byweekday: ['MO', 'WE'],
        }),
        expect.any(Number),
        undefined,
        undefined,
        'America/Chicago',
        expect.any(Object),
      );
    });
  });

  afterAll(() => {
    stopCleanupInterval();
  });
});
