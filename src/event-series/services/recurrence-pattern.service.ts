import { Injectable, Logger } from '@nestjs/common';
import { RRule, Frequency, Options } from 'rrule';
import {
  RecurrenceFrequency,
  RecurrenceRule,
} from '../interfaces/recurrence.interface';
import { FrontendRecurrenceRule } from '../interfaces/frontend-recurrence-rule.interface';
import { TimezoneUtils } from '../../common/utils/timezone.utils';

interface RecurrenceOptions {
  count?: number;
  until?: string;
  excludeDates?: string[];
  timeZone?: string;
  includeExcluded?: boolean;
  exdates?: string[]; // Alias for excludeDates for backward compatibility
}

@Injectable()
export class RecurrencePatternService {
  private readonly logger = new Logger(RecurrencePatternService.name);

  /**
   * Generates occurrences for a recurrence pattern.
   * @param startDate The start date of the pattern
   * @param rule The recurrence rule
   * @param options Options for generating occurrences
   * @returns An array of occurrence dates
   */
  generateOccurrences(
    startDate: Date,
    rule: RecurrenceRule,
    options: RecurrenceOptions = {},
  ): string[] {
    const { count = 100, until, excludeDates = [], timeZone = 'UTC' } = options;
    const startISO = startDate.toISOString();

    const localStartDate =
      timeZone === 'UTC'
        ? startDate
        : TimezoneUtils.parseInTimezone(startISO, timeZone);

    // Get the local start time components to maintain in recurrences
    const localHour = localStartDate.getHours();
    const localMinute = localStartDate.getMinutes();
    const localSecond = localStartDate.getSeconds();

    const rruleOptions: Partial<Options> = {
      freq: this.mapFrequency(rule.frequency),
      interval: rule.interval || 1,
      dtstart: TimezoneUtils.parseInTimezone(startISO, timeZone),
      until: until ? TimezoneUtils.parseInTimezone(until, timeZone) : null,
      count: until ? null : count,
      byweekday: rule.byweekday ? this.mapByWeekDay(rule.byweekday) : null,
      bymonthday: rule.bymonthday || null,
      wkst: 0, // Default to Monday
      tzid: timeZone,
      bysetpos: null,
      bymonth: null,
      byyearday: null,
      byweekno: null,
      byhour: null,
      byminute: null,
      bysecond: null,
      byeaster: null,
    };

    const rrule = new RRule(rruleOptions);
    let occurrences = rrule.all();

    // Filter out excluded dates if any
    if (excludeDates.length > 0) {
      const excludeDateObjects = excludeDates.map((date) =>
        TimezoneUtils.parseInTimezone(date, timeZone),
      );
      occurrences = occurrences.filter(
        (occurrence) =>
          !excludeDateObjects.some((excludeDate) =>
            this.isSameDay(occurrence, excludeDate, timeZone),
          ),
      );
    }

    // Adjust each occurrence to maintain the same local time (accounting for DST)
    return occurrences.map((occurrence) => {
      // Create new date to preserve original occurrence date
      const date = new Date(occurrence);

      // Set to the same local time components as the start date
      date.setHours(localHour, localMinute, localSecond, 0);

      // Convert back to UTC for storage
      if (timeZone !== 'UTC') {
        // Create a date string in the target timezone
        const dateString = TimezoneUtils.formatInTimezone(date, timeZone);
        // Parse it back to get the proper UTC time
        return new Date(dateString).toISOString();
      }

      return date.toISOString();
    });
  }

  /**
   * Determines if a date is part of a recurrence pattern.
   * @param date The date to check
   * @param startDate The start date of the pattern
   * @param rule The recurrence rule
   * @param options Options for checking the date
   * @returns Whether the date is part of the pattern
   */
  isDateInRecurrencePattern(
    date: Date,
    startDate: Date,
    rule: RecurrenceRule,
    options: RecurrenceOptions = {},
  ): boolean {
    // Get target date in UTC
    const targetDate = new Date(date);
    // Get occurrences until the target date
    const until = targetDate.toISOString();

    // Generate occurrences up to the target date
    const occurrences = this.generateOccurrences(startDate, rule, {
      ...options,
      until,
    });

    // Check if the target date exists in occurrences
    return occurrences.some((occurrence) => {
      const occurrenceDate = new Date(occurrence);
      if (options.timeZone && options.timeZone !== 'UTC') {
        // For non-UTC timezones, compare only the date components
        return this.isSameDay(occurrenceDate, targetDate, options.timeZone);
      } else {
        // For UTC, compare both date and time components
        return occurrenceDate.getTime() === targetDate.getTime();
      }
    });
  }

  /**
   * Maps a frontend recurrence rule to a backend recurrence rule.
   * @param frontendRule The frontend recurrence rule
   * @returns The backend recurrence rule
   */
  mapFrontendToBackendRule(
    frontendRule: FrontendRecurrenceRule,
  ): RecurrenceRule {
    // Assuming FrontendRecurrenceRule no longer has 'freq', we need a way to get frequency.
    // If it's expected to be passed separately or derived, adjust accordingly.
    // For now, let's default or throw an error if frequency is essential.
    // const frequency = frontendRule.frequency; // Assuming frequency might exist now?
    // if (!frequency) {
    //   throw new Error('Frequency is required in FrontendRecurrenceRule');
    // }

    return {
      // frequency: this.mapFrontendFrequency(frequency), // Use the variable above
      frequency: RecurrenceFrequency.DAILY, // Placeholder: Default or handle missing freq
      interval: frontendRule.interval,
      byweekday: frontendRule.byDay, // Use byDay instead of byweekday
      bymonthday: frontendRule.byMonthDay, // Use byMonthDay instead of bymonthday
    };
  }

  /**
   * Maps a frontend frequency to a backend frequency.
   * @param frequency The frontend frequency
   * @returns The backend frequency
   */
  private mapFrontendFrequency(frequency: string): RecurrenceFrequency {
    // Check if the frequency is already a valid RecurrenceFrequency
    if (
      Object.values(RecurrenceFrequency).includes(
        frequency as RecurrenceFrequency,
      )
    ) {
      return frequency as RecurrenceFrequency;
    }

    // Map RRule frequency to RecurrenceFrequency
    switch (frequency) {
      case 'DAILY':
        return RecurrenceFrequency.DAILY;
      case 'WEEKLY':
        return RecurrenceFrequency.WEEKLY;
      case 'MONTHLY':
        return RecurrenceFrequency.MONTHLY;
      default:
        return RecurrenceFrequency.DAILY;
    }
  }

  /**
   * Maps a backend frequency to an RRule frequency.
   * @param frequency The backend frequency
   * @returns The RRule frequency
   */
  private mapFrequency(frequency: RecurrenceFrequency | string): Frequency {
    switch (frequency) {
      case RecurrenceFrequency.DAILY:
        return Frequency.DAILY;
      case RecurrenceFrequency.WEEKLY:
        return Frequency.WEEKLY;
      case RecurrenceFrequency.MONTHLY:
        return Frequency.MONTHLY;
      default:
        return Frequency.DAILY;
    }
  }

  /**
   * Maps a backend byWeekDay to an RRule byweekday.
   * @param byWeekDay The backend byWeekDay
   * @returns The RRule byweekday
   */
  private mapByWeekDay(byweekday: string[]): number[] {
    // Map day strings to RRule day numbers
    const dayMap = {
      MO: 0,
      TU: 1,
      WE: 2,
      TH: 3,
      FR: 4,
      SA: 5,
      SU: 6,
    };

    return byweekday.map((day) => dayMap[day] || 0);
  }

  /**
   * Determines if two dates represent the same day.
   * @param date1 The first date
   * @param date2 The second date
   * @param timeZone The timezone to use for comparison
   * @returns Whether the dates represent the same day
   */
  isSameDay(date1: Date, date2: Date, timeZone = 'UTC'): boolean {
    // If no timezone specified or UTC, compare in UTC
    if (!timeZone || timeZone === 'UTC') {
      return (
        date1.getUTCFullYear() === date2.getUTCFullYear() &&
        date1.getUTCMonth() === date2.getUTCMonth() &&
        date1.getUTCDate() === date2.getUTCDate()
      );
    }

    // Otherwise, compare in the specified timezone
    const date1InTZ = TimezoneUtils.parseInTimezone(
      date1.toISOString(),
      timeZone,
    );
    const date2InTZ = TimezoneUtils.parseInTimezone(
      date2.toISOString(),
      timeZone,
    );

    return (
      date1InTZ.getFullYear() === date2InTZ.getFullYear() &&
      date1InTZ.getMonth() === date2InTZ.getMonth() &&
      date1InTZ.getDate() === date2InTZ.getDate()
    );
  }
}
