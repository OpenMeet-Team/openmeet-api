import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesController } from './controllers/event-series.controller';
import { EventSeriesService } from './services/event-series.service';
import { EventSeriesOccurrenceService } from './services/event-series-occurrence.service';
import { Logger } from '@nestjs/common';
import { OccurrenceResult } from './interfaces/occurrence-result.interface';

describe('EventSeriesController with EventSeriesOccurrenceService', () => {
  let controller: EventSeriesController;
  let eventSeriesOccurrenceService: EventSeriesOccurrenceService;

  // Mock data for tests
  const mockOccurrences: OccurrenceResult[] = [
    {
      date: '2023-06-01T15:00:00Z',
      materialized: true,
      event: {
        id: 1,
        name: 'Test Event 1',
        slug: 'test-event-1',
      } as any, // Use type assertion for the minimal mock
    },
    {
      date: '2023-06-08T15:00:00Z',
      materialized: false,
    },
  ];

  beforeEach(async () => {
    // Create mock services using Jest's standard mocking approach
    const eventSeriesServiceMock = {
      findBySlug: jest.fn(),
    };

    const eventSeriesOccurrenceServiceMock = {
      getUpcomingOccurrences: jest.fn().mockResolvedValue(mockOccurrences),
      materializeNextOccurrence: jest.fn(),
      updateFutureOccurrences: jest.fn(),
      getOrCreateOccurrence: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventSeriesController],
      providers: [
        {
          provide: EventSeriesService,
          useValue: eventSeriesServiceMock,
        },
        {
          provide: EventSeriesOccurrenceService,
          useValue: eventSeriesOccurrenceServiceMock,
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

  describe('getUpcomingOccurrences integration', () => {
    it('should pass tenant ID from request to service', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = false;
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant-id',
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
      ).toHaveBeenCalledWith(slug, count, includePast, 'test-tenant-id');
    });

    it('should fallback to x-tenant-id header if tenantId not in request object', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = false;
      const mockReq = {
        user: { id: 1 },
        headers: {
          'x-tenant-id': 'header-tenant-id',
        },
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
      ).toHaveBeenCalledWith(slug, count, includePast, 'header-tenant-id');
    });

    it('should handle error from service', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includePast = false;
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant-id',
      };

      const errorMessage = 'Service error';
      jest
        .spyOn(eventSeriesOccurrenceService, 'getUpcomingOccurrences')
        .mockRejectedValueOnce(new Error(errorMessage));

      // Act & Assert
      await expect(
        controller.getUpcomingOccurrences(slug, count, includePast, mockReq),
      ).rejects.toThrow(errorMessage);
    });

    it('should properly convert includePast string to boolean', async () => {
      // Arrange
      const slug = 'test-series';
      const count = 5;
      const includeValues = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: true, expected: true },
        { input: false, expected: false },
      ];
      const mockReq = {
        user: { id: 1 },
        tenantId: 'test-tenant-id',
      };

      // Act & Assert
      for (const { input, expected } of includeValues) {
        await controller.getUpcomingOccurrences(
          slug,
          count,
          input as any,
          mockReq,
        );

        expect(
          eventSeriesOccurrenceService.getUpcomingOccurrences,
        ).toHaveBeenCalledWith(slug, count, expected, 'test-tenant-id');
      }
    });
  });
});
