import { Test, TestingModule } from '@nestjs/testing';
import { RecurrencePatternService } from './recurrence-pattern.service';
import {
  RecurrenceFrequency,
  RecurrenceRule,
} from '../interfaces/recurrence.interface';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { Logger } from '@nestjs/common';

describe('Timezone Handling', () => {
  let recurrencePatternService: RecurrencePatternService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrencePatternService],
    }).compile();

    recurrencePatternService = module.get<RecurrencePatternService>(
      RecurrencePatternService,
    );
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => ({}));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => ({}));
  });

  describe('UTC to local time conversion', () => {
    it('should correctly convert UTC dates to America/New_York', () => {
      // Test basic conversion without DST issues
      const utcDate = new Date('2023-01-15T15:00:00.000Z'); // 3:00 PM UTC
      const localTimeStr = formatInTimeZone(
        utcDate,
        'America/New_York',
        'HH:mm',
      );

      // In January, America/New_York is UTC-5
      expect(localTimeStr).toBe('10:00');
    });

    it('should convert dates correctly around Spring DST transition', () => {
      // March 12, 2023 was the spring forward date (2am -> 3am)

      // Before DST transition (March 11)
      const beforeDstUtc = new Date('2023-03-11T15:00:00.000Z');
      const beforeDstLocal = formatInTimeZone(
        beforeDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(beforeDstLocal).toBe('10:00');

      // Day of DST transition (March 12)
      const duringDstUtc = new Date('2023-03-12T14:00:00.000Z');
      const duringDstLocal = formatInTimeZone(
        duringDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(duringDstLocal).toBe('10:00');

      // After DST transition (March 13)
      const afterDstUtc = new Date('2023-03-13T14:00:00.000Z');
      const afterDstLocal = formatInTimeZone(
        afterDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(afterDstLocal).toBe('10:00');
    });

    it('should convert dates correctly around Fall DST transition', () => {
      // November 5, 2023 was the fall back date (2am -> 1am)

      // Before DST transition (November 4)
      const beforeDstUtc = new Date('2023-11-04T14:00:00.000Z');
      const beforeDstLocal = formatInTimeZone(
        beforeDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(beforeDstLocal).toBe('10:00');

      // Day of DST transition (November 5)
      const duringDstUtc = new Date('2023-11-05T15:00:00.000Z');
      const duringDstLocal = formatInTimeZone(
        duringDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(duringDstLocal).toBe('10:00');

      // After DST transition (November 6)
      const afterDstUtc = new Date('2023-11-06T15:00:00.000Z');
      const afterDstLocal = formatInTimeZone(
        afterDstUtc,
        'America/New_York',
        'HH:mm',
      );
      expect(afterDstLocal).toBe('10:00');
    });
  });

  describe('generateOccurrences timezone handling', () => {
    it('should maintain consistent local time for daily events spanning Spring DST transition', () => {
      // Test with a start date before the 2023 Spring DST transition
      const startDate = new Date('2023-03-10T15:00:00.000Z'); // 10:00 AM Eastern

      const rule: RecurrenceRule = {
        frequency: RecurrenceFrequency.DAILY,
        interval: 1,
        count: 7,
      };

      const occurrences = recurrencePatternService.generateOccurrences(
        startDate,
        rule,
        { timeZone: 'America/New_York' },
      );

      // Check that all occurrences are at 10:00 AM local time
      occurrences.forEach((occurrenceStr, index) => {
        const occurrence = new Date(occurrenceStr);
        const localTime = formatInTimeZone(
          occurrence,
          'America/New_York',
          'HH:mm',
        );
        expect(localTime).toBe('10:00');
        // Also verify with a descriptive message
        expect(localTime).toEqual('10:00');
        // Record the occurrence for debugging
        if (localTime !== '10:00') {
          console.log(
            `Occurrence ${index} (${occurrence.toISOString()}) should be at 10:00 AM Eastern but was ${localTime}`,
          );
        }
      });
    });

    it('should handle local-to-UTC conversion correctly', () => {
      // Test the toDate utility specifically
      const localDateTimeStr = '2023-03-12 10:00:00'; // During DST transition
      const utcDate = toDate(localDateTimeStr, {
        timeZone: 'America/New_York',
      });

      // Convert back to local to verify
      const localTime = formatInTimeZone(utcDate, 'America/New_York', 'HH:mm');
      expect(localTime).toBe('10:00');
    });

    it('should debug underlying issue with first occurrence', () => {
      // Create a date similar to the one in the failing test
      const startDate = new Date('2025-04-05T10:00:00.000Z'); // Note: this is 6:00 AM in Eastern time (EDT)

      // Convert this to local time to see what's happening
      const localTimeStr = formatInTimeZone(
        startDate,
        'America/New_York',
        'HH:mm',
      );
      console.log(
        `Starting date ${startDate.toISOString()} is ${localTimeStr} in America/New_York`,
      );

      // Try the conversion steps used in the service
      const localDateTimeStr = formatInTimeZone(
        startDate,
        'America/New_York',
        'yyyy-MM-dd HH:mm:ss',
      );
      console.log(`Local date time string: ${localDateTimeStr}`);

      const dtstartDateObject = toDate(localDateTimeStr, {
        timeZone: 'America/New_York',
      });
      console.log(`Converted back to UTC: ${dtstartDateObject.toISOString()}`);

      // Check if the conversion is working correctly
      const reconvertedLocalTime = formatInTimeZone(
        dtstartDateObject,
        'America/New_York',
        'HH:mm',
      );
      console.log(`Reconverted to local time: ${reconvertedLocalTime}`);

      // Verify original time matches final time
      expect(reconvertedLocalTime).toBe(localTimeStr);
    });
  });
});
