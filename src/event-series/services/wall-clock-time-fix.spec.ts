import { Test, TestingModule } from '@nestjs/testing';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { RecurrenceFrequency } from '../interfaces/recurrence.interface';
import { formatInTimeZone } from 'date-fns-tz';

describe('RecurrencePatternService - Wall-Clock-Time Fix', () => {
  let service: RecurrencePatternService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrencePatternService],
    }).compile();

    service = module.get<RecurrencePatternService>(RecurrencePatternService);
  });

  it('should generate correct days for weekly pattern with multiple weekdays (Wed start, Tue+Thu recurrence)', () => {
    // Scenario from the bug report:
    // Start: Wednesday, October 15, 2025 at 6:00 PM PST
    // Recurrence: Every Tuesday and Thursday
    // Expected: Should generate Tuesdays and Thursdays, NOT Mondays

    const startDate = new Date('2025-10-15T18:00:00-07:00'); // Wed Oct 15, 6pm PST
    const timeZone = 'America/Vancouver'; // PST/PDT

    const rule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      byweekday: ['TU', 'TH'], // Tuesday and Thursday
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 10,
    });

    // Convert occurrences to local day names for verification
    const dayNames = occurrences.map((isoString) => {
      const date = new Date(isoString);
      return formatInTimeZone(date, timeZone, 'EEEE'); // Full day name
    });

    console.log('\nGenerated occurrences:');
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const localDisplay = formatInTimeZone(
        date,
        timeZone,
        'EEEE, MMMM d, yyyy h:mm a z',
      );
      console.log(`  ${index + 1}. ${localDisplay}`);
    });

    // Verify all occurrences are either Tuesday or Thursday
    dayNames.forEach((dayName, index) => {
      expect(['Tuesday', 'Thursday']).toContain(dayName);
      console.log(`  ✓ Occurrence ${index + 1}: ${dayName} (correct)`);
    });

    // Verify we have a mix of both days
    const hasTuesday = dayNames.some((day) => day === 'Tuesday');
    const hasThursday = dayNames.some((day) => day === 'Thursday');
    expect(hasTuesday).toBe(true);
    expect(hasThursday).toBe(true);

    // Verify NO Mondays or Wednesdays appear
    const hasMonday = dayNames.some((day) => day === 'Monday');
    const hasWednesday = dayNames.some((day) => day === 'Wednesday');
    expect(hasMonday).toBe(false);
    expect(hasWednesday).toBe(false);

    console.log('\n✅ All occurrences are on correct days (Tue/Thu only)');
  });

  it('should maintain correct time across DST for weekly pattern', () => {
    // Event at 7:00 PM PST, crossing DST boundary (Nov 2, 2025)
    const startDate = new Date('2025-10-15T19:00:00-07:00'); // Wed Oct 15, 7pm PDT
    const timeZone = 'America/Vancouver';

    const rule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      byweekday: ['WE'], // Every Wednesday
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 10,
    });

    // Check that all occurrences are at 7:00 PM local time
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const localTime = formatInTimeZone(date, timeZone, 'h:mm a');
      const dayName = formatInTimeZone(date, timeZone, 'EEEE');

      expect(localTime).toBe('7:00 PM');
      expect(dayName).toBe('Wednesday');

      console.log(
        `  ${index + 1}. ${formatInTimeZone(date, timeZone, 'MMM d, yyyy h:mm a z')} (${dayName})`,
      );
    });

    console.log(
      '\n✅ All occurrences maintain 7:00 PM local time and Wednesday',
    );
  });

  it('should handle evening events that cross UTC midnight correctly', () => {
    // Thursday 8:00 PM PST becomes Friday 4:00 AM UTC
    // This should generate THURSDAYS, not Fridays
    const startDate = new Date('2025-10-09T20:00:00-07:00'); // Thu Oct 9, 8pm PDT
    const timeZone = 'America/Vancouver';

    const rule = {
      frequency: RecurrenceFrequency.WEEKLY,
      interval: 1,
      byweekday: ['TH'], // Every Thursday
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 8,
    });

    // Verify all are Thursdays at 8:00 PM
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const dayName = formatInTimeZone(date, timeZone, 'EEEE');
      const localTime = formatInTimeZone(date, timeZone, 'h:mm a');

      expect(dayName).toBe('Thursday');
      expect(localTime).toBe('8:00 PM');

      const utcDay = formatInTimeZone(date, 'UTC', 'EEEE');
      console.log(
        `  ${index + 1}. Local: ${formatInTimeZone(date, timeZone, 'EEE h:mm a z')} | UTC: ${date.toISOString()} (${utcDay})`,
      );
    });

    console.log(
      '\n✅ All occurrences are Thursday 8pm PST (even though UTC shows Friday)',
    );
  });

  it('should handle daily recurrence across DST boundary', () => {
    // Daily 10:00 AM across DST end (Nov 2, 2025 at 2am)
    const startDate = new Date('2025-11-01T10:00:00-04:00'); // Nov 1, 10am EDT
    const timeZone = 'America/New_York';

    const rule = {
      frequency: RecurrenceFrequency.DAILY,
      interval: 1,
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 7,
    });

    // All should be 10:00 AM local time
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const localTime = formatInTimeZone(date, timeZone, 'h:mm a');

      expect(localTime).toBe('10:00 AM');

      console.log(
        `  ${index + 1}. ${formatInTimeZone(date, timeZone, 'EEE MMM d, h:mm a z')} | UTC: ${date.toISOString()}`,
      );
    });

    console.log(
      '\n✅ Daily occurrences maintain 10:00 AM across DST transition',
    );
  });

  it('should handle monthly pattern (3rd Monday) correctly with timezone', () => {
    // Monthly: 3rd Monday at 2:00 PM PST
    const startDate = new Date('2025-10-20T14:00:00-07:00'); // Mon Oct 20, 2pm PDT (3rd Mon)
    const timeZone = 'America/Los_Angeles';

    const rule = {
      frequency: RecurrenceFrequency.MONTHLY,
      interval: 1,
      byweekday: ['MO'],
      bysetpos: [3], // 3rd occurrence
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 6,
    });

    // Verify each is a Monday and at 2:00 PM
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const dayName = formatInTimeZone(date, timeZone, 'EEEE');
      const localTime = formatInTimeZone(date, timeZone, 'h:mm a');

      expect(dayName).toBe('Monday');
      expect(localTime).toBe('2:00 PM');

      console.log(
        `  ${index + 1}. ${formatInTimeZone(date, timeZone, 'EEEE, MMM d, yyyy h:mm a z')}`,
      );
    });

    console.log('\n✅ Monthly 3rd Monday pattern works correctly');
  });
});
