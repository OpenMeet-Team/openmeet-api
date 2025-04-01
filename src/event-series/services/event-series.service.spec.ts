import { Test, TestingModule } from '@nestjs/testing';
import { EventSeriesService } from './event-series.service';
import { EventSeriesRepository } from '../interfaces/event-series-repository.interface';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { EventType } from '../../core/constants/constant';

// Mock Data
const mockSeriesData: Partial<EventSeriesEntity> = {
  id: 1,
  name: 'Test Series',
  slug: 'test-series',
  description: 'A test series',
  timeZone: 'America/New_York',
  recurrenceRule: {
    freq: 'WEEKLY',
    interval: 1,
    byday: ['MO', 'WE', 'FR'],
  },
  user: { id: 1 } as any,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockEventData: Partial<EventEntity> = {
  id: 1,
  name: 'Test Event',
  slug: 'test-event',
  description: 'A test event',
  startDate: new Date('2025-10-01T15:00:00Z'),
  endDate: new Date('2025-10-01T17:00:00Z'),
  timeZone: 'America/New_York',
  type: EventType.InPerson,
  location: 'Test Location',
  locationOnline: 'https://zoom.us/j/123456789',
  seriesId: 1,
  materialized: true,
  originalOccurrenceDate: new Date('2025-10-01T15:00:00Z'),
  user: { id: 1 } as any,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Repository token
const EVENT_SERIES_REPOSITORY_TOKEN = 'EventSeriesRepository';

// Mock Repository
const mockEventSeriesRepository = {
  create: jest.fn().mockImplementation((series) => Promise.resolve({
    ...series,
    id: 1,
    slug: series.slug || 'test-series',
  })),
  findBySlug: jest.fn().mockImplementation((slug) => {
    if (slug === 'not-found') {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...mockSeriesData,
      slug,
    });
  }),
  findByUser: jest.fn().mockImplementation((userId, options) => {
    const series = Array(options.limit).fill(0).map((_, i) => ({
      ...mockSeriesData,
      id: i + 1,
      slug: `test-series-${i + 1}`,
    }));
    return Promise.resolve([series, series.length]);
  }),
  findByGroup: jest.fn().mockImplementation((groupId, options) => {
    const series = Array(options.limit).fill(0).map((_, i) => ({
      ...mockSeriesData,
      id: i + 1,
      slug: `test-series-${i + 1}`,
    }));
    return Promise.resolve([series, series.length]);
  }),
  update: jest.fn().mockImplementation((id, updateData) => {
    return Promise.resolve({
      ...mockSeriesData,
      ...updateData,
      id,
    });
  }),
  delete: jest.fn().mockImplementation((id) => Promise.resolve({ affected: 1 })),
};

// Mock RecurrenceService
const mockRecurrenceService = {
  getRecurrenceDescription: jest.fn().mockImplementation(() => 'Weekly on Monday, Wednesday, Friday'),
  generateOccurrences: jest.fn(),
  isDateInRecurrencePattern: jest.fn(),
  formatDateInTimeZone: jest.fn(),
};

// Mock EventManagementService
const mockEventManagementService = {
  create: jest.fn().mockImplementation((eventData, userId) => {
    return Promise.resolve({
      ...mockEventData,
      ...eventData,
      userId,
      id: 1,
    });
  }),
  update: jest.fn(),
  findEventBySlug: jest.fn(),
};

describe('EventSeriesService', () => {
  let service: EventSeriesService;
  let eventSeriesRepository: typeof mockEventSeriesRepository;
  let recurrenceService: typeof mockRecurrenceService;
  let eventManagementService: typeof mockEventManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSeriesService,
        {
          provide: EVENT_SERIES_REPOSITORY_TOKEN,
          useValue: mockEventSeriesRepository,
        },
        {
          provide: RecurrenceService,
          useValue: mockRecurrenceService,
        },
        {
          provide: EventManagementService,
          useValue: mockEventManagementService,
        },
      ],
    }).compile();

    service = module.get<EventSeriesService>(EventSeriesService);
    eventSeriesRepository = module.get(EVENT_SERIES_REPOSITORY_TOKEN);
    recurrenceService = module.get(RecurrenceService);
    eventManagementService = module.get(EventManagementService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new event series and first occurrence', async () => {
      const createDto: CreateEventSeriesDto = {
        name: 'New Series',
        slug: 'new-series',
        description: 'A new test series',
        timeZone: 'America/New_York',
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
          byday: ['MO', 'WE', 'FR'],
        },
        groupId: 1,
        imageId: 2,
        templateStartDate: '2025-10-01T15:00:00Z',
        templateEndDate: '2025-10-01T17:00:00Z',
        templateType: 'in-person',
        templateLocation: 'Test Location',
        templateLocationOnline: 'https://zoom.us/j/123456789',
        templateMaxAttendees: 20,
        templateRequireApproval: false,
        templateAllowWaitlist: true,
        templateCategories: [1, 2, 3],
      };

      const result = await service.create(createDto, 1);

      expect(eventSeriesRepository.create).toHaveBeenCalled();
      expect(eventManagementService.create).toHaveBeenCalled();
      expect(eventSeriesRepository.findBySlug).toHaveBeenCalledWith('new-series');
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('slug', 'new-series');
      expect(result).toHaveProperty('recurrenceDescription', 'Weekly on Monday, Wednesday, Friday');
    });

    it('should handle errors during creation', async () => {
      const createDto: CreateEventSeriesDto = {
        name: 'New Series',
        timeZone: 'America/New_York',
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 1,
        },
        templateStartDate: '2025-10-01T15:00:00Z',
        templateEndDate: '2025-10-01T17:00:00Z',
        templateType: 'in-person',
      };

      jest.spyOn(eventSeriesRepository, 'create').mockRejectedValue(new Error('Database error'));

      await expect(service.create(createDto, 1)).rejects.toThrow('Database error');
    });
  });

  describe('findAll', () => {
    it('should return paginated series with descriptions', async () => {
      const result = await service.findAll({ page: 1, limit: 5 });

      expect(eventSeriesRepository.findByUser).toHaveBeenCalledWith(0, { page: 1, limit: 5 });
      expect(recurrenceService.getRecurrenceDescription).toHaveBeenCalledTimes(5);
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.data[0]).toHaveProperty('recurrenceDescription');
    });
  });

  describe('findByUser', () => {
    it('should return series created by a specific user', async () => {
      const result = await service.findByUser(1, { page: 1, limit: 5 });

      expect(eventSeriesRepository.findByUser).toHaveBeenCalledWith(1, { page: 1, limit: 5 });
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.data[0]).toHaveProperty('recurrenceDescription');
    });
  });

  describe('findByGroup', () => {
    it('should return series for a specific group', async () => {
      const result = await service.findByGroup(1, { page: 1, limit: 5 });

      expect(eventSeriesRepository.findByGroup).toHaveBeenCalledWith(1, { page: 1, limit: 5 });
      expect(result.data).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.data[0]).toHaveProperty('recurrenceDescription');
    });
  });

  describe('findBySlug', () => {
    it('should return a series by slug', async () => {
      const result = await service.findBySlug('test-series');

      expect(eventSeriesRepository.findBySlug).toHaveBeenCalledWith('test-series');
      expect(result).toHaveProperty('slug', 'test-series');
      expect(result).toHaveProperty('recurrenceDescription');
    });

    it('should throw NotFoundException if series not found', async () => {
      await expect(service.findBySlug('not-found')).rejects.toThrow(NotFoundException);
    });

    it('should handle other errors', async () => {
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockRejectedValue(new Error('Database error'));

      await expect(service.findBySlug('test-series')).rejects.toThrow('Database error');
    });
  });

  describe('update', () => {
    it('should update an existing series', async () => {
      const updateDto = {
        name: 'Updated Series',
        description: 'Updated description',
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 2,
        },
      };

      // Reset and re-mock for this test
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockReset();
      
      // First call when checking permissions
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockResolvedValueOnce({
        ...mockSeriesData,
        user: { id: 1 } as any
      } as EventSeriesEntity);
      
      // Second call after update is done
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockResolvedValueOnce({
        ...mockSeriesData,
        name: 'Updated Series',
        description: 'Updated description',
        recurrenceRule: {
          freq: 'WEEKLY',
          interval: 2,
        },
        user: { id: 1 } as any
      } as EventSeriesEntity);

      const result = await service.update('test-series', updateDto, 1);

      expect(eventSeriesRepository.findBySlug).toHaveBeenCalledWith('test-series');
      expect(eventSeriesRepository.update).toHaveBeenCalledWith(1, updateDto);
      expect(result).toHaveProperty('name', 'Updated Series');
      expect(result).toHaveProperty('recurrenceDescription');
    });

    it('should not allow updates by non-owners', async () => {
      const updateDto = {
        name: 'Updated Series',
      };

      // Reset and re-mock for this test with different owner
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockReset();
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockResolvedValue({
        ...mockSeriesData,
        user: { id: 1 } as any
      } as EventSeriesEntity);

      await expect(service.update('test-series', updateDto, 999)).rejects.toThrow(BadRequestException);
      expect(eventSeriesRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a series', async () => {
      // Reset and re-mock for this test
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockReset();
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockResolvedValue({
        ...mockSeriesData,
        user: { id: 1 } as any
      } as EventSeriesEntity);
      
      await service.delete('test-series', 1);

      expect(eventSeriesRepository.findBySlug).toHaveBeenCalledWith('test-series');
      expect(eventSeriesRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should not allow deletion by non-owners', async () => {
      // Reset and re-mock for this test
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockReset();
      jest.spyOn(eventSeriesRepository, 'findBySlug').mockResolvedValue({
        ...mockSeriesData,
        user: { id: 1 } as any
      } as EventSeriesEntity);
      
      await expect(service.delete('test-series', 999)).rejects.toThrow(BadRequestException);
      expect(eventSeriesRepository.delete).not.toHaveBeenCalled();
    });
  });
});