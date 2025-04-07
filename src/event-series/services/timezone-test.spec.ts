import { formatInTimeZone, toDate } from 'date-fns-tz';

describe('Timezone Conversion Functions', () => {
  describe('UTC to America/New_York conversions', () => {
    it('should correctly convert UTC dates to America/New_York local time', () => {
      // The test date from the failing test
      const utcDate = new Date('2025-04-05T10:00:00.000Z');
      const localTime = formatInTimeZone(utcDate, 'America/New_York', 'HH:mm');

      console.log(
        `UTC date ${utcDate.toISOString()} is ${localTime} in America/New_York`,
      );

      // In April 2025, America/New_York is on EDT (UTC-4)
      expect(localTime).toBe('06:00');
    });

    it('should determine correct UTC time for desired local time', () => {
      // We want 10:00 AM in America/New_York
      const targetLocalTimeString = '2025-04-05 10:00:00';
      const targetUTCDate = toDate(targetLocalTimeString, {
        timeZone: 'America/New_York',
      });

      console.log(
        `Target local time "${targetLocalTimeString}" is ${targetUTCDate.toISOString()} in UTC`,
      );

      // Verify this conversion
      const convertedBackLocal = formatInTimeZone(
        targetUTCDate,
        'America/New_York',
        'HH:mm',
      );
      console.log(`Converted back to local: ${convertedBackLocal}`);

      expect(convertedBackLocal).toBe('10:00');

      // We expect the UTC time to be 4 hours ahead due to EDT offset
      expect(targetUTCDate.toISOString()).toBe('2025-04-05T14:00:00.000Z');
    });
  });

  describe('Recurrence date handling with fixed local time', () => {
    it('should maintain consistent local time across dates', () => {
      // For these dates, we want them all to be at 10:00 AM America/New_York:
      const dates = [
        '2025-04-05T10:00:00.000Z', // Original date from test
        '2025-04-06T10:00:00.000Z', // Next day
        '2025-04-07T10:00:00.000Z', // Two days later
      ];

      // Test solution approach: fix the times to 10:00 AM ET
      const fixedDates = dates.map((dateStr) => {
        const originalDate = new Date(dateStr);

        // Extract local date in target timezone
        const localDate = formatInTimeZone(
          originalDate,
          'America/New_York',
          'yyyy-MM-dd',
        );

        // Create a string with the local date and the desired time (10:00 AM)
        const targetLocalString = `${localDate} 10:00:00`;

        // Convert this target local time back to UTC
        const correctUTCDate = toDate(targetLocalString, {
          timeZone: 'America/New_York',
        });

        return correctUTCDate.toISOString();
      });

      console.log('Original dates converted to 10:00 AM ET:');

      for (let i = 0; i < dates.length; i++) {
        const originalDate = new Date(dates[i]);
        const fixedDate = new Date(fixedDates[i]);

        const originalLocal = formatInTimeZone(
          originalDate,
          'America/New_York',
          'HH:mm',
        );
        const fixedLocal = formatInTimeZone(
          fixedDate,
          'America/New_York',
          'HH:mm',
        );

        console.log(`Original: ${dates[i]} -> ${originalLocal} ET`);
        console.log(`Fixed:    ${fixedDates[i]} -> ${fixedLocal} ET`);

        // Verify the fixed date is at 10:00 AM ET
        expect(fixedLocal).toBe('10:00');
      }
    });
  });
});
