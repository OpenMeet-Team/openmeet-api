import { Test, TestingModule } from '@nestjs/testing';
import { EventOccurrenceService } from './event-occurrence.service';
import { RecurrenceService } from '../../../recurrence/recurrence.service';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import {
  EventStatus,
  EventVisibility,
  EventType,
} from '../../../core/constants/constant';
import { addWeeks } from 'date-fns';

// Mock repository factory
const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

// Mock RecurrenceService
const mockRecurrenceService = () => ({
  generateOccurrences: jest.fn(),
  isDateInRecurrencePattern: jest.fn(),
  convertDateBetweenTimezones: jest.fn(),
  formatDateInTimeZone: jest.fn(),
  getRecurrenceDescription: jest.fn(),
});

// Mock TenantConnectionService
const mockTenantConnectionService = () => ({
  getTenantConnection: jest.fn().mockResolvedValue({
    getRepository: jest.fn().mockReturnValue(mockRepository()),
  }),
});

describe('EventOccurrenceService', () => {
  let service: EventOccurrenceService;
  let recurrenceService: RecurrenceService;
  let eventRepository: Repository<EventEntity>;
  const mockRequest = { tenantId: 'test-tenant' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventOccurrenceService,
        {
          provide: RecurrenceService,
          useFactory: mockRecurrenceService,
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
    recurrenceService = module.get<RecurrenceService>(RecurrenceService);
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
      expect(recurrenceService.generateOccurrences).not.toHaveBeenCalled();
    });

    it('should generate occurrences for a recurring event', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Recurring Event';
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.endDate = new Date('2025-01-01T12:00:00Z');
      parentEvent.timeZone = 'UTC';
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
        count: 4,
      };
      parentEvent.status = EventStatus.Published;
      parentEvent.visibility = EventVisibility.Public;
      parentEvent.type = EventType.InPerson;

      // Mock recurrence service response
      const occurrenceDates = [
        parentEvent.startDate, // This will be skipped as it's the parent event's date
        addWeeks(parentEvent.startDate, 1),
        addWeeks(parentEvent.startDate, 2),
        addWeeks(parentEvent.startDate, 3),
      ];

      (recurrenceService.generateOccurrences as jest.Mock).mockReturnValue(
        occurrenceDates,
      );

      // Mock repository response
      (eventRepository.find as jest.Mock).mockResolvedValue([]);

      // Mock the repository save method
      const savedOccurrences = [
        { id: 2, parentEventId: 1, startDate: occurrenceDates[1] },
        { id: 3, parentEventId: 1, startDate: occurrenceDates[2] },
        { id: 4, parentEventId: 1, startDate: occurrenceDates[3] },
      ];
      (eventRepository.save as jest.Mock).mockResolvedValue(savedOccurrences);

      // Call the service method
      const result = await service.generateOccurrences(parentEvent);

      // Assertions
      expect(recurrenceService.generateOccurrences).toHaveBeenCalledWith(
        parentEvent.startDate,
        parentEvent.recurrenceRule,
        expect.objectContaining({ timeZone: 'UTC' }),
      );

      expect(eventRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedOccurrences);
      expect(result.length).toBe(3); // Should skip the first occurrence
    });

    it('should skip existing occurrences', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Recurring Event';
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.endDate = new Date('2025-01-01T12:00:00Z');
      parentEvent.timeZone = 'UTC';
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
        count: 4,
      };

      // Mock recurrence service response
      const occurrenceDates = [
        parentEvent.startDate,
        addWeeks(parentEvent.startDate, 1),
        addWeeks(parentEvent.startDate, 2),
        addWeeks(parentEvent.startDate, 3),
      ];

      (recurrenceService.generateOccurrences as jest.Mock).mockReturnValue(
        occurrenceDates,
      );

      // Mock existing occurrences
      const existingOccurrences = [
        {
          id: 2,
          parentEventId: 1,
          startDate: addWeeks(parentEvent.startDate, 1),
        },
      ];

      (eventRepository.find as jest.Mock).mockResolvedValue(
        existingOccurrences,
      );

      // Mock the repository save method
      const savedOccurrences = [
        { id: 3, parentEventId: 1, startDate: occurrenceDates[2] },
        { id: 4, parentEventId: 1, startDate: occurrenceDates[3] },
      ];
      (eventRepository.save as jest.Mock).mockResolvedValue(savedOccurrences);

      // Call the service method
      const result = await service.generateOccurrences(parentEvent);

      // Assertions
      expect(eventRepository.save).toHaveBeenCalled();
      expect(result).toEqual(savedOccurrences);
      expect(result.length).toBe(2); // Should skip the first occurrence and the existing one
    });
  });

  describe('getOccurrencesInRange', () => {
    it('should return occurrences in the specified date range', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Recurring Event';
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.endDate = new Date('2025-01-01T12:00:00Z');
      parentEvent.timeZone = 'UTC';
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
        count: 4,
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock existing occurrences in range
      const startDate = new Date('2025-01-05T00:00:00Z');
      const endDate = new Date('2025-01-20T23:59:59Z');

      const existingOccurrences = [
        {
          id: 2,
          parentEventId: 1,
          startDate: new Date('2025-01-08T10:00:00Z'),
        },
      ];

      (eventRepository.find as jest.Mock).mockResolvedValue(
        existingOccurrences,
      );

      // Mock generated dates from recurrence service
      const generatedDates = [
        new Date('2025-01-08T10:00:00Z'), // Already exists
        new Date('2025-01-15T10:00:00Z'), // Needs to be created
      ];

      (recurrenceService.generateOccurrences as jest.Mock).mockReturnValue(
        generatedDates,
      );

      // Mock saving new occurrences
      const newOccurrence = {
        id: 3,
        parentEventId: 1,
        startDate: new Date('2025-01-15T10:00:00Z'),
      };

      (eventRepository.save as jest.Mock).mockResolvedValue([newOccurrence]);

      // Call the service method
      const result = await service.getOccurrencesInRange(1, startDate, endDate);

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, isRecurring: true },
      });

      expect(eventRepository.find).toHaveBeenCalledWith({
        where: {
          parentEventId: 1,
          startDate: expect.any(Object),
        },
        order: { startDate: 'ASC' },
      });

      expect(recurrenceService.generateOccurrences).toHaveBeenCalled();
      expect(eventRepository.save).toHaveBeenCalled();
      expect(result.length).toBe(2);
      expect(result).toContainEqual(existingOccurrences[0]);
      expect(result).toContainEqual(newOccurrence);
    });

    it('should return empty array if parent event not found', async () => {
      (eventRepository.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.getOccurrencesInRange(
        999,
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-31T23:59:59Z'),
      );

      expect(result).toEqual([]);
      expect(recurrenceService.generateOccurrences).not.toHaveBeenCalled();
    });
  });

  describe('createExceptionOccurrence', () => {
    it('should create an exception occurrence', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.name = 'Test Recurring Event';
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.timeZone = 'UTC';
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };
      parentEvent.recurrenceExceptions = [];

      (eventRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(parentEvent) // For parent event lookup
        .mockResolvedValueOnce(null) // For existing exception lookup
        .mockResolvedValueOnce(null); // For existing occurrence lookup

      // Mock isDateInRecurrencePattern
      (
        recurrenceService.isDateInRecurrencePattern as jest.Mock
      ).mockReturnValue(true);

      // Setup occurrence date and modifications
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');
      const modifications = {
        name: 'Modified Occurrence',
        description: 'This occurrence has been modified',
      };

      // Mock the createOccurrenceFromParent (internal method)
      const occurrence = new EventEntity();
      occurrence.id = 2;
      occurrence.parentEventId = 1;
      occurrence.startDate = occurrenceDate;
      occurrence.name = parentEvent.name;
      Object.assign(occurrence, modifications);
      occurrence.isRecurrenceException = true;
      occurrence.originalDate = occurrenceDate;

      // Mock saving the modified parent event and exception
      (eventRepository.save as jest.Mock)
        .mockResolvedValueOnce(parentEvent) // Saving parent with updated exceptions
        .mockResolvedValueOnce(occurrence); // Saving the exception occurrence

      // Call the service method
      const result = await service.createExceptionOccurrence(
        1,
        occurrenceDate,
        modifications,
      );

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledTimes(3);
      expect(recurrenceService.isDateInRecurrencePattern).toHaveBeenCalledWith(
        occurrenceDate,
        parentEvent.startDate,
        parentEvent.recurrenceRule,
        parentEvent.timeZone,
        parentEvent.recurrenceExceptions,
      );

      expect(eventRepository.save).toHaveBeenCalledTimes(2);
      expect(result.isRecurrenceException).toBe(true);
      expect(result.originalDate).toEqual(occurrenceDate);
      expect(result.name).toBe(modifications.name);
      expect(result.description).toBe(modifications.description);
    });

    it('should throw an error if date is not in recurrence pattern', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock isDateInRecurrencePattern
      (
        recurrenceService.isDateInRecurrencePattern as jest.Mock
      ).mockReturnValue(false);

      // Call the service method
      const occurrenceDate = new Date('2025-02-15T10:00:00Z');
      const modifications = { name: 'Modified Occurrence' };

      await expect(
        service.createExceptionOccurrence(1, occurrenceDate, modifications),
      ).rejects.toThrow(/not part of the recurrence pattern/);
    });
  });

  describe('excludeOccurrence', () => {
    it('should exclude an occurrence', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };
      parentEvent.recurrenceExceptions = [];

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock isDateInRecurrencePattern
      (
        recurrenceService.isDateInRecurrencePattern as jest.Mock
      ).mockReturnValue(true);

      // Mock deletion result
      (eventRepository.delete as jest.Mock).mockResolvedValue({ affected: 1 });

      // Mock saving the parent event with updated exceptions
      (eventRepository.save as jest.Mock).mockResolvedValue(parentEvent);

      // Call the service method
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');
      const result = await service.excludeOccurrence(1, occurrenceDate);

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1, isRecurring: true },
      });

      expect(recurrenceService.isDateInRecurrencePattern).toHaveBeenCalled();
      expect(parentEvent.recurrenceExceptions).toContain(
        occurrenceDate.toISOString(),
      );
      expect(eventRepository.save).toHaveBeenCalledWith(parentEvent);
      expect(eventRepository.delete).toHaveBeenCalledWith({
        parentEventId: 1,
        startDate: occurrenceDate,
      });

      expect(result).toBe(true);
    });

    it('should return false if deletion fails', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };
      parentEvent.recurrenceExceptions = [];

      (eventRepository.findOne as jest.Mock).mockResolvedValue(parentEvent);

      // Mock isDateInRecurrencePattern
      (
        recurrenceService.isDateInRecurrencePattern as jest.Mock
      ).mockReturnValue(true);

      // Mock deletion result (no records affected)
      (eventRepository.delete as jest.Mock).mockResolvedValue({ affected: 0 });

      // Mock saving the parent event with updated exceptions
      (eventRepository.save as jest.Mock).mockResolvedValue(parentEvent);

      // Call the service method
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');
      const result = await service.excludeOccurrence(1, occurrenceDate);

      expect(result).toBe(false);
    });
  });

  describe('includeOccurrence', () => {
    it('should include a previously excluded occurrence', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };
      parentEvent.recurrenceExceptions = [
        new Date('2025-01-15T10:00:00Z').toISOString(),
      ];

      (eventRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(parentEvent) // For parent event lookup
        .mockResolvedValueOnce(null); // For existing occurrence lookup

      // Mock saving the parent event with updated exceptions
      (eventRepository.save as jest.Mock)
        .mockResolvedValueOnce(parentEvent) // Saving parent with updated exceptions
        .mockResolvedValueOnce({ id: 2 }); // Saving the new occurrence

      // Call the service method
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');
      const result = await service.includeOccurrence(1, occurrenceDate);

      // Assertions
      expect(eventRepository.findOne).toHaveBeenCalledTimes(2);
      expect(parentEvent.recurrenceExceptions).not.toContain(
        occurrenceDate.toISOString(),
      );
      expect(eventRepository.save).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });

    it('should not create a new occurrence if one already exists', async () => {
      // Setup parent event
      const parentEvent = new EventEntity();
      parentEvent.id = 1;
      parentEvent.isRecurring = true;
      parentEvent.startDate = new Date('2025-01-01T10:00:00Z');
      parentEvent.recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
      };
      parentEvent.recurrenceExceptions = [
        new Date('2025-01-15T10:00:00Z').toISOString(),
      ];

      const existingOccurrence = new EventEntity();
      existingOccurrence.id = 2;
      existingOccurrence.parentEventId = 1;
      existingOccurrence.startDate = new Date('2025-01-15T10:00:00Z');

      (eventRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(parentEvent) // For parent event lookup
        .mockResolvedValueOnce(existingOccurrence); // For existing occurrence lookup

      // Mock saving the parent event with updated exceptions
      (eventRepository.save as jest.Mock).mockResolvedValue(parentEvent);

      // Call the service method
      const occurrenceDate = new Date('2025-01-15T10:00:00Z');
      const result = await service.includeOccurrence(1, occurrenceDate);

      // Assertions
      expect(eventRepository.save).toHaveBeenCalledTimes(1); // Only saving parent
      expect(result).toBe(true);
    });
  });

  describe('deleteAllOccurrences', () => {
    it('should delete all occurrences of a recurring event', async () => {
      // Mock deletion result
      (eventRepository.delete as jest.Mock).mockResolvedValue({ affected: 5 });

      // Call the service method
      const result = await service.deleteAllOccurrences(1);

      // Assertions
      expect(eventRepository.delete).toHaveBeenCalledWith({
        parentEventId: 1,
      });

      expect(result).toBe(5);
    });

    it('should return 0 if no occurrences were deleted', async () => {
      // Mock deletion result
      (eventRepository.delete as jest.Mock).mockResolvedValue({ affected: 0 });

      // Call the service method
      const result = await service.deleteAllOccurrences(999);

      expect(result).toBe(0);
    });
  });
});
