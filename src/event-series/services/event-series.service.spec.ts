import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesService } from './event-series.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { Repository } from 'typeorm';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RecurrenceFrequency } from '../interfaces/recurrence.interface';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { EventQueryService } from '../../event/services/event-query.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';

describe('EventSeriesService', () => {
  let service: EventSeriesService;
  let mockRecurrencePatternService: jest.Mocked<RecurrencePatternService>;
  let mockEventManagementService: jest.Mocked<EventManagementService>;
  let mockEventSeriesRepository: jest.Mocked<Repository<EventSeriesEntity>>;
  let mockEventQueryService: jest.Mocked<any>;
  let mockTenantConnectionService: jest.Mocked<TenantConnectionService>;

  beforeEach(async () => {
    mockRecurrencePatternService = {
      generateOccurrences: jest.fn(),
      validateRecurrenceRule: jest.fn(),
      generateRecurrenceDescription: jest
        .fn()
        .mockReturnValue('Weekly on Monday'),
    } as any;

    mockEventManagementService = {
      create: jest.fn(),
      update: jest.fn(),
      createSeriesOccurrence: jest
        .fn()
        .mockResolvedValue({ slug: 'test-event' }),
    } as any;

    mockEventSeriesRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findOneBy: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Test Series',
        slug: 'test-series',
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'test-ulid-123456789',
        description: 'Test Description',
        recurrenceRule: {},
        recurrenceExceptions: [],
        templateEventSlug: 'test-event',
        matrixRoomId: undefined,
        user: { id: 1 },
        events: [],
        sourceType: null,
        sourceId: null,
        sourceUrl: null,
        sourceData: null,
        templateEvent: null,
      } as any),
      findByIds: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Test Series',
        slug: 'test-series',
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'test-ulid-123456789',
        description: 'Test Description',
        recurrenceRule: {},
        recurrenceExceptions: [],
        templateEventSlug: 'test-event',
        matrixRoomId: undefined,
        user: { id: 1 },
        events: [],
        sourceType: null,
        sourceId: null,
        sourceUrl: null,
        sourceData: null,
        templateEvent: null,
      } as any),
    } as any;

    mockEventQueryService = {
      findEventBySlug: jest.fn(),
    } as any;

    mockTenantConnectionService = {
      getConnection: jest.fn(),
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest.fn().mockReturnValue(mockEventSeriesRepository),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        {
          provide: RecurrencePatternService,
          useValue: mockRecurrencePatternService,
        },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
        {
          provide: getRepositoryToken(EventSeriesEntity),
          useValue: mockEventSeriesRepository,
        },
        {
          provide: 'EVENT_SERIES_REPOSITORY',
          useValue: mockEventSeriesRepository,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: REQUEST,
          useValue: { tenantId: 'test-tenant-id' },
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
      ],
    }).compile();

    service = module.get<EventSeriesService>(EventSeriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new event series', async () => {
      const createEventSeriesDto: CreateEventSeriesDto = {
        name: 'Test Series',
        description: 'Test Description',
        templateEvent: {
          startDate: '2024-01-01T10:00:00Z',
          endDate: '2024-01-01T11:00:00Z',
          type: 'in-person',
          locationOnline: 'https://meet.example.com',
          maxAttendees: 10,
          categories: [1, 2],
        },
        recurrenceRule: {
          frequency: RecurrenceFrequency.DAILY,
          interval: 1,
          count: 5,
        },
      };

      const savedSeries = {
        id: 1,
        name: 'Test Series',
        slug: 'test-series',
        templateEventSlug: 'test-event',
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'test-ulid-123456789',
        description: 'Test Description',
        recurrenceRule: {},
        recurrenceExceptions: [],
        matrixRoomId: undefined,
        user: { id: 1 },
        events: [],
        sourceType: null,
        sourceId: null,
        sourceUrl: null,
        sourceData: null,
        templateEvent: null,
      };

      mockEventSeriesRepository.create.mockReturnValue(savedSeries as any);
      mockEventSeriesRepository.save.mockResolvedValue(savedSeries as any);
      mockEventSeriesRepository.findOneBy.mockResolvedValue(savedSeries as any);

      const result = await service.create(createEventSeriesDto, 1);

      expect(result).toEqual(
        expect.objectContaining({
          id: savedSeries.id,
          name: savedSeries.name,
          slug: savedSeries.slug,
          templateEventSlug: savedSeries.templateEventSlug,
          description: savedSeries.description,
        }),
      );
      expect(mockEventSeriesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createEventSeriesDto.name,
          description: createEventSeriesDto.description,
          recurrenceRule: createEventSeriesDto.recurrenceRule,
        }),
      );
      expect(mockEventSeriesRepository.save).toHaveBeenCalledWith(savedSeries);
      expect(
        mockEventManagementService.createSeriesOccurrence,
      ).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an event series', async () => {
      const seriesSlug = 'test-series';
      const series = {
        id: 1,
        slug: seriesSlug,
        name: 'Test Series',
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'test-ulid-123456789',
        description: 'Test Description',
        recurrenceRule: {},
        recurrenceExceptions: [],
        templateEventSlug: 'test-event',
        matrixRoomId: undefined,
        user: { id: 1 },
        events: [],
        sourceType: null,
        sourceId: null,
        sourceUrl: null,
        sourceData: null,
        templateEvent: null,
      };

      const updateEventSeriesDto: CreateEventSeriesDto = {
        name: 'Updated Series',
        description: 'Updated Description',
        templateEvent: {
          startDate: '2024-01-01T10:00:00Z',
          endDate: '2024-01-01T11:00:00Z',
          type: 'in-person',
          locationOnline: 'https://meet.example.com',
          maxAttendees: 10,
          categories: [1, 2],
        },
        recurrenceRule: {
          frequency: RecurrenceFrequency.DAILY,
          interval: 1,
          count: 5,
        },
      };

      const updatedSeries = {
        id: series.id,
        slug: series.slug,
        name: 'Updated Series',
        createdAt: series.createdAt,
        updatedAt: new Date(),
        ulid: series.ulid,
        description: 'Updated Description',
        recurrenceRule: {},
        recurrenceExceptions: [],
        templateEventSlug: 'test-event',
        matrixRoomId: undefined,
        user: { id: 1 },
        events: [],
        sourceType: null,
        sourceId: null,
        sourceUrl: null,
        sourceData: null,
        templateEvent: null,
      };

      mockEventSeriesRepository.findOne.mockResolvedValue(series as any);
      mockEventSeriesRepository.save.mockResolvedValue(updatedSeries as any);

      const findBySlugSpy = jest
        .spyOn(service, 'findBySlug')
        .mockResolvedValue(series as any);

      const result = await service.update(seriesSlug, updateEventSeriesDto, 1);

      expect(result).toEqual(updatedSeries);
      expect(findBySlugSpy).toHaveBeenCalledWith(seriesSlug);
      expect(mockEventSeriesRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated Series' }),
      );
      expect(mockEventManagementService.update).not.toHaveBeenCalled();

      findBySlugSpy.mockRestore();
    });

    // Add tests for error handling and edge cases
  });
});
