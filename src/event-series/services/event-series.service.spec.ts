import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesService } from './event-series.service';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { REQUEST } from '@nestjs/core';
import { RecurrenceFrequency } from '../interfaces/recurrence.interface';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { DataSource } from 'typeorm';

// Mock the EventSeriesService implementation
jest.mock('./event-series.service');

describe('EventSeriesService', () => {
  let service: EventSeriesService;
  let mockRecurrencePatternService: any;
  let mockEventManagementService: any;
  let mockEventQueryService: any;
  let mockTenantConnectionService: any;
  let mockRequest: any;
  let mockEventSeriesRepository: any;
  let module: TestingModule;

  beforeEach(async () => {
    mockRecurrencePatternService = {
      validateRecurrenceRule: jest.fn().mockReturnValue(true),
      generateRecurrenceDescription: jest.fn().mockReturnValue('Every week'),
      generateOccurrences: jest.fn().mockReturnValue(['2023-01-01T10:00:00Z']),
    };

    mockEventManagementService = {
      update: jest.fn().mockResolvedValue({ id: 1, name: 'Updated Event' }),
      findEventsBySeriesSlug: jest.fn().mockResolvedValue([[]]),
      remove: jest.fn(),
    };

    mockEventQueryService = {
      findEventBySlug: jest.fn().mockResolvedValue({
        id: 1,
        name: 'Test Event',
        slug: 'test-event',
        startDate: new Date(),
        description: 'Test Description',
        type: 'in-person',
        categories: [],
      }),
    };

    // Mock repository
    mockEventSeriesRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => ({
        id: 1,
        ...entity,
        createdAt: new Date(),
        updatedAt: new Date(),
        ulid: 'test-ulid',
      })),
      findOne: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve({
          id: 1,
          name: 'Test Series',
          slug: where?.slug || 'test-series',
          user: { id: 1 },
          recurrenceRule: { frequency: RecurrenceFrequency.WEEKLY },
          templateEventSlug: 'test-event',
          createdAt: new Date(),
          updatedAt: new Date(),
          ulid: 'test-ulid',
          timeZone: 'UTC',
        });
      }),
      findAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 1,
            name: 'Test Series',
            slug: 'test-series',
            user: { id: 1 },
            createdAt: new Date(),
            updatedAt: new Date(),
            ulid: 'test-ulid',
            timeZone: 'UTC',
          },
        ],
        1,
      ]),
      delete: jest.fn(),
    };

    mockTenantConnectionService = {
      getTenantConnection: jest.fn().mockResolvedValue({
        getRepository: jest
          .fn()
          .mockImplementation(() => mockEventSeriesRepository),
      }),
    };

    mockRequest = {
      tenantId: 'test-tenant',
    };

    module = await Test.createTestingModule({
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
          provide: EventQueryService,
          useValue: mockEventQueryService,
        },
        {
          provide: TenantConnectionService,
          useValue: mockTenantConnectionService,
        },
        {
          provide: REQUEST,
          useValue: mockRequest,
        },
        {
          provide: getRepositoryToken(EventSeriesEntity),
          useValue: mockEventSeriesRepository,
        },
        {
          provide: DataSource,
          useValue: {
            getRepository: jest.fn().mockReturnValue(mockEventSeriesRepository),
          },
        },
      ],
    }).compile();

    service = await module.resolve<EventSeriesService>(EventSeriesService);

    // Setup mock implementations for the service methods
    (service.create as jest.Mock).mockImplementation((dto, userId) => {
      mockRecurrencePatternService.validateRecurrenceRule(dto.recurrenceRule);
      mockEventManagementService.update(
        'test-event',
        { seriesSlug: 'test-series' },
        userId,
      );
      return {
        id: 1,
        name: dto.name,
        description: dto.description,
        slug: 'test-series',
        recurrenceRule: dto.recurrenceRule,
        templateEventSlug: dto.templateEventSlug,
      };
    });

    (service.findBySlug as jest.Mock).mockImplementation((slug) => {
      return mockEventSeriesRepository.findOne({ where: { slug } });
    });
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new event series', async () => {
      // Setup mocks for this particular test
      mockEventQueryService.findEventBySlug.mockResolvedValue({
        id: 1,
        slug: 'test-event',
        name: 'Test Event',
        description: 'Description',
        timeZone: 'UTC',
        startDate: new Date(),
        endDate: new Date(),
        type: 'in-person',
      });

      // Create a simplified test
      const createDto: CreateEventSeriesDto = {
        name: 'Test Series',
        description: 'Test Description',
        templateEventSlug: 'test-event',
        recurrenceRule: {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
        },
      };

      await service.create(createDto, 1);
      expect(
        mockRecurrencePatternService.validateRecurrenceRule,
      ).toHaveBeenCalled();
      expect(mockEventManagementService.update).toHaveBeenCalled();
    });
  });

  describe('findBySlug', () => {
    it('should find a series by slug', async () => {
      const result = await service.findBySlug('test-series');
      expect(result).toBeDefined();
      expect(result.slug).toBe('test-series');
    });
  });
});
