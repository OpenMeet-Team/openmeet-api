import { Test, TestingModule } from '@nestjs/testing';
import { RecurrenceModificationService } from './recurrence-modification.service';
import { RecurrenceService } from '../recurrence.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { BadRequestException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';

describe('RecurrenceModificationService', () => {
  let service: RecurrenceModificationService;

  const mockRequest = {
    user: { id: 1 },
    tenantId: 'test-tenant',
  };

  const mockEventManagementService = {
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockEventQueryService = {
    findEventBySlug: jest.fn(),
    findEventsByParentId: jest.fn(),
  };

  const mockRecurrenceService = {
    isDateInRecurrencePattern: jest.fn(),
    generateOccurrences: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurrenceModificationService,
        {
          provide: RecurrenceService,
          useValue: mockRecurrenceService,
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
          provide: REQUEST,
          useValue: mockRequest,
        },
      ],
    }).compile();

    service = await module.resolve<RecurrenceModificationService>(
      RecurrenceModificationService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('splitSeriesAt', () => {
    const mockEvent = {
      id: 1,
      name: 'Weekly Meeting',
      description: 'Team sync',
      startDate: new Date('2025-01-01T10:00:00.000Z'),
      endDate: new Date('2025-01-01T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: {
        freq: 'WEEKLY',
        interval: 1,
        count: 10,
      } as RecurrenceRule,
      timeZone: 'America/New_York',
      slug: 'weekly-meeting',
    };

    const splitDate = '2025-01-15T10:00:00.000Z';

    const updateEventDto = {
      name: 'Weekly Meeting (Updated)',
      description: 'Team sync with new format',
    };

    const mockNewEvent = {
      id: 2,
      name: 'Weekly Meeting (Updated)',
      description: 'Team sync with new format',
      startDate: new Date('2025-01-01T10:00:00.000Z'),
      endDate: new Date('2025-01-01T11:00:00.000Z'),
      isRecurring: true,
      recurrenceRule: {
        freq: 'WEEKLY',
        interval: 1,
        count: 6,
      } as RecurrenceRule,
      timeZone: 'America/New_York',
      parentEventId: 1,
      originalDate: new Date(splitDate),
      recurrenceSplitPoint: true,
    };

    beforeEach(() => {
      mockRecurrenceService.isDateInRecurrencePattern.mockReturnValue(true);
      mockRecurrenceService.generateOccurrences.mockImplementation(
        (start, rule, options) => {
          const dates: Date[] = [];
          let date = new Date(typeof start === 'string' ? start : start);
          const limit = rule.count || 10;

          for (let i = 0; i < limit; i++) {
            dates.push(new Date(date));
            // Add 7 days for weekly recurrence
            date = new Date(date);
            date.setDate(date.getDate() + 7);
          }

          if (options?.until) {
            const untilDate = new Date(options.until);
            return dates.filter((d) => d <= untilDate);
          }

          return dates;
        },
      );

      mockEventQueryService.findEventBySlug.mockResolvedValue(mockEvent);
      mockEventManagementService.create.mockResolvedValue(mockNewEvent);
      mockEventManagementService.update.mockResolvedValue({
        ...mockEvent,
        recurrenceRule: {
          ...mockEvent.recurrenceRule,
          until: '2025-01-14T10:00:00.000Z',
        },
      });
    });

    it('should throw an error if event is not recurring', async () => {
      const nonRecurringEvent = { ...mockEvent, isRecurring: false };
      mockEventQueryService.findEventBySlug.mockResolvedValueOnce(
        nonRecurringEvent,
      );

      await expect(
        service.splitSeriesAt('weekly-meeting', splitDate, updateEventDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw an error if split date is not in recurrence pattern', async () => {
      mockRecurrenceService.isDateInRecurrencePattern.mockReturnValueOnce(
        false,
      );

      await expect(
        service.splitSeriesAt('weekly-meeting', splitDate, updateEventDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a new series starting from the split date', async () => {
      await service.splitSeriesAt('weekly-meeting', splitDate, updateEventDto);

      expect(mockEventManagementService.create).toHaveBeenCalled();

      // Verify correct parameters were passed to create
      const createCallArg = mockEventManagementService.create.mock.calls[0][0];
      expect(createCallArg.recurrenceSplitPoint).toBe(true);
      expect(createCallArg.parentEventId).toBe(mockEvent.id);
      expect(createCallArg.originalDate).toEqual(new Date(splitDate));
      expect(createCallArg.name).toBe(updateEventDto.name);
      expect(createCallArg.description).toBe(updateEventDto.description);
    });

    it('should update the original event to end before the split date', async () => {
      await service.splitSeriesAt('weekly-meeting', splitDate, updateEventDto);

      expect(mockEventManagementService.update).toHaveBeenCalled();

      // Verify the update was called with the correct parameters
      const [slug, updateDto, userId] =
        mockEventManagementService.update.mock.calls[0];
      expect(slug).toBe('weekly-meeting');
      expect(updateDto.recurrenceRule).toHaveProperty('until');
      expect(userId).toBe(mockRequest.user.id);
    });

    it('should adjust the count for the new series', async () => {
      // Mock the recurrence service to return a specific sequence of dates
      mockRecurrenceService.generateOccurrences.mockReturnValueOnce([
        new Date('2025-01-01T10:00:00.000Z'),
        new Date('2025-01-08T10:00:00.000Z'),
        new Date('2025-01-15T10:00:00.000Z'),
        new Date('2025-01-22T10:00:00.000Z'),
        new Date('2025-01-29T10:00:00.000Z'),
        new Date('2025-02-05T10:00:00.000Z'),
        new Date('2025-02-12T10:00:00.000Z'),
        new Date('2025-02-19T10:00:00.000Z'),
        new Date('2025-02-26T10:00:00.000Z'),
        new Date('2025-03-05T10:00:00.000Z'),
      ]);

      await service.splitSeriesAt('weekly-meeting', splitDate, updateEventDto);

      // The original recurrence rule had a count of 10
      // If we split at the 3rd occurrence (Jan 15), the new count should be less
      const createCallArg = mockEventManagementService.create.mock.calls[0][0];
      expect(createCallArg.recurrenceRule.count).toBeLessThan(10);
    });
  });

  describe('convertToRecurrenceRuleDto', () => {
    it('should convert RecurrenceRule frequency from enum to string', () => {
      // We need to use the private method
      const convertToRecurrenceRuleDto =
        service['convertToRecurrenceRuleDto'].bind(service);

      // Create a RecurrenceRule with Frequency enum as freq
      const recurrenceRule = {
        freq: 0, // Represents Frequency.YEARLY in the enum
        interval: 1,
        count: 10,
      };

      const dto = convertToRecurrenceRuleDto(recurrenceRule);

      // Should convert to a string
      expect(typeof dto.freq).toBe('string');
      expect(dto.freq).toBe('0');
      expect(dto.interval).toBe(1);
      expect(dto.count).toBe(10);
    });

    it('should convert RecurrenceRule until Date to string', () => {
      const convertToRecurrenceRuleDto =
        service['convertToRecurrenceRuleDto'].bind(service);

      // Create a RecurrenceRule with Date as until
      const testDate = new Date('2025-12-31T23:59:59.000Z');
      const recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
        until: testDate,
      };

      const dto = convertToRecurrenceRuleDto(recurrenceRule);

      // Should convert to a string
      expect(typeof dto.until).toBe('string');
      expect(dto.until).toBe(testDate.toISOString());
    });

    it('should handle RecurrenceRule until already as string', () => {
      const convertToRecurrenceRuleDto =
        service['convertToRecurrenceRuleDto'].bind(service);

      // Create a RecurrenceRule with string as until
      const dateString = '2025-12-31T23:59:59.000Z';
      const recurrenceRule = {
        freq: 'WEEKLY',
        interval: 1,
        until: dateString,
      };

      const dto = convertToRecurrenceRuleDto(recurrenceRule);

      // Should keep as string
      expect(typeof dto.until).toBe('string');
      expect(dto.until).toBe(dateString);
    });
  });

  describe('getEffectiveEventForDate', () => {
    const parentEvent = {
      id: 1,
      slug: 'original-series',
      name: 'Original Series',
      startDate: new Date('2025-01-01T10:00:00.000Z'),
      isRecurring: true,
    };

    const splitPoint1 = {
      id: 2,
      slug: 'first-split',
      name: 'First Split',
      startDate: new Date('2025-01-01T10:00:00.000Z'),
      isRecurring: true,
      parentEventId: 1,
      originalDate: new Date('2025-01-15T10:00:00.000Z'),
      recurrenceSplitPoint: true,
    };

    const splitPoint2 = {
      id: 3,
      slug: 'second-split',
      name: 'Second Split',
      startDate: new Date('2025-01-01T10:00:00.000Z'),
      isRecurring: true,
      parentEventId: 1,
      originalDate: new Date('2025-02-15T10:00:00.000Z'),
      recurrenceSplitPoint: true,
    };

    it('should return parent event if no split points exist', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(parentEvent);
      mockEventQueryService.findEventsByParentId.mockResolvedValue([]);

      const result = await service.getEffectiveEventForDate(
        'original-series',
        '2025-01-10T10:00:00.000Z',
      );

      expect(result).toEqual(parentEvent);
    });

    it('should return parent event if date is before any split points', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(parentEvent);
      mockEventQueryService.findEventsByParentId.mockResolvedValue([
        splitPoint1,
        splitPoint2,
      ]);

      const result = await service.getEffectiveEventForDate(
        'original-series',
        '2025-01-10T10:00:00.000Z',
      );

      expect(result).toEqual(parentEvent);
    });

    it('should return first split point if date is between first and second split', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(parentEvent);
      mockEventQueryService.findEventsByParentId.mockResolvedValue([
        splitPoint1,
        splitPoint2,
      ]);

      const result = await service.getEffectiveEventForDate(
        'original-series',
        '2025-02-01T10:00:00.000Z',
      );

      expect(result).toEqual(splitPoint1);
    });

    it('should return second split point if date is after second split', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(parentEvent);
      mockEventQueryService.findEventsByParentId.mockResolvedValue([
        splitPoint1,
        splitPoint2,
      ]);

      const result = await service.getEffectiveEventForDate(
        'original-series',
        '2025-03-01T10:00:00.000Z',
      );

      expect(result).toEqual(splitPoint2);
    });

    it('should handle multiple split points in any order', async () => {
      mockEventQueryService.findEventBySlug.mockResolvedValue(parentEvent);
      // Return split points in reverse order to test sorting
      mockEventQueryService.findEventsByParentId.mockResolvedValue([
        splitPoint2,
        splitPoint1,
      ]);

      const result = await service.getEffectiveEventForDate(
        'original-series',
        '2025-03-01T10:00:00.000Z',
      );

      expect(result).toEqual(splitPoint2);
    });
  });
});
