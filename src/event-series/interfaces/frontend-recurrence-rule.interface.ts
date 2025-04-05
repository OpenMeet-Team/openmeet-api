/**
 * @interface FrontendRecurrenceRule
 * @description Defines the structure for recurrence rules specifically designed for frontend interaction.
 * This might simplify or adapt the full backend RecurrenceRule for easier handling in UI components.
 */
export interface FrontendRecurrenceRule {
  // Basic frequency (DAILY, WEEKLY, MONTHLY, YEARLY)
  // frequency: RecurrenceFrequency;

  // Interval between occurrences (e.g., every 2 weeks)
  interval?: number;

  // Limit the recurrence (optional)
  count?: number; // Number of occurrences
  until?: string; // End date string (e.g., "YYYY-MM-DD")

  // Day specification (relevant for WEEKLY, MONTHLY, YEARLY)
  byDay?: string[]; // Array of weekday abbreviations (e.g., ['MO', 'WE', 'FR'])

  // Month day specification (relevant for MONTHLY, YEARLY)
  byMonthDay?: number[]; // Array of days of the month (e.g., [1, 15])

  // Month specification (relevant for YEARLY)
  byMonth?: number[]; // Array of months (1-12)

  // Position within the month/year (relevant for MONTHLY, YEARLY)
  // e.g., -1 for the last, 1 for the first
  bySetPos?: number[];

  // Start of the week (default is Monday)
  weekStart?: string; // Weekday abbreviation (e.g., 'SU')
}
