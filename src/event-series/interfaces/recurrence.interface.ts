/**
 * Represents the recurrence rule for an event
 */
export interface RecurrenceRule {
  frequency: string; // 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'
  interval?: number; // e.g., every 2 weeks
  count?: number; // number of occurrences
  until?: Date | string; // end date
  byweekday?: string[]; // e.g., ['MO', 'WE', 'FR']
  bymonthday?: number[]; // e.g., [1, 15] for 1st and 15th of month
  bymonth?: number[]; // e.g., [1, 6] for January and June
}

/**
 * Options for generating occurrences
 */
export interface OccurrenceOptions {
  count?: number;
  until?: Date | string;
  exdates?: Array<Date | string>;
  timeZone?: string;
  includeExcluded?: boolean;
}

/**
 * Options for formatting dates in a timezone
 */
export interface DateFormatOptions {
  format?: string;
}
