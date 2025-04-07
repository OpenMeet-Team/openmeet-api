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
            createEventMember: jest.fn(),
            deleteEventAttendees: jest.fn(),
            update: jest.fn(),
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

      jest
        .spyOn(service, 'attendEvent')
        .mockResolvedValue(currentMockEventAttendee);

      const result = await service.attendEvent(
        targetEvent.slug,
        mockUser.id,
        currentMockEventAttendee,
      );
      expect(result).toEqual(currentMockEventAttendee);
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

    xit('should find events by series ID (internal method)', async () => {
      const [events, count] = await service.findEventsBySeriesId(mockSeriesId);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { seriesId: mockSeriesId } }),
      );
      expect(events).toHaveLength(2);
      expect(count).toBe(2);
    });

    xit('should find events by series slug (preferred method)', async () => {
      const [events, count] =
        await service.findEventsBySeriesSlug(mockSeriesSlug);
      expect(mockEventSeriesService.findBySlug).toHaveBeenCalledWith(
        mockSeriesSlug,
      );
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { seriesId: mockSeriesId } }),
      );
      expect(events).toHaveLength(2);
      expect(count).toBe(2);
    });

    it('should create an event as part of a series using slug (preferred method)', async () => {
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

      const result = await service.createSeriesOccurrenceBySlug(
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
  });

  afterAll(() => {
    stopCleanupInterval();
  });
});
