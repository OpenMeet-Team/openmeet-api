import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesController } from './event-series.controller';
import { EventSeriesService } from '../services/event-series.service';
import { EventSeriesOccurrenceService } from '../services/event-series-occurrence.service';
import { RecurrencePatternService } from '../services/recurrence-pattern.service';
import { Logger } from '@nestjs/common';
import { OccurrenceResult } from '../interfaces/occurrence-result.interface';
import { RecurrenceFrequency } from '../interfaces/recurrence.interface';

describe('EventSeriesController', () => {
  let controller: EventSeriesController;
  let eventSeriesOccurrenceService: EventSeriesOccurrenceService;
  let recurrencePatternService: RecurrencePatternService;

  // Mock data
  const mockOccurrenceResult: OccurrenceResult[] = [
    {
      date: '2023-06-01',
      materialized: true,
      event: {
        id: 1,
        name: 'Test Event 1',
        slug: 'test-event-1',
      } as any, // Use type assertion for the minimal mock
    },
    {
      date: '2023-06-08',
      materialized: false,
    },
  ];

  const mockOccurrenceDates = [
    '2025-06-15T09:00:00.000Z',
    '2025-07-15T09:00:00.000Z',
    '2025-08-15T09:00:00.000Z',
    '2025-09-15T09:00:00.000Z',
    '2025-10-15T09:00:00.000Z',
  ];

  // Mock services
  const mockEventSeriesService = {
    findBySlug: jest.fn(),
  };

  const mockEventSeriesOccurrenceService = {
    getUpcomingOccurrences: jest.fn().mockResolvedValue(mockOccurrenceResult),
    materializeNextNOccurrences: jest.fn(),
    materializeNextOccurrence: jest.fn(),
    updateFutureOccurrences: jest.fn(),
    getOrCreateOccurrence: jest.fn(),
  };

  const mockRecurrencePatternService = {
    generateOccurrences: jest.fn().mockReturnValue(mockOccurrenceDates),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventSeriesController],
      providers: [
        {
          provide: EventSeriesService,
          useValue: mockEventSeriesService,
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: mockEventSeriesOccurrenceService,
        },
        {
          provide: RecurrencePatternService,
          useValue: mockRecurrencePatternService,
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<EventSeriesController>(EventSeriesController);
    eventSeriesOccurrenceService = module.get<EventSeriesOccurrenceService>(
      EventSeriesOccurrenceService,
    );
    recurrencePatternService = module.get<RecurrencePatternService>(
      RecurrencePatternService,
    );
  });

  describe('getUpcomingOccurrences', () => {
    it('should get upcoming occurrences by calling the service', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = 'true';
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant',
      };

      // Act
      const result = await controller.getUpcomingOccurrences(
        slug,
        count,
        includePast,
        mockReq,
      );

      // Assert
      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith(slug, count, true, 'test-tenant');
      expect(result).toEqual(mockOccurrenceResult);
    });

    it('should handle includePast as a boolean', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = true;
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant',
      };

      // Act
      await controller.getUpcomingOccurrences(
        slug,
        count,
        includePast,
        mockReq,
      );

      // Assert
      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith(slug, count, true, 'test-tenant');
    });

    it('should get tenant ID from headers if not in request object', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = false;
      const mockReq = {
        user: { id: 1 },
        headers: { 'x-tenant-id': 'header-tenant' },
      };

      // Act
      await controller.getUpcomingOccurrences(
        slug,
        count,
        includePast,
        mockReq,
      );

      // Assert
      expect(
        eventSeriesOccurrenceService.getUpcomingOccurrences,
      ).toHaveBeenCalledWith(slug, count, false, 'header-tenant');
    });

    it('should handle errors from the service', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = false;
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant',
      };

      const errorMessage = 'Service error';
      mockEventSeriesOccurrenceService.getUpcomingOccurrences.mockRejectedValueOnce(
        new Error(errorMessage),
      );

      // Act & Assert
      await expect(
        controller.getUpcomingOccurrences(slug, count, includePast, mockReq),
      ).rejects.toThrow(errorMessage);
    });
  });

  describe('previewOccurrences', () => {
    it('should generate occurrences using RecurrencePatternService for monthly by day of week pattern', async () => {
      // Arrange
      const previewDto = {
        startDate: '2025-06-15T09:00:00.000Z',
        timeZone: 'America/New_York',
        recurrenceRule: {
          frequency: RecurrenceFrequency.MONTHLY,
          byweekday: ['MO'],
          bysetpos: [3], // 3rd Monday
          interval: 1,
        },
        count: 5,
      };

      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant',
      };

      // Act
      const result = await controller.previewOccurrences(previewDto, mockReq);

      // Assert
      expect(recurrencePatternService.generateOccurrences).toHaveBeenCalledWith(
        expect.any(Date), // startDate converted to Date object
        previewDto.recurrenceRule,
        {
          timeZone: previewDto.timeZone,
          count: previewDto.count,
        },
      );

      expect(result).toEqual(
        mockOccurrenceDates.map((date) => ({
          date,
          materialized: false,
        })),
      );
    });

    it('should handle errors when generating occurrences', async () => {
      // Arrange
      const previewDto = {
        startDate: '2025-06-15T09:00:00.000Z',
        timeZone: 'America/New_York',
        recurrenceRule: {
          frequency: RecurrenceFrequency.MONTHLY,
          byweekday: ['MO'],
          bysetpos: [3], // 3rd Monday
          interval: 1,
        },
        count: 5,
      };

      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant',
      };

      const errorMessage = 'Failed to generate occurrences';
      mockRecurrencePatternService.generateOccurrences.mockImplementationOnce(
        () => {
          throw new Error(errorMessage);
        },
      );

      // Act & Assert
      await expect(
        controller.previewOccurrences(previewDto, mockReq),
      ).rejects.toThrow(errorMessage);
    });
  });
});
