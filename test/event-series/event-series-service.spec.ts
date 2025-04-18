import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesService } from '../../src/event-series/services/event-series.service';
import { RecurrencePatternService } from '../../src/event-series/services/recurrence-pattern.service';
import { EventManagementService } from '../../src/event/services/event-management.service';
import { EventQueryService } from '../../src/event/services/event-query.service';
import { TenantConnectionService } from '../../src/tenant/tenant.service';
import { EVENT_SERIES_REPOSITORY } from '../../src/event-series/interfaces/event-series-repository.interface';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('EventSeriesService', () => {
  let service: EventSeriesService;
  let eventSeriesRepository: any;
  let eventQueryService: any;
  let eventManagementService: any;
  let recurrencePatternService: any;

  beforeEach(async () => {
    // Create mock implementations for dependencies
    eventSeriesRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
    };

    eventQueryService = {
      findEventBySlug: jest.fn(),
      findEventByDateAndSeries: jest.fn(),
    };

    eventManagementService = {
      update: jest.fn(),
      createSeriesOccurrence: jest.fn(),
    };

    recurrencePatternService = {
      generateOccurrences: jest.fn().mockReturnValue([new Date()]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        {
          provide: EVENT_SERIES_REPOSITORY,
          useValue: eventSeriesRepository,
        },
        {
          provide: RecurrencePatternService,
          useValue: recurrencePatternService,
        },
        {
          provide: EventManagementService,
          useValue: eventManagementService,
        },
        {
          provide: EventQueryService,
          useValue: eventQueryService,
        },
        {
          provide: 'REQUEST',
          useValue: {},
        },
        {
          provide: TenantConnectionService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<EventSeriesService>(EventSeriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create method', () => {
    it('should call createFromExistingEvent with correct parameters', async () => {
      // Spy on the createFromExistingEvent method
      const spy = jest
        .spyOn(service, 'createFromExistingEvent')
        .mockResolvedValue({} as any);

      // Call the create method
      await service.create(
        {
          name: 'Test Series',
          description: 'Test Description',
          recurrenceRule: { frequency: 'WEEKLY' },
          templateEventSlug: 'test-event',
          imageId: 123,
        },
        1,
      );

      // Check if createFromExistingEvent was called with correct params
      expect(spy).toHaveBeenCalledWith(
        'test-event',
        { frequency: 'WEEKLY' },
        1,
        'Test Series',
        'Test Description',
        undefined,
        expect.objectContaining({
          imageId: 123,
          generateOccurrences: true,
        }),
      );
    });

    it('should throw BadRequestException if no templateEventSlug provided', async () => {
      await expect(
        service.create(
          {
            name: 'Test Series',
            description: 'Test Description',
            recurrenceRule: { frequency: 'WEEKLY' },
            // No templateEventSlug
          },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createFromExistingEvent method', () => {
    it('should throw NotFoundException if event not found', async () => {
      // Setup
      eventQueryService.findEventBySlug.mockResolvedValue(null);

      // Test
      await expect(
        service.createFromExistingEvent(
          'non-existent-event',
          { frequency: 'WEEKLY' },
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if event is already part of a series', async () => {
      // Setup
      eventQueryService.findEventBySlug.mockResolvedValue({
        id: 1,
        slug: 'test-event',
        seriesSlug: 'existing-series',
      });

      // Test
      await expect(
        service.createFromExistingEvent(
          'test-event',
          { frequency: 'WEEKLY' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a series, link the event, and return the updated series', async () => {
      // Setup mock for findEventBySlug
      const mockEvent = {
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        description: 'Test Description',
        startDate: new Date(),
        endDate: new Date(),
        type: 'in-person',
        categories: [],
        timeZone: 'UTC',
      };
      eventQueryService.findEventBySlug.mockResolvedValue(mockEvent);

      // Setup mock for save
      const mockSavedSeries = {
        id: 100,
        slug: 'test-series',
        name: 'Test Series',
        description: 'Test Description',
        templateEventSlug: 'test-event',
      };
      eventSeriesRepository.save.mockResolvedValue(mockSavedSeries);

      // Setup mock for findById (the final series to return)
      const mockFinalSeries = {
        ...mockSavedSeries,
        events: [mockEvent],
      };
      eventSeriesRepository.findById.mockResolvedValue(mockFinalSeries);

      // Test createFromExistingEvent
      const result = await service.createFromExistingEvent(
        'test-event',
        { frequency: 'WEEKLY' },
        1,
        'Test Series',
        'Test Description',
      );

      // Verify results
      expect(eventSeriesRepository.save).toHaveBeenCalled();
      expect(eventManagementService.update).toHaveBeenCalledWith(
        'test-event',
        { seriesSlug: 'test-series' },
        1,
      );
      expect(result).toEqual(mockFinalSeries);
    });
  });

  describe('createSeriesFromEventDto method', () => {
    it('should call createFromExistingEvent with params from the DTO', async () => {
      // Spy on the createFromExistingEvent method
      const spy = jest
        .spyOn(service, 'createFromExistingEvent')
        .mockResolvedValue({} as any);

      // Create a DTO
      const dto = {
        name: 'Test Series',
        description: 'Test Description',
        recurrenceRule: { frequency: 'WEEKLY' },
        timeZone: 'America/New_York',
      };

      // Call the method
      await service.createSeriesFromEventDto('test-event', dto, 1);

      // Check if createFromExistingEvent was called with correct params
      expect(spy).toHaveBeenCalledWith(
        'test-event',
        { frequency: 'WEEKLY' },
        1,
        'Test Series',
        'Test Description',
        'America/New_York',
      );
    });
  });
});
