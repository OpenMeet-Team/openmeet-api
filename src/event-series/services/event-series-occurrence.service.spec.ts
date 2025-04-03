import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesOccurrenceService } from './event-series-occurrence.service';
import { EventSeriesService } from './event-series.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MoreThanOrEqual } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { EventType } from '../../core/constants/constant';

// Mock data
const mockEventSeries: Partial<EventSeriesEntity> = {
  id: 1,
  name: 'Test Series',
  slug: 'test-series',
  description: 'A test series description',
  timeZone: 'America/New_York',
  recurrenceRule: {
    freq: 'WEEKLY',
    interval: 1,
    byday: ['MO', 'WE', 'FR'],
  },
  user: { id: 1 } as any,
  createdAt: new Date('2025-09-01T00:00:00Z'),
  updatedAt: new Date('2025-09-01T00:00:00Z'),
  recurrenceDescription: 'Weekly on Monday, Wednesday, Friday',
};

const mockTemplateEvent: Partial<EventEntity> = {
  id: 1,
  name: 'Test Event',
  slug: 'test-event',
  description: 'Test event description',
  startDate: new Date('2025-10-01T15:00:00Z'),
  endDate: new Date('2025-10-01T17:00:00Z'),
  timeZone: 'America/New_York',
  type: EventType.InPerson,
  location: 'Test Location',
  locationOnline: 'https://zoom.us/j/123456789',
  maxAttendees: 20,
  requireApproval: false,
  approvalQuestion: '',
  allowWaitlist: true,
  seriesId: 1,
  materialized: true,
  originalOccurrenceDate: new Date('2025-10-01T15:00:00Z'),
  isRecurring: true,
  recurrenceRule: {
    freq: 'WEEKLY',
    interval: 1,
    byday: ['MO', 'WE', 'FR'],
  },
  user: { id: 1 } as any,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create mock implementations
const mockEventRepository = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockEventSeriesService = {
  findBySlug: jest
    .fn()
    .mockImplementation((_slug) => Promise.resolve(mockEventSeries)),
};

const mockRecurrenceService = {
  isDateInRecurrencePattern: jest.fn().mockReturnValue(true),
  generateOccurrences: jest.fn(),
  formatDateInTimeZone: jest
    .fn()
    .mockImplementation((date, _timeZone, _options) => {
      const d = new Date(date);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }),
};

const mockEventQueryService = {
  findEventBySlug: jest
    .fn()
    .mockImplementation((_slug) => Promise.resolve(mockTemplateEvent)),
};

const mockEventManagementService = {
  create: jest.fn(),
  update: jest.fn(),
};

describe('EventSeriesOccurrenceService', () => {
  let service: EventSeriesOccurrenceService;
  let eventRepository: any;
  let eventSeriesService: any;
  let recurrenceService: any;
  let eventQueryService: any;
  let eventManagementService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSeriesOccurrenceService,
        {
          provide: getRepositoryToken(EventEntity),
          useValue: mockEventRepository,
        },
        {
          provide: EventSeriesService,
          useValue: mockEventSeriesService,
        },
        {
          provide: RecurrencePatternService,
          useValue: mockRecurrenceService,
        },
        {
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
      ],
    }).compile();

    service = module.get<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    eventRepository = module.get(getRepositoryToken(EventEntity));
    eventSeriesService = module.get(EventSeriesService);
    recurrenceService = module.get(RecurrencePatternService);

    // Manually add spy method for materializeOccurrence since it's a method of the service itself
    jest.spyOn(service, 'materializeOccurrence');
    eventQueryService = module.get(EventQueryService);
    eventManagementService = module.get(EventManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateOccurrence', () => {
    it('should return existing occurrence if found', async () => {
      // Mock existing occurrence
      const occurrenceDate = '2025-10-01T15:00:00Z';
      jest
        .spyOn(service, 'findOccurrence')
        .mockResolvedValue(mockTemplateEvent as EventEntity);

      const result = await service.getOrCreateOccurrence(
        'test-series',
        occurrenceDate,
        1,
      );

      expect(service.findOccurrence).toHaveBeenCalledWith(
        'test-series',
        occurrenceDate,
      );
      expect(result).toEqual(mockTemplateEvent);
    });

    it('should materialize new occurrence if not found', async () => {
      // Mock non-existent occurrence then successful materialization
      const occurrenceDate = '2025-10-03T15:00:00Z';
      jest.spyOn(service, 'findOccurrence').mockResolvedValue(undefined);

      const newOccurrence = {
        ...mockTemplateEvent,
        id: 2,
        slug: 'test-event-2',
        startDate: new Date(occurrenceDate),
        originalOccurrenceDate: new Date(occurrenceDate),
      };

      jest
        .spyOn(service, 'materializeOccurrence')
        .mockResolvedValue(newOccurrence as EventEntity);

      const result = await service.getOrCreateOccurrence(
        'test-series',
        occurrenceDate,
        1,
      );

      expect(service.findOccurrence).toHaveBeenCalledWith(
        'test-series',
        occurrenceDate,
      );
      expect(service.materializeOccurrence).toHaveBeenCalledWith(
        'test-series',
        occurrenceDate,
        1,
      );
      expect(result.id).toBe(2);
    });

    it('should handle errors properly', async () => {
      jest
        .spyOn(service, 'findOccurrence')
        .mockRejectedValue(new Error('Database error'));

      await expect(
        service.getOrCreateOccurrence('test-series', '2025-10-01T15:00:00Z', 1),
      ).rejects.toThrow('Database error');
    });
  });

  describe('findOccurrence', () => {
    it('should find an occurrence for a specific date', async () => {
      // Mock the series and occurrence
      const occurrenceDate = '2025-10-01T15:00:00Z';
      const date = new Date(occurrenceDate);

      eventRepository.findOne.mockResolvedValue(mockTemplateEvent);

      const result = await service.findOccurrence(
        'test-series',
        occurrenceDate,
      );

      expect(eventSeriesService.findBySlug).toHaveBeenCalledWith('test-series');
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: {
          seriesId: mockEventSeries.id,
          originalOccurrenceDate: date,
        },
        relations: ['user', 'categories', 'image', 'series'],
      });
      expect(result).toEqual(mockTemplateEvent);
    });

    it('should return undefined if occurrence not found', async () => {
      eventRepository.findOne.mockResolvedValue(null);

      const result = await service.findOccurrence(
        'test-series',
        '2025-10-05T15:00:00Z',
      );

      expect(result).toBeUndefined();
    });
  });

  describe('materializeOccurrence', () => {
    it('should materialize a new occurrence', async () => {
      const occurrenceDate = '2025-10-03T15:00:00Z';
      const date = new Date(occurrenceDate);

      // Mock finding template event
      eventRepository.findOne.mockResolvedValue(mockTemplateEvent);

      // Mock creating new occurrence
      const newOccurrence = {
        ...mockTemplateEvent,
        id: 2,
        slug: 'test-event-2',
        startDate: date,
        originalOccurrenceDate: date,
      };
      eventRepository.create.mockReturnValue(newOccurrence);
      eventRepository.save.mockResolvedValue(newOccurrence);

      const result = await service.materializeOccurrence(
        'test-series',
        occurrenceDate,
        1,
      );

      expect(recurrenceService.isDateInRecurrencePattern).toHaveBeenCalled();
      expect(eventRepository.findOne).toHaveBeenCalled();
      expect(eventRepository.create).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(eventQueryService.findEventBySlug).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error if date is not in recurrence pattern', async () => {
      recurrenceService.isDateInRecurrencePattern.mockReturnValue(false);

      await expect(
        service.materializeOccurrence('test-series', '2025-12-25T15:00:00Z', 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if no template event is found', async () => {
      eventRepository.findOne.mockResolvedValue(null);

      await expect(
        service.materializeOccurrence('test-series', '2025-10-03T15:00:00Z', 1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUpcomingOccurrences', () => {
    it('should return both materialized and unmaterialized occurrences', async () => {
      // Setup the test
      const materializedOccurrences = [
        {
          ...mockTemplateEvent,
          id: 2,
          startDate: new Date('2025-10-03T15:00:00Z'),
          originalOccurrenceDate: new Date('2025-10-03T15:00:00Z'),
        },
      ];

      // Generated dates from recurrence pattern
      const generatedDates = [
        new Date('2025-10-03T15:00:00Z'), // Already materialized
        new Date('2025-10-05T15:00:00Z'), // Not materialized
        new Date('2025-10-07T15:00:00Z'), // Not materialized
      ];

      // Mock repository and service responses
      eventRepository.find.mockResolvedValue(materializedOccurrences);
      recurrenceService.generateOccurrences.mockReturnValue(generatedDates);

      const result = await service.getUpcomingOccurrences('test-series', 3);

      expect(eventSeriesService.findBySlug).toHaveBeenCalledWith('test-series');
      expect(eventRepository.find).toHaveBeenCalledWith({
        where: {
          seriesId: mockEventSeries.id,
          materialized: true,
          startDate: MoreThanOrEqual(expect.any(Date)),
        },
        relations: ['user', 'categories', 'image', 'series'],
        order: {
          startDate: 'ASC',
        },
        take: 3,
      });

      expect(recurrenceService.generateOccurrences).toHaveBeenCalled();

      // Should return 3 occurrences
      expect(result).toHaveLength(3);

      // First occurrence should be materialized
      expect(result[0].materialized).toBe(true);
      expect(result[0].event).toBeDefined();

      // Second and third should be unmaterialized
      expect(result[1].materialized).toBe(false);
      expect(result[1].event).toBeUndefined();
      expect(result[2].materialized).toBe(false);
      expect(result[2].event).toBeUndefined();
    });
  });

  describe('materializeNextOccurrence', () => {
    it('should materialize the next unmaterialized occurrence', async () => {
      // Setup
      const upcomingOccurrences = [
        {
          date: '2025-10-03T15:00:00Z',
          event: mockTemplateEvent as EventEntity,
          materialized: true,
        },
        {
          date: '2025-10-05T15:00:00Z',
          materialized: false,
        },
        {
          date: '2025-10-07T15:00:00Z',
          materialized: false,
        },
      ];

      jest
        .spyOn(service, 'getUpcomingOccurrences')
        .mockResolvedValue(upcomingOccurrences);

      const nextOccurrence = {
        ...mockTemplateEvent,
        id: 3,
        startDate: new Date('2025-10-05T15:00:00Z'),
        originalOccurrenceDate: new Date('2025-10-05T15:00:00Z'),
      };

      jest
        .spyOn(service, 'materializeOccurrence')
        .mockResolvedValue(nextOccurrence as EventEntity);

      const result = await service.materializeNextOccurrence('test-series', 1);

      expect(service.getUpcomingOccurrences).toHaveBeenCalledWith(
        'test-series',
        5,
      );
      expect(service.materializeOccurrence).toHaveBeenCalledWith(
        'test-series',
        '2025-10-05T15:00:00Z',
        1,
      );
      expect(result).toEqual(nextOccurrence);
    });

    it('should return undefined if no unmaterialized occurrences', async () => {
      // All occurrences are already materialized
      const upcomingOccurrences = [
        {
          date: '2025-10-03T15:00:00Z',
          event: mockTemplateEvent as EventEntity,
          materialized: true,
        },
        {
          date: '2025-10-05T15:00:00Z',
          event: { ...mockTemplateEvent, id: 3 } as EventEntity,
          materialized: true,
        },
      ];

      jest
        .spyOn(service, 'getUpcomingOccurrences')
        .mockResolvedValue(upcomingOccurrences);

      // Create a spy for materializeOccurrence that we can check
      const materializeSpy = jest.spyOn(service, 'materializeOccurrence');

      const result = await service.materializeNextOccurrence('test-series', 1);

      expect(materializeSpy).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('updateFutureOccurrences', () => {
    it('should update all future materialized occurrences', async () => {
      // Setup
      const fromDate = '2025-10-05T00:00:00Z';
      const updatedEvents = [
        {
          ...mockTemplateEvent,
          id: 2,
          startDate: new Date('2025-10-05T15:00:00Z'),
        },
        {
          ...mockTemplateEvent,
          id: 3,
          startDate: new Date('2025-10-07T15:00:00Z'),
        },
      ];

      eventRepository.find.mockResolvedValue(updatedEvents);
      eventManagementService.update.mockResolvedValue(updatedEvents[0]);

      const updates = {
        name: 'Updated Event Name',
        description: 'Updated description',
      };

      const result = await service.updateFutureOccurrences(
        'test-series',
        fromDate,
        updates,
        1,
      );

      expect(eventSeriesService.findBySlug).toHaveBeenCalledWith('test-series');
      expect(eventRepository.find).toHaveBeenCalled();
      expect(eventManagementService.update).toHaveBeenCalledTimes(2);
      expect(result).toBe(2); // Two events updated
    });

    it('should handle no occurrences to update', async () => {
      eventRepository.find.mockResolvedValue([]);

      const result = await service.updateFutureOccurrences(
        'test-series',
        '2025-10-05T00:00:00Z',
        { name: 'Updated' },
        1,
      );

      expect(eventManagementService.update).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });
  });

  describe('isSameDay', () => {
    it('should correctly compare dates in the same timezone', () => {
      const date1 = new Date('2025-10-05T10:00:00Z');
      const date2 = new Date('2025-10-05T18:00:00Z');

      // Private method, invoke through a test-only method
      const result = service['isSameDay'](date1, date2, 'UTC');

      expect(result).toBe(true);
    });

    it('should handle date comparison in different timezones', () => {
      // These dates are different days in UTC but same day in NY time
      const date1 = new Date('2025-10-05T23:00:00Z'); // Late on Oct 5 UTC, but still Oct 5 in NY
      const date2 = new Date('2025-10-06T01:00:00Z'); // Early Oct 6 UTC, but still Oct 5 in NY

      // Mock the formatDateInTimeZone to return same day format for both dates in NY time
      recurrenceService.formatDateInTimeZone
        .mockReturnValueOnce('2025-10-5') // First call
        .mockReturnValueOnce('2025-10-5'); // Second call

      const result = service['isSameDay'](date1, date2, 'America/New_York');

      expect(recurrenceService.formatDateInTimeZone).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });
  });
});
