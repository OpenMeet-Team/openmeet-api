/**
 * Enum for recurrence frequency values
 */
export enum RecurrenceFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/**
 * Represents the recurrence rule for an event series
 * Following RFC 5545 standards for iCalendar
 */
export interface RecurrenceRule {
  /** The frequency of recurrence (DAILY, WEEKLY, MONTHLY, YEARLY) */
  frequency: RecurrenceFrequency | string;
  /** How often the event repeats (e.g., every 2 weeks) */
  interval?: number;
  /** Number of occurrences in the series */
  count?: number;
  /** End date for the recurrence */
  until?: Date | string;
  /** Days of the week ('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU') */
  byweekday?: string[];
  /** Days of the month (1-31 or -31 to -1 for counting from the end) */
  bymonthday?: number[];
  /** Months of the year (1-12) */
  bymonth?: number[];
  /** Positions within a month/year (e.g., 1 for first, 2 for second, -1 for last) */
  bysetpos?: number[];
}

/**
 * Options for generating occurrences
 */
export interface OccurrenceOptions {
  /** Maximum number of occurrences to generate */
  count?: number;
  /** Date until which to generate occurrences */
  until?: Date | string;
  /** Exception dates excluded from the pattern */
  exdates?: Array<Date | string>;
  /** Timezone identifier (e.g., "America/New_York") */
  timeZone?: string;
  /** Whether to include excluded dates in the result */
  includeExcluded?: boolean;
}

/**
 * Options for formatting dates in a timezone
 */
export interface DateFormatOptions {
  /** Date format pattern */
  format?: string;
}
