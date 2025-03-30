/**
 * Default timezone to use when none is specified
 */
export const DEFAULT_TIMEZONE = 'UTC';

/**
 * Default number of occurrences to generate when limit is not specified
 */
export const DEFAULT_OCCURRENCE_COUNT = 50;

/**
 * Default window horizon for generating occurrences (in days)
 */
export const DEFAULT_OCCURRENCE_WINDOW_DAYS = 90;

/**
 * Maximum number of occurrences to generate
 */
export const MAX_OCCURRENCE_COUNT = 200;

/**
 * Day of week values used in recurrence rules
 */
export const WEEKDAYS = {
  SU: { name: 'Sunday', value: 'SU', index: 0 },
  MO: { name: 'Monday', value: 'MO', index: 1 },
  TU: { name: 'Tuesday', value: 'TU', index: 2 },
  WE: { name: 'Wednesday', value: 'WE', index: 3 },
  TH: { name: 'Thursday', value: 'TH', index: 4 },
  FR: { name: 'Friday', value: 'FR', index: 5 },
  SA: { name: 'Saturday', value: 'SA', index: 6 },
};

/**
 * Default date format for formatted dates
 */
export const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';

/**
 * Default date format for all-day events
 */
export const ALL_DAY_DATE_FORMAT = 'yyyy-MM-dd';

/**
 * Default format for displaying recurrence rules in human-readable form
 */
export const DEFAULT_RECURRENCE_TEXT = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  YEARLY: 'Yearly',
  INTERVAL: (interval: number, freq: string) => 
    interval > 1 ? `Every ${interval} ${freq.toLowerCase()}s` : freq,
  BYDAYS: (days: string[]) => 
    `on ${days.map(d => WEEKDAYS[d]?.name || d).join(', ')}`,
  UNTIL: (date: Date) => `until ${date.toLocaleDateString()}`,
  COUNT: (count: number) => `for ${count} occurrences`,
};