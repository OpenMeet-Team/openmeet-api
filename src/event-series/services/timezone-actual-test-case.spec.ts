import { Test, TestingModule } from '@nestjs/testing';
import { RecurrencePatternService } from './recurrence-pattern.service';
import {
  RecurrenceFrequency,
  RecurrenceRule,
} from '../interfaces/recurrence.interface';
import { formatInTimeZone, toDate } from 'date-fns-tz';
import { Logger } from '@nestjs/common';

describe('Actual Test Case for Timezone Issue', () => {
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

  describe('DST Transition Test Event', () => {
    it('should analyze the exact scenario from the failing test', () => {
      // From e2e test error:
      // Expected: "10:00"
      // Received: "06:00"

      // Extract the date from the test failure data
      const startDate = new Date('2025-04-05T10:00:00.000Z');
      console.log('Initial UTC date from test:', startDate.toISOString());

      // Check what time this date represents in America/New_York
      const localTimeStr = formatInTimeZone(
        startDate,
        'America/New_York',
        'HH:mm',
      );
      console.log(
        `The UTC date ${startDate.toISOString()} is ${localTimeStr} in America/New_York`,
      );

      // If the test expects 10:00 but gets 06:00, debug the conversion steps in the service

      // Step 1 in RecurrencePatternService.generateOccurrences: Format UTC to local time string
      const localDateTimeStr = formatInTimeZone(
        startDate,
        'America/New_York',
        'yyyy-MM-dd HH:mm:ss',
      );
      console.log(`1. Local date time string: ${localDateTimeStr}`);

      // Step 2: Parse this local time back to UTC using toDate
      const dtstartDateObject = toDate(localDateTimeStr, {
        timeZone: 'America/New_York',
      });
      console.log(
        `2. Converted back to UTC: ${dtstartDateObject.toISOString()}`,
      );

      // Check if original time is maintained
      const reconvertedLocalTime = formatInTimeZone(
        dtstartDateObject,
        'America/New_York',
        'HH:mm',
      );
      console.log(`3. Reconverted to local time: ${reconvertedLocalTime}`);

      // Now try to generate the occurrences and check their times
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

      //   console.log('\nGenerated occurrences:');
      occurrences.forEach((_occurrenceStr, _index) => {
        // Remove unused variable
        // console.log(`  ${formatISO(occurrence)} -> ${localTime}`);
      });

      // Try direct conversion of the first occurrence
      const firstOccurrence = new Date(occurrences[0]);
      const firstOccLocalTime = formatInTimeZone(
        firstOccurrence,
        'America/New_York',
        'HH:mm',
      );
      console.log(
        `\nFirst occurrence: ${firstOccurrence.toISOString()} -> ${firstOccLocalTime} America/New_York`,
      );

      // Check if the following correct time works directly
      const correctUTC = new Date('2025-04-05T14:00:00.000Z'); // This should be 10:00 AM ET
      const correctLocalTime = formatInTimeZone(
        correctUTC,
        'America/New_York',
        'HH:mm',
      );
      console.log(
        `\nCorrect UTC time that is 10:00 AM ET: ${correctUTC.toISOString()} -> ${correctLocalTime}`,
      );

      // Try creating a time at exactly 10:00 AM ET and see its UTC
      const targetLocal = '2025-04-05 10:00:00';
      const targetUTC = toDate(targetLocal, { timeZone: 'America/New_York' });
      console.log(
        `\nTarget 10:00 AM ET: ${targetLocal} -> UTC ${targetUTC.toISOString()}`,
      );

      // Verify that this is indeed 10:00 AM ET
      const verifyTargetTime = formatInTimeZone(
        targetUTC,
        'America/New_York',
        'HH:mm',
      );
      console.log(`Verification: ${verifyTargetTime}`);

      // Check with a hard-coded time that should be 10:00 AM ET on that day
      expect(
        formatInTimeZone(
          new Date('2025-04-05T14:00:00.000Z'),
          'America/New_York',
          'HH:mm',
        ),
      ).toBe('10:00');
    });
  });
});
