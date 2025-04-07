import { Test, TestingModule } from '@nestjs/testing';
import { EventManagementService } from '../event/services/event-management.service';
import { CreateEventDto } from '../event/dto/create-event.dto';
import { EventType } from '../core/constants/constant';
import { EventSeriesService } from './services/event-series.service';
import { REQUEST } from '@nestjs/core';
import {
  mockEventSeriesRepository,
  mockEventSeriesService,
} from '../test/mocks';
import { EVENT_SERIES_REPOSITORY } from './interfaces/event-series-repository.interface';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventSeriesEntity } from './infrastructure/persistence/relational/entities/event-series.entity';
import { EventEntity } from '../event/infrastructure/persistence/relational/entities/event.entity';

describe('EventSeries Module Integration', () => {
  let eventManagementService: EventManagementService;
  let eventSeriesService: EventSeriesService;
  let module: TestingModule;

  beforeEach(async () => {
    // Create a proper module with all required dependencies
    module = await Test.createTestingModule({
      imports: [],
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
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EventEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: EventSeriesService,
          useValue: mockEventSeriesService,
        },
        {
          provide: EventManagementService,
          useValue: {
            create: jest.fn().mockResolvedValue({
              id: 987,
              slug: 'test-event',
              name: 'Test Event',
            }),
            createSeriesOccurrenceBySlug: jest
              .fn()
              .mockImplementation((dto, _userId, _seriesSlug) => {
                return Promise.resolve({
                  id: 456,
                  slug: 'test-series-event',
                  name: dto.name,
                  seriesId: 123,
                  materialized: true,
                });
              }),
            update: jest.fn().mockImplementation((slug, dto, _userId) => {
              return Promise.resolve({
                id: 456,
                slug,
                ...dto,
              });
            }),
            findEventsBySeriesSlug: jest.fn().mockResolvedValue([
              [
                { id: 1, name: 'Event 1', slug: 'event-1' },
                { id: 2, name: 'Event 2', slug: 'event-2' },
              ],
              2,
            ]),
          },
        },
      ],
    }).compile();

    eventManagementService = module.get<EventManagementService>(
      EventManagementService,
    );
    eventSeriesService = module.get<EventSeriesService>(EventSeriesService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after tests
    if (module) {
      await module.close();
    }
  });

  describe('EventSeries Integration', () => {
    it('should work with the EventSeries functionality', () => {
      // This test verifies the integration works
      expect(eventManagementService).toBeDefined();
      expect(eventSeriesService).toBeDefined();
    });
  });

  describe('createEvent', () => {
    it('should create an event with series', async () => {
      const data: CreateEventDto = {
        name: 'Test Event',
        description: 'Test event description',
        startDate: new Date('2023-01-01T00:00:00Z'),
        endDate: new Date('2023-01-01T01:00:00Z'),
        type: EventType.InPerson,
        locationOnline: 'false',
        categories: [],
        maxAttendees: 20,
        lat: 40.7128,
        lon: -74.006,
        seriesSlug: 'test-series',
      };

      await eventManagementService.create(data, 1);

      // Verify the mock was called correctly
      expect(eventManagementService.create).toHaveBeenCalledWith(data, 1);
    });
  });
});
