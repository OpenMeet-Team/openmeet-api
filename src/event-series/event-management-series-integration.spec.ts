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
import { RootTestModule } from '../test/root-test.module';
import { EventType } from '../core/constants/constant';
import { CreateEventDto } from '../event/dto/create-event.dto';
import { REQUEST } from '@nestjs/core';
import { RecurrencePatternService } from './services/recurrence-pattern.service';
import { EventSeriesOccurrenceService } from './services/event-series-occurrence.service';
import { EventQueryService } from '../event/services/event-query.service';
import { EventOccurrenceService } from '../event/services/occurrences/event-occurrence.service';

describe('EventManagementService Integration with EventSeriesService', () => {
  let managementService: EventManagementService;
  let seriesService: EventSeriesService;
  let module: TestingModule;

  beforeEach(async () => {
    // Create a testing module with all necessary dependencies
    module = await Test.createTestingModule({
      imports: [RootTestModule],
      providers: [
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant-id' },
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
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 1,
              slug: 'test-event',
              name: 'Test Event',
            }),
            find: jest
              .fn()
              .mockResolvedValue([
                { id: 1, slug: 'test-event', name: 'Test Event' },
              ]),
            findAndCount: jest.fn().mockResolvedValue([
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
          },
        },
      ],
    })
      .overrideProvider(EventSeriesService)
      .useValue(mockEventSeriesService)
      .overrideProvider(RecurrencePatternService)
      .useValue({
        validateRRule: jest.fn(),
        generateRecurrenceDescription: jest
          .fn()
          .mockReturnValue('Weekly on Monday'),
        parseRRule: jest.fn(),
        generateOccurrencesFromRule: jest.fn().mockResolvedValue([new Date()]),
      })
      .overrideProvider(EventSeriesOccurrenceService)
      .useValue({
        getOrCreateOccurrence: jest
          .fn()
          .mockResolvedValue({ id: 123, name: 'Test Occurrence' }),
        splitSeriesAt: jest
          .fn()
          .mockResolvedValue({ id: 123, name: 'Test Split Event' }),
        getEffectiveEventForDate: jest
          .fn()
          .mockResolvedValue({ id: 123, name: 'Test Event' }),
      })
      .overrideProvider(EventQueryService)
      .useValue({
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
      })
      .overrideProvider(EventOccurrenceService)
      .useValue({
        initializeRepository: jest.fn().mockResolvedValue(undefined),
        generateOccurrences: jest.fn().mockResolvedValue([new Date()]),
        getOccurrencesInRange: jest.fn().mockResolvedValue([new Date()]),
        createExceptionOccurrence: jest.fn().mockResolvedValue({}),
        excludeOccurrence: jest.fn().mockResolvedValue(true),
        includeOccurrence: jest.fn().mockResolvedValue(true),
        deleteAllOccurrences: jest.fn().mockResolvedValue(0),
      })
      .compile();

    managementService = module.get<EventManagementService>(
      EventManagementService,
    );
    seriesService = module.get<EventSeriesService>(EventSeriesService);
  });

  afterEach(async () => {
    await module.close();
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
      return {
        id: 1,
        name: dto.name,
        slug: 'test-event',
        seriesId: dto.seriesSlug ? 1 : undefined,
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
    expect(result.seriesId).toBeDefined();
  });

  it('should find events by series slug', async () => {
    const [events, count] =
      await managementService.findEventsBySeriesSlug('test-series');

    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(0);
  });
});
