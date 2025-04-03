import { Test, TestingModule } from '@nestjs/testing';
import { EventOccurrenceService } from './event-occurrence.service';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { EventStatus } from '../../../core/constants/constant';
import { EventSeriesOccurrenceService } from '../../../event-series/services/event-series-occurrence.service';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';

// Mock repository factory
const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

// Mock RecurrencePatternService
const mockRecurrencePatternService = () => ({
  generateOccurrences: jest.fn(),
  isDateInRecurrencePattern: jest.fn(),
  formatDateInTimeZone: jest.fn(),
  buildRRuleString: jest.fn(),
});

// Mock EventSeriesOccurrenceService
const mockEventSeriesOccurrenceService = () => ({
  findOccurrence: jest.fn(),
  materializeOccurrence: jest.fn(),
  getUpcomingOccurrences: jest.fn(),
});

// Mock TenantConnectionService
const mockTenantConnectionService = () => ({
  getTenantConnection: jest.fn().mockResolvedValue({
    getRepository: jest.fn().mockReturnValue(mockRepository()),
  }),
});

describe('EventOccurrenceService', () => {
  let service: EventOccurrenceService;
  let recurrencePatternService: RecurrencePatternService;
  let eventSeriesOccurrenceService: EventSeriesOccurrenceService;
  let eventRepository: Repository<EventEntity>;
  const mockRequest = { tenantId: 'test-tenant' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventOccurrenceService,
        {
          provide: RecurrencePatternService,
          useFactory: mockRecurrencePatternService,
        },
        {
          provide: EventSeriesOccurrenceService,
          useFactory: mockEventSeriesOccurrenceService,
        },
        {
          provide: TenantConnectionService,
          useFactory: mockTenantConnectionService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.defaultTimeZone') {
                return 'UTC';
              }
              return null;
            }),
          },
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    // For request-scoped providers, use resolve instead of get
    service = await module.resolve(EventOccurrenceService);
    recurrencePatternService = module.get<RecurrencePatternService>(
      RecurrencePatternService,
    );
    eventSeriesOccurrenceService = module.get<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    const tenantService = module.get<TenantConnectionService>(
      TenantConnectionService,
    );
    const dataSource = await tenantService.getTenantConnection('test-tenant');
    eventRepository = dataSource.getRepository(EventEntity);

    // Manually set up the service repository for testing
    await service.initializeRepository();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateOccurrences', () => {
    it('should not generate occurrences for non-recurring events', async () => {
      const nonRecurringEvent = new EventEntity();
      nonRecurringEvent.id = 1;
      nonRecurringEvent.isRecurring = false;

      const result = await service.generateOccurrences(nonRecurringEvent);
      expect(result).toEqual([]);
      expect(
        recurrencePatternService.generateOccurrences,
      ).not.toHaveBeenCalled();
    });

    it('should use EventSeriesOccurrenceService for series-based events', async () => {
      // Setup parent event with seriesId
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Series Event';
      parentEvent.isRecurring = true;
      parentEvent.seriesId = 101;
      parentEvent.series = {
        id: 101,
        slug: 'test-series-slug',
        name: 'Test Series',
      } as any;

      // Mock upcoming occurrences response
      const mockOccurrences = [
        {
          date: '2025-01-08T10:00:00Z',
          event: {
            id: 2,
            slug: 'event-1',
            name: 'Test Series Event - Jan 8',
          },
          materialized: true,
        },
        {
          date: '2025-01-15T10:00:00Z',
          event: {
            id: 3,
            slug: 'event-2',
            name: 'Test Series Event - Jan 15',
          },
          materialized: true,
        },
        {
          date: '2025-01-22T10:00:00Z',
          materialized: false,
        },
      ];

      (
        eventSeriesOccurrenceService.getUpcomingOccurrences as jest.Mock
      ).mockResolvedValue(mockOccurrences);

      // Call the service method
      const result = await service.generateOccurrences(parentEvent);

      // Assertions
      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith(
        'test-series-slug',
        10, // default count
      );

      // Should only include materialized occurrences with event data
      expect(result.length).toBe(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(3);

      // RecurrenceService should not be called
      expect(
        recurrencePatternService.generateOccurrences,
      ).not.toHaveBeenCalled();
    });

    it('should handle series-based events with missing series', async () => {
      // Setup parent event with seriesId but no series object
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Series Event';
      parentEvent.isRecurring = true;
      parentEvent.seriesId = 101;
      parentEvent.series = null;

      // Mock the findOne call to get the series
      const eventWithSeries = {
        id: 1,
        series: {
          id: 101,
          slug: 'test-series-slug',
        },
      };
      (eventRepository.findOne as jest.Mock).mockResolvedValue(eventWithSeries);

      // Mock upcoming occurrences response
      const mockOccurrences = [
        {
          date: '2025-01-08T10:00:00Z',
          event: {
            id: 2,
            slug: 'event-1',
          },
          materialized: true,
        },
      ];

      (
        eventSeriesOccurrenceService.getUpcomingOccurrences as jest.Mock
      ).mockResolvedValue(mockOccurrences);

      // Call the service method
      const result = await service.generateOccurrences(parentEvent);

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalled();
      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith('test-series-slug', 10);
      expect(result.length).toBe(1);
    });

    it('should use legacy implementation for old-style recurring events', async () => {
      // Setup parent event without seriesId
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Legacy Recurring Event';
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.endDate = new Date('2025-01-01T12:00:00Z');
      parentEvent.recurrenceRule = { frequency: 'WEEKLY', interval: 1 };
      parentEvent.timeZone = 'UTC';

      // Mock generateOccurrences response
      const occurrenceDates = [
        new Date('2025-01-08T10:00:00Z'),
        new Date('2025-01-15T10:00:00Z'),
        new Date('2025-01-22T10:00:00Z'),
      ];
      (
        recurrencePatternService.generateOccurrences as jest.Mock
      ).mockReturnValue(occurrenceDates);

      // Mock repository responses
      (eventRepository.find as jest.Mock).mockResolvedValue([]);
      (eventRepository.save as jest.Mock).mockImplementation(
        (entities) => entities,
      );

      // Call the service method
      const result = await service.generateOccurrences(parentEvent);

      // Assertions
      expect(recurrencePatternService.generateOccurrences).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(result.length).toBe(3);
    });
  });

  describe('getOccurrencesInRange', () => {
    it('should get occurrences in range for series-based events', async () => {
      // Setup
      const parentEventId = 1;
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-02-01');

      // Mock parent event with seriesId
      const parentEvent = {
        id: parentEventId,
        isRecurring: true,
        seriesId: 101,
        series: {
          id: 101,
          slug: 'test-series-slug',
        },
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock occurrences
      const mockOccurrences = [
        {
          date: '2025-01-08T10:00:00Z',
          event: {
            id: 2,
            slug: 'event-1',
          },
          materialized: true,
        },
        {
          date: '2025-01-15T10:00:00Z',
          event: {
            id: 3,
            slug: 'event-2',
          },
          materialized: true,
        },
      ];

      (
        eventSeriesOccurrenceService.getUpcomingOccurrences as jest.Mock
      ).mockResolvedValue(mockOccurrences);

      // Call the service method
      const result = await service.getOccurrencesInRange(
        parentEventId,
        startDate,
        endDate,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith('test-series-slug', 50);

      expect(result.length).toBe(2);
    });
  });

  describe('createExceptionOccurrence', () => {
    it('should create exception occurrence for series-based events', async () => {
      // Setup
      const parentEventId = 1;
      const originalDate = new Date('2025-01-15T10:00:00Z');
      const modifications = { name: 'Modified Event' };

      // Mock parent event with seriesId
      const parentEvent = {
        id: parentEventId,
        isRecurring: true,
        seriesId: 101,
        series: {
          id: 101,
          slug: 'test-series-slug',
        },
        user: {
          id: 42,
        },
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock materializeOccurrence
      const materializedEvent = {
        id: 3,
        slug: 'event-2',
        name: 'Original Name',
      };
      (
        eventSeriesOccurrenceService.materializeOccurrence as jest.Mock
      ).mockResolvedValue(materializedEvent);

      // Mock save
      const savedEvent = {
        ...materializedEvent,
        ...modifications,
      };
      (eventRepository.save as jest.Mock).mockResolvedValue(savedEvent);

      // Call the service method
      const result = await service.createExceptionOccurrence(
        parentEventId,
        originalDate,
        modifications,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      expect(
        eventSeriesOccurrenceService.materializeOccurrence,
      ).toHaveBeenCalledWith(
        'test-series-slug',
        originalDate.toISOString(),
        42,
      );

      expect(eventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Modified Event',
        }),
      );

      expect(result).toEqual(savedEvent);
    });
  });

  describe('excludeOccurrence', () => {
    it('should exclude occurrence for series-based events by cancelling it', async () => {
      // Setup
      const parentEventId = 1;
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');

      // Mock parent event with seriesId
      const parentEvent = {
        id: parentEventId,
        isRecurring: true,
        seriesId: 101,
        series: {
          id: 101,
          slug: 'test-series-slug',
        },
        user: {
          id: 42,
        },
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock findOccurrence to return existing occurrence
      const existingOccurrence = {
        id: 3,
        slug: 'event-3',
        status: EventStatus.Published,
      };
      (
        eventSeriesOccurrenceService.findOccurrence as jest.Mock
      ).mockResolvedValue(existingOccurrence);

      // Mock save
      const cancelledEvent = {
        ...existingOccurrence,
        status: EventStatus.Cancelled,
      };
      (eventRepository.save as jest.Mock).mockResolvedValue(cancelledEvent);

      // Call the service method
      const result = await service.excludeOccurrence(
        parentEventId,
        occurrenceDate,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      expect(eventSeriesOccurrenceService.findOccurrence).toHaveBeenCalledWith(
        'test-series-slug',
        occurrenceDate.toISOString(),
      );

      expect(eventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventStatus.Cancelled,
        }),
      );

      expect(result).toBe(true);
    });
  });

  describe('includeOccurrence', () => {
    it('should include occurrence for series-based events by reactivating it', async () => {
      // Setup
      const parentEventId = 1;
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');

      // Mock parent event with seriesId
      const parentEvent = {
        id: parentEventId,
        isRecurring: true,
        seriesId: 101,
        series: {
          id: 101,
          slug: 'test-series-slug',
        },
        user: {
          id: 42,
        },
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock findOccurrence to return existing cancelled occurrence
      const existingOccurrence = {
        id: 3,
        slug: 'event-3',
        status: EventStatus.Cancelled,
      };
      (
        eventSeriesOccurrenceService.findOccurrence as jest.Mock
      ).mockResolvedValue(existingOccurrence);

      // Mock save
      const reactivatedEvent = {
        ...existingOccurrence,
        status: EventStatus.Published,
      };
      (eventRepository.save as jest.Mock).mockResolvedValue(reactivatedEvent);

      // Call the service method
      const result = await service.includeOccurrence(
        parentEventId,
        occurrenceDate,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      expect(eventSeriesOccurrenceService.findOccurrence).toHaveBeenCalledWith(
        'test-series-slug',
        occurrenceDate.toISOString(),
      );

      expect(eventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: EventStatus.Published,
        }),
      );

      expect(result).toBe(true);
    });
  });

  describe('deleteAllOccurrences', () => {
    it('should delete all occurrences for series-based events', async () => {
      // Setup
      const parentEventId = 1;

      // Mock parent event with seriesId
      const parentEvent = {
        id: parentEventId,
        isRecurring: true,
        seriesId: 101,
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock delete
      (eventRepository.delete as jest.Mock).mockResolvedValue({ affected: 5 });

      // Call the service method
      const result = await service.deleteAllOccurrences(parentEventId);

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      expect(eventRepository.delete).toHaveBeenCalledWith({
        seriesId: 101,
      });

      expect(result).toBe(5);
    });
  });
});
