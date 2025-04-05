import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

export class TimezoneUtils {
  /**
   * Converts a date to the specified timezone
   * @param date The date to convert
   * @param timeZone The timezone to convert to
   * @returns The date in the specified timezone
   */
  static convertToTimeZone(date: Date, timeZone: string): Date {
    return toZonedTime(date, timeZone);
  }

  /**
   * Parses a date string in the specified timezone
   * @param dateString The date string to parse
   * @param timeZone The timezone to parse in
   * @returns The date in the specified timezone
   */
  static parseInTimezone(dateString: string | Date, timeZone: string): Date {
    const date =
      typeof dateString === 'string' ? new Date(dateString) : dateString;
    return toZonedTime(date, timeZone);
  }

  /**
   * Formats a date in the specified timezone
   * @param date The date to format
   * @param timeZone The timezone to format in
   * @returns The formatted date string
   */
  static formatInTimezone(date: Date, timeZone: string): string {
    return formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  /**
   * Adjusts a collection of occurrences to account for DST transitions
   * in the specified timezone.
   * @param occurrences Array of occurrence dates
   * @param timeZone The timezone to adjust for
   * @returns Array of adjusted dates
   */
  static adjustOccurrencesForDST(
    occurrences: Date[],
    timeZone = 'UTC',
  ): Date[] {
    if (timeZone === 'UTC') {
      return occurrences;
    }

    return occurrences.map((occurrence) => {
      // Convert to zoned time to properly account for DST
      const zonedTime = toZonedTime(occurrence, timeZone);

      // Convert back to UTC to ensure consistent storage
      return fromZonedTime(zonedTime, timeZone);
    });
  }
}
