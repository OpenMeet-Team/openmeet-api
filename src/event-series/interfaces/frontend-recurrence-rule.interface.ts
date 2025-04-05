import { RecurrenceFrequency } from './recurrence.interface';

/**
 * Represents a recurrence rule format used by frontend components
 */
export interface FrontendRecurrenceRule {
  /** The frequency of recurrence */
  freq: string;
  /** How often the event repeats */
  interval?: number;
  /** Number of occurrences */
  count?: number;
  /** End date for the recurrence */
  until?: string;
  /** Days of the week (MO, TU, WE, TH, FR, SA, SU) */
  byweekday?: string[];
  /** Days of the month (1-31) */
  bymonthday?: number[];
  /** Months of the year (1-12) */
  bymonth?: number[];
}
