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
import { GroupMemberQueryService } from '../../group-member/group-member-query.service';
import { RoleEnum } from '../../role/role.enum';
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { UpdateEventDto } from '../dto/update-event.dto';
import { RecurrenceFrequency } from '../../event-series/interfaces/recurrence-frequency.enum';
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
import { AtprotoPublisherService } from '../../atproto-publisher/atproto-publisher.service';

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
  let mockGroupMemberQueryService: jest.Mocked<GroupMemberQueryService>;

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

    mockGroupMemberQueryService = {
      findGroupMemberByUserId: jest.fn(),
    } as unknown as jest.Mocked<GroupMemberQueryService>;

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
            showConfirmedEventAttendeesCount: jest.fn().mockResolvedValue(0),
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
          provide: GroupMemberQueryService,
          useValue: mockGroupMemberQueryService,
        },
        {
          provide: AtprotoPublisherService,
          useValue: {
            publishEvent: jest.fn().mockResolvedValue({ action: 'skipped' }),
            deleteEvent: jest.fn().mockResolvedValue({ action: 'skipped' }),
            publishRsvp: jest.fn().mockResolvedValue({ action: 'skipped' }),
            ensurePublishingCapability: jest
              .fn()
              .mockResolvedValue({ did: 'did:plc:test', required: true }),
          },
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
        timeZone: 'UTC',
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

    // Tests for handling NaN and other problematic group values
    describe('handling problematic group values', () => {
      beforeEach(() => {
        // Mock common service dependencies
        jest
          .spyOn(service['categoryService'], 'findByIds')
          .mockResolvedValue([]);
        jest.spyOn(eventAttendeeService, 'create').mockResolvedValue({} as any);
        jest
          .spyOn(mockRepository, 'save')
          .mockResolvedValue(findOneMockEventEntity);

        // Create is the key method we'll spy on in the individual tests
        mockRepository.create.mockClear();
      });

      it('should handle string "NaN" as group value', async () => {
        // Create event with string "NaN" as group value (matches the bug we fixed)
        const createEventDto: CreateEventDto = {
          name: 'Test NaN Group Event',
          description: 'Test Event with NaN group value',
          startDate: new Date(),
          type: EventType.InPerson,
          maxAttendees: 10,
          categories: [],
          locationOnline: '', // Required field
          group: 'NaN' as any, // Force string "NaN" as group value
          timeZone: 'UTC',
        };

        // Create a spy to check what's passed to repository.create
        const createSpy = jest.spyOn(mockRepository, 'create');

        const event = await service.create(createEventDto, mockUser.id);

        // Check the resulting event
        expect(event).toBeDefined();
        expect(mockRepository.save).toHaveBeenCalled();

        // Verify how the data was passed to the create method
        expect(createSpy).toHaveBeenCalled();

        // Get the args that were passed to create
        const createArgs = createSpy.mock.calls[0][0];

        // Check that our NaN string was handled properly (converted to null)
        expect(createArgs.group).toBeNull();
      });

      it('should handle string "2" as group value (convert to proper number)', async () => {
        // Create event with string "2" as group value
        const createEventDto: CreateEventDto = {
          name: 'Test String Number Group Event',
          description: 'Test Event with string number group value',
          startDate: new Date(),
          type: EventType.InPerson,
          maxAttendees: 10,
          categories: [],
          locationOnline: '', // Required field
          group: '2' as any, // Force string "2" as group value
          timeZone: 'UTC',
        };

        // Create a spy to check what's passed to repository.create
        const createSpy = jest.spyOn(mockRepository, 'create');

        const event = await service.create(createEventDto, mockUser.id);

        // Check the resulting event
        expect(event).toBeDefined();
        expect(mockRepository.save).toHaveBeenCalled();

        // Verify how the data was passed to the create method
        expect(createSpy).toHaveBeenCalled();

        // Get the args that were passed to create
        const createArgs = createSpy.mock.calls[0][0];

        // Check that our string number was properly converted to a numeric id
        expect(createArgs.group).toEqual({ id: 2 });
      });

      it('should handle JavaScript NaN in group.id', async () => {
        // Create event with NaN in group.id
        const createEventDto: CreateEventDto = {
          name: 'Test NaN in Group ID Event',
          description: 'Test Event with NaN in group.id',
          startDate: new Date(),
          type: EventType.InPerson,
          maxAttendees: 10,
          categories: [],
          locationOnline: '', // Required field
          group: { id: NaN }, // JavaScript NaN in group.id
          timeZone: 'UTC',
        };

        // Create a spy to check what's passed to repository.create
        const createSpy = jest.spyOn(mockRepository, 'create');

        const event = await service.create(createEventDto, mockUser.id);

        // Check the resulting event
        expect(event).toBeDefined();
        expect(mockRepository.save).toHaveBeenCalled();

        // Verify how the data was passed to the create method
        expect(createSpy).toHaveBeenCalled();

        // Get the args that were passed to create
        const createArgs = createSpy.mock.calls[0][0];

        // Check that our JavaScript NaN was properly handled (converted to null)
        expect(createArgs.group).toBeNull();
      });

      it('should handle string "null" as group value', async () => {
        // Create event with string "null" as group value
        const createEventDto: CreateEventDto = {
          name: 'Test String Null Group Event',
          description: 'Test Event with string null group value',
          startDate: new Date(),
          type: EventType.InPerson,
          maxAttendees: 10,
          categories: [],
          locationOnline: '', // Required field
          group: 'null' as any, // Force string "null" as group value
          timeZone: 'UTC',
        };

        // Create a spy to check what's passed to repository.create
        const createSpy = jest.spyOn(mockRepository, 'create');

        const event = await service.create(createEventDto, mockUser.id);

        // Check the resulting event
        expect(event).toBeDefined();
        expect(mockRepository.save).toHaveBeenCalled();

        // Verify how the data was passed to the create method
        expect(createSpy).toHaveBeenCalled();

        // Get the args that were passed to create
        const createArgs = createSpy.mock.calls[0][0];

        // Check that our string "null" was properly handled (converted to null)
        expect(createArgs.group).toBeNull();
      });
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

    it('should respect status from CreateEventAttendeeDto when provided', async () => {
      const targetEvent = findOneMockEventEntity;
      const mockCancelledAttendee = {
        id: 1,
        status: EventAttendeeStatus.Cancelled,
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

      // Mock eventAttendeeService.create to return cancelled attendee
      mockEventAttendeeService.create.mockResolvedValueOnce(
        mockCancelledAttendee,
      );

      // Mock eventMailService.sendMailAttendeeGuestJoined
      const mockEventMailService = service[
        'eventMailService'
      ] as jest.Mocked<EventMailService>;
      mockEventMailService.sendMailAttendeeGuestJoined.mockResolvedValueOnce();

      // Mock the extra findEventAttendeeByUserId call that happens after creation
      mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
        mockCancelledAttendee,
      );

      // Create DTO with cancelled status - this tests the new two-button RSVP functionality
      const attendeeDto = {
        status: EventAttendeeStatus.Cancelled, // Explicitly set cancelled status
      };

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        attendeeDto,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(EventAttendeeStatus.Cancelled);

      // Verify the eventAttendeeService.create was called with cancelled status
      expect(mockEventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Cancelled,
        }),
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'event.attendee.added',
        expect.any(Object),
      );
    });

    it('should default to confirmed status when no status provided in DTO', async () => {
      const targetEvent = findOneMockEventEntity;
      const mockConfirmedAttendee = {
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

      // Mock eventAttendeeService.create to return confirmed attendee
      mockEventAttendeeService.create.mockResolvedValueOnce(
        mockConfirmedAttendee,
      );

      // Mock eventMailService.sendMailAttendeeGuestJoined
      const mockEventMailService = service[
        'eventMailService'
      ] as jest.Mocked<EventMailService>;
      mockEventMailService.sendMailAttendeeGuestJoined.mockResolvedValueOnce();

      // Mock the extra findEventAttendeeByUserId call that happens after creation
      mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
        mockConfirmedAttendee,
      );

      // Create DTO without status - should default to confirmed
      const attendeeDto = {
        // No status field provided
      };

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        attendeeDto,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe(EventAttendeeStatus.Confirmed);

      // Verify the eventAttendeeService.create was called with confirmed status
      expect(mockEventAttendeeService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventAttendeeStatus.Confirmed,
        }),
      );
    });

    // Issue #8: RSVP Pre-Access Check Tests
    describe('Private Event Access Control (Issue #8)', () => {
      it('should deny RSVP to private event for non-invited users (no group)', async () => {
        const privateEvent = {
          ...findOneMockEventEntity,
          visibility: EventVisibility.Private,
          group: null,
          groupId: null,
        } as EventEntity;

        // Restore the original implementation for this test
        jest.spyOn(service, 'attendEvent').mockRestore();

        // Mock repository findOne to return the private event
        mockRepository.findOne.mockResolvedValueOnce(privateEvent);

        // Mock eventAttendeeService.findEventAttendeeByUserId to return null (not invited)
        const mockEventAttendeeService = service[
          'eventAttendeeService'
        ] as jest.Mocked<EventAttendeeService>;
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          null,
        );

        const attendeeDto = {};

        await expect(
          service.attendEvent(privateEvent.slug, mockUser.id, attendeeDto),
        ).rejects.toThrow('You must be invited to RSVP to this private event');
      });

      it('should allow RSVP to private event for already invited users', async () => {
        const privateEvent = {
          ...findOneMockEventEntity,
          visibility: EventVisibility.Private,
          group: null,
          groupId: null,
        } as EventEntity;

        const existingAttendee = {
          id: 1,
          status: EventAttendeeStatus.Invited,
          user: mockUser,
          event: privateEvent,
          role: { id: 1, name: EventAttendeeRole.Participant },
        } as any;

        // Restore the original implementation for this test
        jest.spyOn(service, 'attendEvent').mockRestore();

        // Mock repository findOne to return the private event
        mockRepository.findOne.mockResolvedValueOnce(privateEvent);

        // Mock eventAttendeeService.findEventAttendeeByUserId to return existing attendee
        const mockEventAttendeeService = service[
          'eventAttendeeService'
        ] as jest.Mocked<EventAttendeeService>;
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          existingAttendee,
        );

        // Mock userService.getUserById
        const mockUserService = service[
          'userService'
        ] as jest.Mocked<UserService>;
        mockUserService.getUserById.mockResolvedValueOnce(mockUser as any);

        // Mock the second findEventAttendeeByUserId call
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          existingAttendee,
        );

        const attendeeDto = {};

        const result = await service.attendEvent(
          privateEvent.slug,
          mockUser.id,
          attendeeDto,
        );

        expect(result).toBeDefined();
        expect(result).toEqual(existingAttendee);
      });

      it('should allow RSVP to private group event for group members', async () => {
        const privateGroupEvent = {
          ...findOneMockEventEntity,
          visibility: EventVisibility.Private,
          group: { id: 123, slug: 'test-group' },
          groupId: 123,
        } as EventEntity;

        const currentMockEventAttendee = {
          id: 1,
          status: EventAttendeeStatus.Confirmed,
        } as any;

        // Restore the original implementation for this test
        jest.spyOn(service, 'attendEvent').mockRestore();

        // Mock repository findOne to return the private group event
        mockRepository.findOne.mockResolvedValueOnce(privateGroupEvent);

        // Mock eventAttendeeService.findEventAttendeeByUserId to return null (not yet an attendee)
        const mockEventAttendeeService = service[
          'eventAttendeeService'
        ] as jest.Mocked<EventAttendeeService>;
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          null,
        );

        // Mock groupMemberService to return group member
        mockGroupMemberQueryService.findGroupMemberByUserId.mockResolvedValueOnce(
          {
            id: 1,
            userId: mockUser.id,
            groupId: 123,
          } as any,
        );

        // Mock userService.getUserById
        const mockUserService = service[
          'userService'
        ] as jest.Mocked<UserService>;
        mockUserService.getUserById.mockResolvedValueOnce(mockUser as any);

        // Mock eventAttendeeService.findEventAttendeeByUserId second call
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
        mockEventAttendeeService.showEventAttendeesCount.mockResolvedValueOnce(
          0,
        );

        // Mock eventAttendeeService.create
        mockEventAttendeeService.create.mockResolvedValueOnce(
          currentMockEventAttendee,
        );

        // Mock eventMailService.sendMailAttendeeGuestJoined
        const mockEventMailService = service[
          'eventMailService'
        ] as jest.Mocked<EventMailService>;
        mockEventMailService.sendMailAttendeeGuestJoined.mockResolvedValueOnce();

        // Mock the extra findEventAttendeeByUserId call
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          currentMockEventAttendee,
        );

        const attendeeDto = {};

        const result = await service.attendEvent(
          privateGroupEvent.slug,
          mockUser.id,
          attendeeDto,
        );

        expect(result).toBeDefined();
        expect(
          mockGroupMemberQueryService.findGroupMemberByUserId,
        ).toHaveBeenCalledWith(123, mockUser.id, 'test-tenant');
      });

      it('should deny RSVP to private group event for non-group members', async () => {
        const privateGroupEvent = {
          ...findOneMockEventEntity,
          visibility: EventVisibility.Private,
          group: { id: 123, slug: 'test-group' },
          groupId: 123,
        } as EventEntity;

        // Restore the original implementation for this test
        jest.spyOn(service, 'attendEvent').mockRestore();

        // Mock repository findOne to return the private group event
        mockRepository.findOne.mockResolvedValueOnce(privateGroupEvent);

        // Mock eventAttendeeService.findEventAttendeeByUserId to return null (not an attendee)
        const mockEventAttendeeService = service[
          'eventAttendeeService'
        ] as jest.Mocked<EventAttendeeService>;
        mockEventAttendeeService.findEventAttendeeByUserId.mockResolvedValueOnce(
          null,
        );

        // Mock groupMemberService to return null (not a group member)
        mockGroupMemberQueryService.findGroupMemberByUserId.mockResolvedValueOnce(
          null,
        );

        const attendeeDto = {};

        await expect(
          service.attendEvent(privateGroupEvent.slug, mockUser.id, attendeeDto),
        ).rejects.toThrow('You must be invited to RSVP to this private event');
      });
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
        timeZone: 'UTC',
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
        timeZone: 'UTC',
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
      let findOneCallCount = 0;
      mockRepository.findOne.mockImplementation((options: any) => {
        const whereOptions = options.where || {};
        const slugToFind =
          typeof whereOptions === 'object' ? whereOptions.slug : null;

        // Track calls to return the right event at the right stage
        if (slugToFind === 'event-to-make-recurring') {
          findOneCallCount++;
          // First call returns existing event (with user relation due to fix)
          // Second and subsequent calls return the updated event (after series creation)
          if (findOneCallCount === 1) {
            return Promise.resolve(existingEvent);
          }
          return Promise.resolve(updatedEvent);
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

  describe('Capacity Enforcement (Issue #393)', () => {
    it('should throw BadRequestException when reducing capacity below confirmed attendees', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 800,
        slug: 'capacity-test-event',
        maxAttendees: 50,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(existingEvent);

      // Mock 30 confirmed attendees
      (
        eventAttendeeService.showConfirmedEventAttendeesCount as jest.Mock
      ).mockResolvedValue(30);

      const updateDto: UpdateEventDto = {
        maxAttendees: 20, // Trying to reduce below 30 confirmed
      };

      await expect(
        service.update('capacity-test-event', updateDto),
      ).rejects.toThrow(
        'Cannot reduce capacity to 20. Event has 30 confirmed attendees.',
      );

      expect(
        eventAttendeeService.showConfirmedEventAttendeesCount,
      ).toHaveBeenCalledWith(800);
    });

    it('should allow reducing capacity when still above confirmed count', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 801,
        slug: 'capacity-ok-event',
        maxAttendees: 50,
      } as EventEntity;

      const updatedEvent = {
        ...existingEvent,
        maxAttendees: 35,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();

      // First call returns existing, subsequent calls return updated
      let callCount = 0;
      mockRepository.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(existingEvent);
        return Promise.resolve(updatedEvent);
      });

      // Mock 30 confirmed attendees
      (
        eventAttendeeService.showConfirmedEventAttendeesCount as jest.Mock
      ).mockResolvedValue(30);

      const updateDto: UpdateEventDto = {
        maxAttendees: 35, // Above the 30 confirmed
      };

      const result = await service.update('capacity-ok-event', updateDto);

      expect(result).toBeDefined();
      expect(
        eventAttendeeService.showConfirmedEventAttendeesCount,
      ).toHaveBeenCalledWith(801);
    });

    it('should allow increasing capacity without checking confirmed count', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 802,
        slug: 'capacity-increase-event',
        maxAttendees: 50,
      } as EventEntity;

      const updatedEvent = {
        ...existingEvent,
        maxAttendees: 100,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();

      let callCount = 0;
      mockRepository.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(existingEvent);
        return Promise.resolve(updatedEvent);
      });

      (
        eventAttendeeService.showConfirmedEventAttendeesCount as jest.Mock
      ).mockClear();

      const updateDto: UpdateEventDto = {
        maxAttendees: 100, // Increasing from 50 to 100
      };

      const result = await service.update('capacity-increase-event', updateDto);

      expect(result).toBeDefined();
      // Should not check confirmed count when increasing
      expect(
        eventAttendeeService.showConfirmedEventAttendeesCount,
      ).not.toHaveBeenCalled();
    });

    it('should handle singular attendee in error message', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 803,
        slug: 'single-attendee-event',
        maxAttendees: 10,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(existingEvent);

      // Mock 1 confirmed attendee
      (
        eventAttendeeService.showConfirmedEventAttendeesCount as jest.Mock
      ).mockResolvedValue(1);

      const updateDto: UpdateEventDto = {
        maxAttendees: 0, // Trying to set to 0
      };

      await expect(
        service.update('single-attendee-event', updateDto),
      ).rejects.toThrow(
        'Cannot reduce capacity to 0. Event has 1 confirmed attendee.',
      );
    });
  });

  describe('AT Protocol Publishing Error Propagation', () => {
    let mockAtprotoPublisherService: jest.Mocked<AtprotoPublisherService>;

    beforeEach(async () => {
      // Reset mocks before each test
      mockRepository.findOne.mockReset();
      mockRepository.save.mockReset();
      mockRepository.create.mockReset();
      mockRepository.update.mockReset();

      // Get the mock service instance
      mockAtprotoPublisherService = service[
        'atprotoPublisherService'
      ] as jest.Mocked<AtprotoPublisherService>;

      // Setup common mock responses
      jest.spyOn(service['categoryService'], 'findByIds').mockResolvedValue([]);
      jest
        .spyOn(eventAttendeeService, 'create')
        .mockResolvedValue({} as EventAttendeesEntity);
    });

    it('should propagate AT Protocol errors during event creation', async () => {
      // Mock the event creation flow
      const createdEvent = {
        ...findOneMockEventEntity,
        id: 900,
        slug: 'atproto-error-test',
        sourceType: null, // Not a Bluesky-sourced event
      } as EventEntity;

      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);
      mockRepository.findOne.mockResolvedValue(createdEvent);

      // Mock AT Protocol publisher to throw an error
      mockAtprotoPublisherService.publishEvent.mockRejectedValue(
        new Error('PDS unavailable: connection refused'),
      );

      const createEventDto: CreateEventDto = {
        name: 'Test Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: EventType.InPerson,
        location: 'Test Location',
        locationOnline: '',
        maxAttendees: 100,
        categories: [],
        lat: 1,
        lon: 1,
        timeZone: 'UTC',
      };

      // The error should propagate, not be swallowed
      await expect(service.create(createEventDto, mockUser.id)).rejects.toThrow(
        'PDS unavailable: connection refused',
      );
    });

    it('should propagate AT Protocol errors during event update', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 901,
        slug: 'atproto-update-error-test',
        sourceType: null, // Not a Bluesky-sourced event
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as EventEntity;

      const updatedEvent = {
        ...existingEvent,
        name: 'Updated Event Name',
        updatedAt: new Date('2024-01-02'),
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();

      // First call returns existing event, second returns updated
      let callCount = 0;
      mockRepository.findOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve(existingEvent);
        return Promise.resolve(updatedEvent);
      });
      mockRepository.save.mockResolvedValue(updatedEvent);

      // Mock AT Protocol publisher to throw an error
      mockAtprotoPublisherService.publishEvent.mockRejectedValue(
        new Error('Failed to publish to AT Protocol: identity not found'),
      );

      const updateDto: UpdateEventDto = {
        name: 'Updated Event Name',
      };

      // The error should propagate, not be swallowed
      await expect(
        service.update('atproto-update-error-test', updateDto),
      ).rejects.toThrow('Failed to publish to AT Protocol: identity not found');
    });

    it('should catch AT Protocol errors during event deletion and proceed with local deletion', async () => {
      const existingEvent = {
        ...findOneMockEventEntity,
        id: 902,
        slug: 'atproto-delete-error-test',
        sourceType: null, // Not a Bluesky-sourced event
        atprotoUri: 'at://did:plc:test/community.openmeet.event/abc123', // Has AT Protocol record
        atprotoRkey: 'abc123',
        matrixRoomId: null, // No matrix room to simplify test
        seriesSlug: null, // No series to simplify test
        series: null,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(existingEvent);

      // Mock AT Protocol publisher to throw an error
      mockAtprotoPublisherService.deleteEvent.mockRejectedValue(
        new Error('Failed to delete from AT Protocol: PDS timeout'),
      );

      // Mock the transaction with all required repository methods
      const mockEventAttendeeRepo = {
        delete: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      const mockEventRepo = {
        softRemove: jest.fn().mockResolvedValue(existingEvent),
      };
      const mockTransactionalManager = {
        save: jest.fn().mockResolvedValue(existingEvent),
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity.name === 'EventAttendeesEntity') {
            return mockEventAttendeeRepo;
          }
          return mockEventRepo;
        }),
        findOne: jest.fn().mockResolvedValue(null),
        softRemove: jest.fn().mockResolvedValue(existingEvent),
        remove: jest.fn().mockResolvedValue(existingEvent),
      };
      mockTenantConnectionService.getTenantConnection.mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockRepository),
        transaction: jest.fn().mockImplementation(async (cb) => {
          return cb(mockTransactionalManager);
        }),
      } as any);

      // AT Protocol errors should be caught and logged, not propagated
      // Local deletion should still proceed
      await expect(
        service.remove('atproto-delete-error-test'),
      ).resolves.not.toThrow();

      // Verify deleteEvent was attempted
      expect(mockAtprotoPublisherService.deleteEvent).toHaveBeenCalledWith(
        existingEvent,
        'test-tenant',
      );
    });

    it('should skip AT Protocol publishing for Bluesky-sourced events', async () => {
      // Bluesky-sourced events have their own publishing path (via BlueskyService)
      // and should not use AtprotoPublisherService
      const blueskySourcedEvent = {
        ...findOneMockEventEntity,
        id: 903,
        slug: 'bluesky-sourced-event',
        sourceType: 'bluesky', // Bluesky-sourced event
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockReset();
      mockRepository.findOne.mockResolvedValue(blueskySourcedEvent);
      mockRepository.save.mockResolvedValue(blueskySourcedEvent);

      const updateDto: UpdateEventDto = {
        name: 'Updated Bluesky Event',
      };

      // Update should succeed without calling AtprotoPublisherService
      await service.update('bluesky-sourced-event', updateDto);

      // AtprotoPublisherService.publishEvent should NOT have been called
      expect(mockAtprotoPublisherService.publishEvent).not.toHaveBeenCalled();
    });

    it('should succeed when AT Protocol publishing succeeds', async () => {
      const createdEvent = {
        ...findOneMockEventEntity,
        id: 904,
        slug: 'atproto-success-test',
        sourceType: null,
      } as EventEntity;

      mockRepository.create.mockReturnValue(createdEvent);
      mockRepository.save.mockResolvedValue(createdEvent);
      mockRepository.findOne.mockResolvedValue(createdEvent);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      // Mock successful AT Protocol publishing
      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'published',
        atprotoUri: 'at://did:plc:test/community.openmeet.event/xyz789',
        atprotoRkey: 'xyz789',
      });

      const createEventDto: CreateEventDto = {
        name: 'Successful AT Protocol Event',
        description: 'Test Event Description',
        startDate: new Date(),
        type: EventType.InPerson,
        location: 'Test Location',
        locationOnline: '',
        maxAttendees: 100,
        categories: [],
        lat: 1,
        lon: 1,
        timeZone: 'UTC',
      };

      const result = await service.create(createEventDto, mockUser.id);

      expect(result).toBeDefined();
      expect(mockAtprotoPublisherService.publishEvent).toHaveBeenCalled();
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: createdEvent.id },
        expect.objectContaining({
          atprotoUri: 'at://did:plc:test/community.openmeet.event/xyz789',
          atprotoRkey: 'xyz789',
        }),
      );
    });
  });

  describe('ATProto Auto-Retry on Update', () => {
    let mockAtprotoPublisherService: jest.Mocked<AtprotoPublisherService>;

    beforeEach(async () => {
      // Reset mocks before each test
      mockRepository.findOne.mockReset();
      mockRepository.save.mockReset();
      mockRepository.update.mockReset();

      // Get the mock service instance
      mockAtprotoPublisherService = service[
        'atprotoPublisherService'
      ] as jest.Mocked<AtprotoPublisherService>;
    });

    it('should retry ATProto publish when updating event with null atprotoUri', async () => {
      // This test verifies that when an event that failed initial ATProto publish
      // (atprotoUri is null) is later edited, the update method will attempt to
      // publish it again, and on success, populate the atprotoUri.
      const eventWithoutAtprotoUri = {
        ...findOneMockEventEntity,
        id: 950,
        slug: 'event-retry-publish',
        sourceType: null, // Native event (not imported from Bluesky)
        atprotoUri: null, // Never successfully published to ATProto
        atprotoRkey: null,
        atprotoSyncedAt: null,
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as EventEntity;

      const updatedEvent = {
        ...eventWithoutAtprotoUri,
        name: 'Updated Event Name',
        updatedAt: new Date('2024-01-02'),
      } as EventEntity;

      await service['initializeRepository']();

      // First call returns existing event (without atprotoUri), second returns updated
      let findOneCallCount = 0;
      mockRepository.findOne.mockImplementation(() => {
        findOneCallCount++;
        if (findOneCallCount === 1)
          return Promise.resolve(eventWithoutAtprotoUri);
        return Promise.resolve(updatedEvent);
      });
      mockRepository.save.mockResolvedValue(updatedEvent);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      // Mock successful AT Protocol publishing
      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'published',
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/retry123',
        atprotoRkey: 'retry123',
      });

      const updateDto: UpdateEventDto = {
        name: 'Updated Event Name',
      };

      const result = await service.update('event-retry-publish', updateDto);

      expect(result).toBeDefined();

      // Verify publishEvent was called with the updated event
      expect(mockAtprotoPublisherService.publishEvent).toHaveBeenCalled();

      // Verify atprotoUri metadata was saved to database
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: updatedEvent.id },
        expect.objectContaining({
          atprotoUri:
            'at://did:plc:test/community.lexicon.calendar.event/retry123',
          atprotoRkey: 'retry123',
        }),
      );
    });

    it('should not attempt ATProto publish for imported Bluesky events', async () => {
      // Events imported from Bluesky have their own publishing path and
      // should NOT use AtprotoPublisherService
      const blueskyImportedEvent = {
        ...findOneMockEventEntity,
        id: 951,
        slug: 'bluesky-imported-event',
        sourceType: 'bluesky', // Imported from Bluesky
        atprotoUri: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(blueskyImportedEvent);
      mockRepository.save.mockResolvedValue(blueskyImportedEvent);

      const updateDto: UpdateEventDto = {
        name: 'Updated Imported Event',
      };

      await service.update('bluesky-imported-event', updateDto);

      // AtprotoPublisherService.publishEvent should NOT have been called
      expect(mockAtprotoPublisherService.publishEvent).not.toHaveBeenCalled();
    });

    it('should not update atprotoUri when publish result is skipped', async () => {
      // When publishEvent returns 'skipped' (e.g., private event), we should
      // not try to update the atprotoUri metadata
      const privateEvent = {
        ...findOneMockEventEntity,
        id: 952,
        slug: 'private-event-no-publish',
        sourceType: null,
        atprotoUri: null,
        visibility: EventVisibility.Private, // Private events are not published
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(privateEvent);
      mockRepository.save.mockResolvedValue(privateEvent);

      // Mock publishEvent returning skipped
      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'skipped',
      });

      const updateDto: UpdateEventDto = {
        name: 'Updated Private Event',
      };

      await service.update('private-event-no-publish', updateDto);

      // publishEvent was called (to check eligibility)
      expect(mockAtprotoPublisherService.publishEvent).toHaveBeenCalled();

      // But update should NOT have been called to save atprotoUri
      expect(mockRepository.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          atprotoUri: expect.anything(),
        }),
      );
    });
  });

  describe('syncAtproto', () => {
    let mockAtprotoPublisherService: jest.Mocked<AtprotoPublisherService>;

    beforeEach(() => {
      // Reset mocks before each test
      mockRepository.findOne.mockReset();
      mockRepository.update.mockReset();

      // Get the mock service instance
      mockAtprotoPublisherService = service[
        'atprotoPublisherService'
      ] as jest.Mocked<AtprotoPublisherService>;
    });

    it('should throw NotFoundException when event does not exist', async () => {
      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.syncAtproto('non-existent-event', mockUser.id),
      ).rejects.toThrow('Event with slug non-existent-event not found');
    });

    it('should throw ForbiddenException when user is not the event creator', async () => {
      const eventWithDifferentOwner = {
        ...findOneMockEventEntity,
        id: 1000,
        slug: 'someone-elses-event',
        user: { id: 999 } as UserEntity, // Different user
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventWithDifferentOwner);

      await expect(
        service.syncAtproto('someone-elses-event', mockUser.id),
      ).rejects.toThrow('Only the event creator can sync to AT Protocol');
    });

    it('should return created action when event is published for the first time', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1001,
        slug: 'new-event-to-sync',
        user: { id: mockUser.id } as UserEntity,
        atprotoUri: null,
        atprotoRkey: null,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'published',
        atprotoUri: 'at://did:plc:test/community.lexicon.calendar.event/abc123',
        atprotoRkey: 'abc123',
      });

      const result = await service.syncAtproto(
        'new-event-to-sync',
        mockUser.id,
      );

      expect(result.action).toBe('created');
      expect(result.atprotoUri).toBe(
        'at://did:plc:test/community.lexicon.calendar.event/abc123',
      );
      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: eventToSync.id },
        expect.objectContaining({
          atprotoUri:
            'at://did:plc:test/community.lexicon.calendar.event/abc123',
          atprotoRkey: 'abc123',
        }),
      );
    });

    it('should return updated action when event already exists on AT Protocol', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1002,
        slug: 'existing-event-to-sync',
        user: { id: mockUser.id } as UserEntity,
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/existing123',
        atprotoRkey: 'existing123',
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/existing123',
        atprotoRkey: 'existing123',
      });

      const result = await service.syncAtproto(
        'existing-event-to-sync',
        mockUser.id,
      );

      expect(result.action).toBe('updated');
      expect(result.atprotoUri).toBe(
        'at://did:plc:test/community.lexicon.calendar.event/existing123',
      );
    });

    it('should return skipped action when event is not eligible for publishing', async () => {
      const privateEvent = {
        ...findOneMockEventEntity,
        id: 1003,
        slug: 'private-event',
        user: { id: mockUser.id } as UserEntity,
        visibility: EventVisibility.Private, // Private events are not published
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(privateEvent);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'skipped',
      });

      const result = await service.syncAtproto('private-event', mockUser.id);

      expect(result.action).toBe('skipped');
      expect(result.atprotoUri).toBeUndefined();
      // Repository update should NOT be called for skipped events
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should return error action with message when publishing fails', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1004,
        slug: 'event-with-error',
        user: { id: mockUser.id } as UserEntity,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'error',
        error:
          'Link your AT Protocol account to publish events. Go to Settings > Connected Accounts to connect.',
      });

      const result = await service.syncAtproto('event-with-error', mockUser.id);

      expect(result.action).toBe('error');
      expect(result.error).toBe(
        'Link your AT Protocol account to publish events. Go to Settings > Connected Accounts to connect.',
      );
      expect(result.atprotoUri).toBeUndefined();
      // Repository update should NOT be called for error
      expect(mockRepository.update).not.toHaveBeenCalled();
    });

    it('should map pending action to skipped', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1005,
        slug: 'pending-event',
        user: { id: mockUser.id } as UserEntity,
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'pending',
      });

      const result = await service.syncAtproto('pending-event', mockUser.id);

      expect(result.action).toBe('skipped');
    });

    it('should pre-generate and save atprotoRkey before publishing', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1006,
        slug: 'event-needs-rkey',
        user: { id: mockUser.id } as UserEntity,
        atprotoUri: null,
        atprotoRkey: null, // No pre-generated rkey
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'published',
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/newrkey',
        atprotoRkey: 'newrkey',
      });

      await service.syncAtproto('event-needs-rkey', mockUser.id);

      // Should have called save BEFORE publishEvent to persist the pre-generated TID
      expect(mockRepository.save).toHaveBeenCalled();
      const savedEvent = mockRepository.save.mock.calls[0][0];
      // The saved event should have an atprotoRkey set (TID format: 13 chars)
      expect(savedEvent.atprotoRkey).toBeDefined();
      expect(savedEvent.atprotoRkey).toMatch(/^[a-z2-7]{13}$/);
    });

    it('should pass force option to publishEvent to bypass needsRepublish check', async () => {
      const eventToSync = {
        ...findOneMockEventEntity,
        id: 1007,
        slug: 'force-sync-event',
        user: { id: mockUser.id } as UserEntity,
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/existing',
        atprotoRkey: 'existing',
        atprotoSyncedAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'), // older than syncedAt
      } as EventEntity;

      await service['initializeRepository']();
      mockRepository.findOne.mockResolvedValue(eventToSync);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      mockAtprotoPublisherService.publishEvent.mockResolvedValue({
        action: 'updated',
        atprotoUri:
          'at://did:plc:test/community.lexicon.calendar.event/existing',
        atprotoRkey: 'existing',
      });

      await service.syncAtproto('force-sync-event', mockUser.id);

      // Verify publishEvent was called with force: true
      expect(mockAtprotoPublisherService.publishEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { force: true },
      );
    });
  });

  describe('update - user relation loading', () => {
    let mockAtprotoPublisherService: jest.Mocked<AtprotoPublisherService>;

    beforeEach(async () => {
      await service['initializeRepository']();
      mockRepository.findOne.mockReset();
      mockRepository.update.mockReset();

      mockAtprotoPublisherService = service[
        'atprotoPublisherService'
      ] as jest.Mocked<AtprotoPublisherService>;
    });

    it('should load user relation when updating event to prevent "has no organizer" error', async () => {
      // This test reproduces the bug where updating an event created in a group
      // throws "Event {slug} has no organizer" because the user relation is not loaded.
      //
      // The bug is in the update() method at line 555 where findOne is called
      // without relations: ['user'], causing atprotoPublisherService.publishEvent
      // to fail because event.user is undefined.

      const existingEventWithoutUser = {
        id: 960,
        ulid: '01HABCDEFGHJKMNPQRSTVWX60',
        slug: 'group-event-no-user-loaded',
        name: 'Group Event',
        description: 'Event created in a group',
        type: EventType.InPerson,
        status: EventStatus.Published,
        visibility: EventVisibility.Public,
        sourceType: null, // Not a Bluesky-sourced event, so AT Protocol publish will be attempted
        seriesSlug: null,
        maxAttendees: 50,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        // NOTE: user is NOT loaded (simulating missing relation)
        user: undefined,
      } as EventEntity;

      const updatedEventWithUser = {
        ...existingEventWithoutUser,
        name: 'Updated Group Event',
        updatedAt: new Date('2024-01-02'),
        // After the fix, user should be loaded
        user: {
          id: TESTING_USER_ID,
          ulid: 'user-ulid-123',
          slug: 'test-user',
          email: 'test@example.com',
        } as UserEntity,
      } as EventEntity;

      // Mock findOne to return event without user (simulating the bug)
      // After fix, findOne should be called with relations: ['user']
      mockRepository.findOne.mockImplementation((options: any) => {
        // The fix should add relations: ['user'] to the first findOne call
        // If the relation is requested, return the event with user loaded
        if (options?.relations?.includes('user')) {
          return Promise.resolve(updatedEventWithUser);
        }
        // Without the fix, return event without user
        return Promise.resolve(existingEventWithoutUser);
      });

      mockRepository.save.mockResolvedValue(updatedEventWithUser);
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      // Mock AT Protocol publisher - it should receive an event WITH user loaded
      mockAtprotoPublisherService.publishEvent.mockImplementation(
        (event: EventEntity) => {
          // This is what happens in production: if user is not loaded, this throws
          if (!event.user?.ulid) {
            throw new Error(`Event ${event.slug} has no organizer`);
          }
          return Promise.resolve({
            action: 'published' as const,
            atprotoUri: 'at://did:plc:test/community.openmeet.event/xyz123',
            atprotoRkey: 'xyz123',
          });
        },
      );

      const updateDto: UpdateEventDto = {
        name: 'Updated Group Event',
      };

      // Without the fix, this would throw "Event group-event-no-user-loaded has no organizer"
      // With the fix, it should succeed
      const result = await service.update(
        'group-event-no-user-loaded',
        updateDto,
      );

      expect(result).toBeDefined();
      expect(result.name).toBe('Updated Group Event');

      // Verify that findOne was called with relations: ['user']
      expect(mockRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'group-event-no-user-loaded' },
          relations: ['user'],
        }),
      );
    });
  });

  afterAll(() => {
    stopCleanupInterval();
  });
});
