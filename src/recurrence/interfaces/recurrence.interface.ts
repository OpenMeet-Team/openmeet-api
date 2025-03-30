import { Frequency } from 'rrule';

/**
 * Interface for recurrence rule parameters following RFC 5545 standards
 */
export interface RecurrenceRule {
  /**
   * Frequency of recurrence (YEARLY, MONTHLY, WEEKLY, DAILY, etc.)
   */
  freq: Frequency | string;

  /**
   * Interval between recurrences (e.g., every 2 weeks)
   */
  interval?: number;

  /**
   * Number of occurrences
   */
  count?: number;

  /**
   * End date of recurrence
   */
  until?: Date | string;

  /**
   * Days of the week (SU, MO, TU, WE, TH, FR, SA)
   */
  byday?: string[];

  /**
   * Months of the year (1-12)
   */
  bymonth?: number[];

  /**
   * Days of the month (1-31 or -31 to -1)
   */
  bymonthday?: number[];

  /**
   * Hours of the day (0-23)
   */
  byhour?: number[];

  /**
   * Minutes of the hour (0-59)
   */
  byminute?: number[];

  /**
   * Seconds of the minute (0-59)
   */
  bysecond?: number[];

  /**
   * Week start day (SU, MO, TU, WE, TH, FR, SA)
   */
  wkst?: string;

  /**
   * Position in the set of occurrences (e.g., 1 for first, -1 for last)
   */
  bysetpos?: number[];
}

/**
 * Options for generating occurrences
 */
export interface OccurrenceOptions {
  /**
   * Maximum number of occurrences to generate
   */
  count?: number;

  /**
   * End date for occurrences
   */
  until?: Date;

  /**
   * Time zone for occurrence calculations
   */
  timeZone?: string;

  /**
   * Dates to exclude from the pattern
   */
  exdates?: Date[] | string[];

  /**
   * Whether to include excluded dates in the result
   */
  includeExdates?: boolean;
}

/**
 * Format for date/time formatting
 */
export interface DateTimeFormatOptions {
  /**
   * Format string (follows date-fns format)
   */
  format?: string;

  /**
   * Whether to include timezone information
   */
  includeTimeZone?: boolean;

  /**
   * Whether to use 24-hour time
   */
  use24HourTime?: boolean;
}