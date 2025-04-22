import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesController } from './event-series.controller';
import { EventSeriesService } from '../services/event-series.service';
import { EventSeriesOccurrenceService } from '../services/event-series-occurrence.service';
import { Logger } from '@nestjs/common';
import { OccurrenceResult } from '../interfaces/occurrence-result.interface';

describe('EventSeriesController', () => {
  let controller: EventSeriesController;
  let eventSeriesOccurrenceService: EventSeriesOccurrenceService;

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
});
