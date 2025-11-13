import { Test, TestingModule } from '@nestjs/testing';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { RecurrenceFrequency } from '../interfaces/recurrence.interface';
import { formatInTimeZone } from 'date-fns-tz';

describe('RecurrencePatternService - Monthly Day 29', () => {
  let service: RecurrencePatternService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrencePatternService],
    }).compile();

    service = module.get<RecurrencePatternService>(RecurrencePatternService);
  });

  it('should generate monthly occurrences on day 29 starting from Oct 29, 2025', () => {
    // Exact scenario from screenshot
    const startDate = new Date('2025-10-29T17:00:00-04:00'); // Wed Oct 29, 5pm EDT
    const timeZone = 'America/New_York';

    const rule = {
      frequency: RecurrenceFrequency.MONTHLY,
      interval: 1,
      bymonthday: [29], // Day 29 of each month
    };

    const occurrences = service.generateOccurrences(startDate, rule, {
      timeZone,
      count: 10,
    });

    console.log('\nGenerated monthly occurrences (day 29):');
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const localDisplay = formatInTimeZone(
        date,
        timeZone,
        'EEEE, MMMM d, yyyy h:mm a z',
      );
      console.log(`  ${index + 1}. ${localDisplay}`);
    });

    // First occurrence should be October 29, 2025
    const firstDate = new Date(occurrences[0]);
    const firstMonth = formatInTimeZone(firstDate, timeZone, 'MMMM yyyy');
    const firstDay = parseInt(formatInTimeZone(firstDate, timeZone, 'd'));

    console.log('\nFirst occurrence check:');
    console.log(`  Month: ${firstMonth}`);
    console.log(`  Day: ${firstDay}`);

    expect(firstMonth).toBe('October 2025');
    expect(firstDay).toBe(29);

    // All occurrences should be on day 29 (or last day of month for Feb)
    occurrences.forEach((isoString, index) => {
      const date = new Date(isoString);
      const day = parseInt(formatInTimeZone(date, timeZone, 'd'));
      const month = formatInTimeZone(date, timeZone, 'MMMM yyyy');
      const time = formatInTimeZone(date, timeZone, 'h:mm a');

      // February might be 28 (non-leap year)
      if (month.startsWith('February')) {
        expect([28, 29]).toContain(day);
      } else {
        expect(day).toBe(29);
      }

      // Time should always be 5:00 PM
      expect(time).toBe('5:00 PM');

      console.log(`  ✓ ${month} day ${day} at ${time}`);
    });
  });
});
