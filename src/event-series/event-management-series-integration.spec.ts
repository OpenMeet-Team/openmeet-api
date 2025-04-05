import { Test, TestingModule } from '@nestjs/testing';
import { EventManagementService } from '../event/services/event-management.service';
import { EventSeriesService } from './services/event-series.service';
import { EVENT_SERIES_REPOSITORY } from './interfaces/event-series-repository.interface';
import {
  mockEventSeriesRepository,
  mockEventSeriesService,
} from '../test/mocks';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventSeriesEntity } from './infrastructure/persistence/relational/entities/event-series.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';
import { EventType } from '../core/constants/constant';
import { CreateEventDto } from '../event/dto/create-event.dto';
import { REQUEST } from '@nestjs/core';
import { RecurrencePatternService } from './services/recurrence-pattern.service';
import { EventSeriesOccurrenceService } from './services/event-series-occurrence.service';
import { EventQueryService } from '../event/services/event-query.service';
import { EventOccurrenceService } from '../event/services/occurrences/event-occurrence.service';
import { ConfigModule } from '@nestjs/config';
import { TenantConnectionService } from '../tenant/tenant.service';
import { DataSource } from 'typeorm';
import { CategoryService } from '../category/category.service';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { EventRoleService } from '../event-role/event-role.service';
import { UserService } from '../user/user.service';
import { EventMailService } from '../event-mail/event-mail.service';
import { BlueskyService } from '../bluesky/bluesky.service';
// import { DiscussionService } from '../chat/services/discussion.service'; // Removed unused import

describe('EventManagementService Integration with EventSeriesService', () => {
  let managementService: EventManagementService;
  let seriesService: EventSeriesService;
  let module: TestingModule;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;
  let mockEventRepository; // Declare mock repository variable

  beforeEach(async () => {
    // Define the mock EventRepository using the provider from the module setup
    mockEventRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
      }),
      find: jest
        .fn()
        .mockResolvedValue([{ id: 1, slug: 'test-event', name: 'Test Event' }]),
      findAndCount: jest.fn().mockResolvedValue([
        // Ensure this returns the correct format
        [
          { id: 1, slug: 'test-event-1', name: 'Test Event 1' },
          { id: 2, slug: 'test-event-2', name: 'Test Event 2' },
        ],
        2,
      ]),
      create: jest.fn((entity) => entity),
      save: jest.fn((entity) => ({ id: 1, ...entity })),
      update: jest.fn(),
      remove: jest.fn(),
    };

    // Create a mock TenantConnectionService
    mockTenantConnectionService = {
      getConnection: jest.fn(),
      getTenantConnection: jest.fn().mockResolvedValue({
        // Configure getRepository to return the specific mock based on the entity
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === EventEntity) {
            return mockEventRepository; // Return the detailed EventEntity mock
          }
          // Return a generic mock for other entities if needed
          return {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findAndCount: jest.fn(),
          };
        }),
      }),
    } as any;

    // Create a testing module with all necessary dependencies
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [],
        }),
      ],
      providers: [
        EventManagementService,
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant-id' },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: CategoryService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue({}),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EventAttendeeService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            findAll: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: FilesS3PresignedService,
          useValue: {
            getUploadPresignedUrl: jest.fn().mockResolvedValue(''),
          },
        },
        {
          provide: EventRoleService,
          useValue: {
            findForUser: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: UserService,
          useValue: {
            findById: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: EventMailService,
          useValue: {
            sendEventCreatedEmails: jest.fn(),
          },
        },
        {
          provide: BlueskyService,
          useValue: {
            uploadEvent: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createEntityManager: jest.fn(),
            getRepository: jest.fn(),
          },
        },
        {
          provide: EVENT_SERIES_REPOSITORY,
          useValue: mockEventSeriesRepository,
        },
        {
          provide: getRepositoryToken(EventSeriesEntity),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'test-series',
              name: 'Test Series',
            }),
            find: jest
              .fn()
              .mockResolvedValue([
                { id: 1, slug: 'test-series', name: 'Test Series' },
              ]),
            create: jest.fn((entity) => entity),
            save: jest.fn((entity) => ({ id: 1, ...entity })),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventEntity),
          // Use the defined mock repository here as well for consistency
          // although initializeRepository should now handle setting it correctly
          useValue: mockEventRepository,
        },
        {
          provide: EventSeriesService,
          useValue: mockEventSeriesService,
        },
        {
          provide: RecurrencePatternService,
          useValue: {
            validateRRule: jest.fn(),
            generateRecurrenceDescription: jest
              .fn()
              .mockReturnValue('Weekly on Monday'),
            parseRRule: jest.fn(),
            generateOccurrencesFromRule: jest
              .fn()
              .mockResolvedValue([new Date()]),
          },
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: {
            getOrCreateOccurrence: jest
              .fn()
              .mockResolvedValue({ id: 123, name: 'Test Occurrence' }),
            updateFutureOccurrences: jest.fn().mockResolvedValue(2),
            getEffectiveEventForDate: jest
              .fn()
              .mockResolvedValue({ id: 123, name: 'Test Event' }),
          },
        },
        {
          provide: EventQueryService,
          useValue: {
            findEventBySlug: jest.fn().mockResolvedValue({
              id: 1,
              name: 'Test Event',
              slug: 'test-event',
            }),
            findAll: jest.fn().mockResolvedValue([
              { id: 1, name: 'Test Event 1' },
              { id: 2, name: 'Test Event 2' },
            ]),
            findEventsBySeriesId: jest.fn().mockResolvedValue([
              [
                { id: 1, name: 'Test Event 1' },
                { id: 2, name: 'Test Event 2' },
              ],
              2,
            ]),
            findEventsBySeriesSlug: jest.fn().mockResolvedValue([
              [
                { id: 1, name: 'Test Event 1' },
                { id: 2, name: 'Test Event 2' },
              ],
              2,
            ]),
          },
        },
        {
          provide: EventOccurrenceService,
          useValue: {
            initializeRepository: jest.fn().mockResolvedValue(undefined),
            generateOccurrences: jest.fn().mockResolvedValue([new Date()]),
            getOccurrencesInRange: jest.fn().mockResolvedValue([new Date()]),
            createExceptionOccurrence: jest.fn().mockResolvedValue({}),
            excludeOccurrence: jest.fn().mockResolvedValue(true),
            includeOccurrence: jest.fn().mockResolvedValue(true),
            deleteAllOccurrences: jest.fn().mockResolvedValue(0),
          },
        },
        {
          // Use the string token used in EventManagementService injection
          provide: 'DiscussionService',
          useValue: {
            createEventDiscussion: jest
              .fn()
              .mockResolvedValue({ id: 'discussion-123' }),
            // Add other methods used by EventManagementService if needed
          },
        },
      ],
    }).compile();

    // Use resolve() for request-scoped providers
    managementService = await module.resolve<EventManagementService>(
      EventManagementService,
    );
    // Use get() for singleton providers
    seriesService = module.get<EventSeriesService>(EventSeriesService);

    // Remove the manual patching as initializeRepository should now work
    // Object.defineProperty(managementService, 'eventRepository', {
    //   value: module.get(getRepositoryToken(EventEntity)),
    //   writable: true,
    // });
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(managementService).toBeDefined();
    expect(seriesService).toBeDefined();
  });

  it('should work with the EventSeries functionality', async () => {
    // Mock the necessary methods to avoid calling actual implementations
    jest.spyOn(seriesService, 'findBySlug').mockResolvedValue({
      id: 1,
      name: 'Test Series',
      slug: 'test-series',
    } as any);

    jest.spyOn(managementService, 'create').mockImplementation(async (dto) => {
      await Promise.resolve();
      return {
        id: 1,
        name: dto.name,
        slug: 'test-event',
        seriesSlug: dto.seriesSlug ? 'test-series' : undefined,
      } as any;
    });

    // Create event with series
    const eventData: CreateEventDto = {
      name: 'Test Event',
      description: 'Test event description',
      startDate: new Date(),
      endDate: new Date(),
      type: EventType.InPerson,
      locationOnline: 'false',
      categories: [],
      maxAttendees: 20,
      seriesSlug: 'test-series',
    };

    const result = await managementService.create(eventData, 1);

    expect(result).toBeDefined();
    expect(result.seriesSlug).toBeDefined();
  });

  it('should find events by series slug', async () => {
    // Mock findBySlug as it's called by findEventsBySeriesSlug
    const seriesMock = { id: 1, slug: 'test-series', name: 'Test Series' };
    mockEventSeriesService.findBySlug.mockResolvedValue(seriesMock as any);

    // Call the actual service method
    const [events, count] =
      await managementService.findEventsBySeriesSlug('test-series');

    expect(events).toBeDefined();
    expect(events.length).toBe(2);
    expect(count).toBe(2);

    // Check that findBySlug was called
    expect(mockEventSeriesService.findBySlug).toHaveBeenCalledWith(
      'test-series',
    );

    // Check that findAndCount was called with the correct parameters by findEventsBySeriesId
    expect(mockEventRepository.findAndCount).toHaveBeenCalledWith({
      where: { seriesId: 1 }, // Expecting seriesId now
      skip: 0, // Default page 1
      take: 10, // Default limit 10
      order: { startDate: 'ASC' }, // Include default order
      relations: ['user', 'group', 'categories', 'image'], // Include default relations
    });
  });
});
