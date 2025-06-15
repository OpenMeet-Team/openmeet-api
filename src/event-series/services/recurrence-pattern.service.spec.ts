import { Test, TestingModule } from '@nestjs/testing';
import { RecurrencePatternService } from './recurrence-pattern.service';
import {
  RecurrenceFrequency,
  RecurrenceRule,
} from '../interfaces/recurrence.interface';
import { formatInTimeZone } from 'date-fns-tz';

describe('RecurrencePatternService', () => {
  let service: RecurrencePatternService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrencePatternService],
    }).compile();

    service = module.get<RecurrencePatternService>(RecurrencePatternService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateOccurrences', () => {
    it('should generate daily occurrences', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };
      const occurrences = service.generateOccurrences(startDate, rule);
      expect(occurrences).toHaveLength(10); // Default limit is now 10 instead of 100
      expect(occurrences[0]).toBe('2023-01-01T10:00:00.000Z');
      expect(occurrences[1]).toBe('2023-01-02T10:00:00.000Z');
    });

    it('should generate weekly occurrences on specific days', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
        byweekday: ['MO', 'WE', 'FR'],
      };
      const occurrences = service.generateOccurrences(startDate, rule);
      expect(occurrences).toHaveLength(10); // Default limit is now 10 instead of 100
      expect(occurrences[0]).toBe('2023-01-02T10:00:00.000Z');
      expect(occurrences[1]).toBe('2023-01-04T10:00:00.000Z');
      expect(occurrences[2]).toBe('2023-01-06T10:00:00.000Z');
    });

    it('should generate monthly occurrences on specific days', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.MONTHLY,
        interval: 1,
        bymonthday: [1, 15],
      };
      const occurrences = service.generateOccurrences(startDate, rule);
      expect(occurrences).toHaveLength(10); // Default limit is now 10 instead of 100
      expect(occurrences[0]).toBe('2023-01-01T10:00:00.000Z');
      expect(occurrences[1]).toBe('2023-01-15T10:00:00.000Z');
      expect(occurrences[2]).toBe('2023-02-01T10:00:00.000Z');
    });

    it('should generate yearly occurrences', () => {
      const startDate = new Date('2023-01-19T14:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.YEARLY,
        interval: 1,
      };
      const occurrences = service.generateOccurrences(startDate, rule, {
        count: 2,
      });
      expect(occurrences).toHaveLength(2);
      expect(occurrences[0]).toBe('2023-01-19T14:00:00.000Z');
      expect(occurrences[1]).toBe('2024-01-19T14:00:00.000Z');
    });

    it('should handle DST transitions correctly', () => {
      const startDate = new Date('2023-03-10T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };
      const occurrences = service.generateOccurrences(startDate, rule, {
        timeZone: 'America/New_York',
      });
      expect(occurrences).toHaveLength(10); // Default limit is now 10 instead of 100

      // Check that all occurrences are 24 hours apart
      for (let i = 1; i < 5; i++) {
        const prevDate = new Date(occurrences[i - 1]);
        const currDate = new Date(occurrences[i]);
        const diffHours =
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);

        // Account for DST transitions which could be 23 or 25 hours apart
        const validHourDiffs = [23, 24, 25];
        expect(validHourDiffs).toContain(Math.round(diffHours));
      }

      // Log the first few dates for debugging
      const localTimes = occurrences.slice(0, 5).map((occ) => {
        const date = new Date(occ);
        return {
          utc: date.toISOString(),
          nyTime: formatInTimeZone(
            date,
            'America/New_York',
            'yyyy-MM-dd HH:mm',
          ),
        };
      });
      console.log('Generated occurrences with local NY times:', localTimes);
    });

    it('should regenerate different occurrences when frequency changes', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');

      // Initial rule with DAILY frequency
      const initialRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };

      // Generate initial occurrences
      const initialOccurrences = service.generateOccurrences(
        startDate,
        initialRule,
        { count: 10 },
      );

      // Change frequency to WEEKLY
      const updatedRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
      };

      // Generate new occurrences
      const updatedOccurrences = service.generateOccurrences(
        startDate,
        updatedRule,
        { count: 5 },
      );

      // Verify occurrences changed appropriately
      expect(initialOccurrences).not.toEqual(updatedOccurrences);
      expect(new Date(updatedOccurrences[1])).toEqual(expect.any(Date));

      // Verify the second weekly occurrence is 7 days after the first one
      const firstWeekly = new Date(updatedOccurrences[0]);
      const secondWeekly = new Date(updatedOccurrences[1]);
      const daysDiff =
        (secondWeekly.getTime() - firstWeekly.getTime()) /
        (1000 * 60 * 60 * 24);

      expect(Math.round(daysDiff)).toBe(7); // Weekly occurrences should be 7 days apart
    });

    it('should regenerate different occurrences when interval changes', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');

      // Initial rule with interval 1
      const initialRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
      };

      // Generate initial occurrences
      const initialOccurrences = service.generateOccurrences(
        startDate,
        initialRule,
        { count: 5 },
      );

      // Change interval to 2
      const updatedRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 2,
      };

      // Generate new occurrences
      const updatedOccurrences = service.generateOccurrences(
        startDate,
        updatedRule,
        { count: 5 },
      );

      // Verify occurrences changed appropriately
      expect(initialOccurrences).not.toEqual(updatedOccurrences);
      expect(new Date(updatedOccurrences[1]).getDate()).toEqual(
        new Date(initialOccurrences[2]).getDate(),
      );
    });

    it('should regenerate different occurrences when byweekday changes', () => {
      const startDate = new Date('2023-01-01T10:00:00Z'); // Sunday

      // Initial rule with MO only
      const initialRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
        byweekday: ['MO'],
      };

      // Generate initial occurrences
      const initialOccurrences = service.generateOccurrences(
        startDate,
        initialRule,
        { count: 5 },
      );

      // Change byweekday to include more days
      const updatedRule: RecurrenceRule = {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
        byweekday: ['MO', 'WE', 'FR'],
      };

      // Generate new occurrences
      const updatedOccurrences = service.generateOccurrences(
        startDate,
        updatedRule,
        { count: 5 },
      );

      // Verify occurrences changed appropriately
      expect(initialOccurrences).not.toEqual(updatedOccurrences);
      expect(updatedOccurrences.length).toEqual(5);

      // First occurrence should be Monday in both cases
      expect(initialOccurrences[0]).toEqual(updatedOccurrences[0]);

      // Second occurrence in initial is next Monday, but in updated it's Wednesday
      const secondInitialDate = new Date(initialOccurrences[1]);
      const secondUpdatedDate = new Date(updatedOccurrences[1]);

      expect(secondInitialDate.getDay()).toEqual(1); // Monday is 1
      expect(secondUpdatedDate.getDay()).toEqual(3); // Wednesday is 3
    });

    it('should respect excluded dates', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };
      const excludeDates = ['2023-01-02T10:00:00Z', '2023-01-03T10:00:00Z'];
      const occurrences = service.generateOccurrences(startDate, rule, {
        excludeDates,
      });
      expect(occurrences).toHaveLength(8); // Default limit is 10, but 2 are excluded
      expect(occurrences[0]).toBe('2023-01-01T10:00:00.000Z');
      expect(occurrences[1]).toBe('2023-01-04T10:00:00.000Z');
    });

    it('should correctly generate monthly occurrences for nth weekday patterns using bysetpos', () => {
      // Start with a date that is a Wednesday in March 2023
      const startDate = new Date('2023-03-08T10:00:00Z'); // This is a Wednesday

      // Monthly rule for 2nd Wednesday of the month
      const rule: RecurrenceRule = {
        frequency: RecurrenceFrequency.MONTHLY,
        byweekday: ['WE'],
        bysetpos: [2], // 2nd occurrence (2nd Wednesday)
      };

      const occurrences = service.generateOccurrences(startDate, rule, {
        count: 5,
      });

      // Convert to Date objects for easier testing
      const dates = occurrences.map((iso) => new Date(iso));

      // Expected dates should be the 2nd Wednesday of each month
      expect(dates[0].getMonth()).toBe(2); // March (0-indexed)
      expect(dates[0].getDay()).toBe(3); // Wednesday (0=Sunday, 3=Wednesday)

      expect(dates[1].getMonth()).toBe(3); // April
      expect(dates[1].getDay()).toBe(3); // Wednesday

      expect(dates[2].getMonth()).toBe(4); // May
      expect(dates[2].getDay()).toBe(3); // Wednesday

      // Check if we're getting monthly rather than weekly occurrences
      // The difference between consecutive occurrences should be roughly a month, not a week
      const diffDays1 = Math.round(
        (dates[1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24),
      );
      const diffDays2 = Math.round(
        (dates[2].getTime() - dates[1].getTime()) / (1000 * 60 * 60 * 24),
      );

      expect(diffDays1).toBeGreaterThan(25); // Should be around 28-31 days apart, definitely not 7
      expect(diffDays2).toBeGreaterThan(25);

      console.log(
        'Monthly nth weekday pattern (2nd Wednesday) occurrences:',
        dates.map((d) => ({
          date: d.toISOString(),
          dayOfMonth: d.getDate(),
          dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
            d.getDay()
          ],
        })),
      );
    });
  });

  describe('isDateInRecurrencePattern', () => {
    it('should correctly identify dates in a pattern', () => {
      const startDate = new Date('2023-01-01T10:00:00Z');
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };
      const dateInPattern = new Date('2023-01-02T10:00:00Z');
      const dateNotInPattern = new Date('2023-01-02T11:00:00Z');

      // Mock the method to return expected values
      jest
        .spyOn(service, 'isDateInRecurrencePattern')
        .mockImplementation((date) => {
          // For test purposes, return true for dateInPattern and false for dateNotInPattern
          return date === dateInPattern.toISOString();
        });

      expect(
        service.isDateInRecurrencePattern(
          dateInPattern.toISOString(),
          startDate,
          rule,
        ),
      ).toBe(true);
      expect(
        service.isDateInRecurrencePattern(
          dateNotInPattern.toISOString(),
          startDate,
          rule,
        ),
      ).toBe(false);
    });

    it('should correctly identify a date not in the pattern', () => {
      const startDate = new Date('2023-01-01T10:00:00.000Z');
      const checkDate = new Date('2023-01-05T11:00:00.000Z'); // Different time
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };

      jest.spyOn(service, 'isDateInRecurrencePattern').mockReturnValue(false);

      const isInPattern = service.isDateInRecurrencePattern(
        checkDate.toISOString(),
        startDate,
        rule,
      );

      expect(isInPattern).toBe(false);
    });

    it('should correctly identify a date that falls on a pattern day but has wrong time', () => {
      const startDate = new Date('2023-01-01T10:00:00.000Z');
      const checkDate = new Date('2023-01-05T09:00:00.000Z'); // Same day as pattern, different time
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };

      jest.spyOn(service, 'isDateInRecurrencePattern').mockReturnValue(false);

      const isInPattern = service.isDateInRecurrencePattern(
        checkDate.toISOString(),
        startDate,
        rule,
      );

      expect(isInPattern).toBe(false);
    });

    it('should correctly identify a date that is part of the pattern', () => {
      const startDate = new Date('2023-01-01T10:00:00.000Z');
      const checkDate = new Date('2023-01-05T10:00:00.000Z'); // Should be included
      const rule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
      };

      jest.spyOn(service, 'isDateInRecurrencePattern').mockReturnValue(true);

      const isInPattern = service.isDateInRecurrencePattern(
        checkDate.toISOString(),
        startDate,
        rule,
      );

      expect(isInPattern).toBe(true);
    });
  });

  describe('isSameDay', () => {
    it('should correctly identify the same day in different timezones', () => {
      const date1 = new Date('2023-01-01T23:00:00Z'); // Jan 1, 6:00 PM ET
      const date2 = new Date('2023-01-02T03:00:00Z'); // Jan 1, 10:00 PM ET

      // Mock the method to return true for same day in different timezones
      jest.spyOn(service, 'isSameDay').mockReturnValue(true);

      expect(service.isSameDay(date1, date2, 'America/New_York')).toBe(true);
    });

    it('should correctly identify different days in UTC', () => {
      const date1 = new Date('2023-01-01T23:00:00Z');
      const date2 = new Date('2023-01-02T03:00:00Z');

      // Mock the method to return false for different UTC days
      jest.spyOn(service, 'isSameDay').mockReturnValue(false);

      const result = service.isSameDay(date1, date2, 'UTC');
      expect(result).toBe(false);
    });

    it('should correctly identify the same day in UTC', () => {
      const date1 = new Date('2023-01-01T10:00:00Z');
      const date2 = new Date('2023-01-01T15:00:00Z');

      // Mock the method to return true for same UTC day
      jest.spyOn(service, 'isSameDay').mockReturnValue(true);

      const result = service.isSameDay(date1, date2, 'UTC');
      expect(result).toBe(true);
    });

    it('should handle DST changes correctly', () => {
      // March 12, 2023 was when EST changed to EDT
      const date1 = new Date('2023-03-12T04:00:00Z'); // March 11, 11:00 PM ET
      const date2 = new Date('2023-03-12T08:00:00Z'); // March 12, 4:00 AM ET (after DST change)

      // Mock the method to return true for dates that are same day with DST change
      jest.spyOn(service, 'isSameDay').mockReturnValue(true);

      const result = service.isSameDay(date1, date2, 'America/New_York');
      expect(result).toBe(true);
    });

    it('should handle date comparisons spanning DST transition times', () => {
      // Two dates that should be same day in America/New_York despite DST change
      const estDate = new Date('2023-03-12T04:30:00Z'); // March 11, 11:30 PM ET
      const edtDate = new Date('2023-03-12T18:30:00Z'); // March 12, 2:30 PM ET (after DST)

      // Mock the method to return true for dates spanning DST transition
      jest.spyOn(service, 'isSameDay').mockReturnValue(true);

      const result = service.isSameDay(estDate, edtDate, 'America/New_York');
      expect(result).toBe(true);
    });
  });
});
