import { Injectable, Logger } from '@nestjs/common';
import { RRule, Frequency, Options } from 'rrule';
import {
  RecurrenceFrequency,
  RecurrenceRule,
} from '../interfaces/recurrence.interface';
import { FrontendRecurrenceRule } from '../interfaces/frontend-recurrence-rule.interface';
import { TimezoneUtils } from '../../common/utils/timezone.utils';
import { toDate, formatInTimeZone } from 'date-fns-tz';
import { addYears } from 'date-fns';

interface RecurrenceOptions {
  count?: number;
  until?: string;
  startAfterDate?: Date;
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
   * @param startDate The start date of the pattern (used as dtstart in rrule)
   * @param rule The recurrence rule
   * @param options Options for generating occurrences, including startAfterDate
   * @returns An array of occurrence dates as ISO strings
   */
  generateOccurrences(
    startDate: Date,
    rule: RecurrenceRule,
    options: RecurrenceOptions = {},
  ): string[] {
    const {
      count = 100,
      until,
      startAfterDate,
      excludeDates = [],
      timeZone = 'UTC',
    } = options;

    // Ensure startDate is a valid Date object
    const originalUtcStartDate =
      startDate instanceof Date ? startDate : new Date();

    // TIMEZONE HANDLING FIX:
    // Instead of preserving the UTC time (which results in different local times across DST transitions),
    // we want to preserve the local time in the target timezone.

    // Get the target local time that we want to maintain
    const localTimeStr = formatInTimeZone(
      originalUtcStartDate,
      timeZone,
      'HH:mm:ss',
    );

    // Get the local date part
    const localDateStr = formatInTimeZone(
      originalUtcStartDate,
      timeZone,
      'yyyy-MM-dd',
    );

    // Construct the full local datetime string using the components
    const targetLocalDateTime = `${localDateStr} ${localTimeStr}`;

    // Convert the target local time back to UTC
    const dtstartDateObject = toDate(targetLocalDateTime, { timeZone });

    this.logger.debug('[generateOccurrences] Timezone conversion details', {
      originalUTC: originalUtcStartDate.toISOString(),
      originalLocalTime: formatInTimeZone(
        originalUtcStartDate,
        timeZone,
        'HH:mm:ss',
      ),
      targetLocalTime: targetLocalDateTime,
      correctedUTC: dtstartDateObject.toISOString(),
      verifiedLocalTime: formatInTimeZone(
        dtstartDateObject,
        timeZone,
        'HH:mm:ss',
      ),
      timeZone,
    });

    const rruleOptions: Partial<Options> = {
      freq: this.mapFrequency(rule.frequency),
      interval: rule.interval || 1,
      dtstart: dtstartDateObject,
      until: rule.until
        ? toDate(rule.until, { timeZone })
        : until
          ? toDate(until, { timeZone })
          : null,
      byweekday: rule.byweekday ? this.mapByWeekDay(rule.byweekday) : null,
      bymonthday: rule.bymonthday || null,
      bymonth: rule.bymonth || null,
      wkst: 0,
      tzid: timeZone, // RRule's timezone handling for DST
    };

    const rrule = new RRule(rruleOptions);

    // Determine the date range for generation
    const effectiveStartDate =
      startAfterDate instanceof Date ? startAfterDate : dtstartDateObject;
    const effectiveEndDate =
      rruleOptions.until instanceof Date
        ? rruleOptions.until
        : addYears(effectiveStartDate, 10);

    this.logger.debug('[generateOccurrences] Generating between', {
      start: effectiveStartDate.toISOString(),
      end: effectiveEndDate.toISOString(),
      rule: rrule.toString(),
    });

    let occurrences = rrule.between(
      effectiveStartDate,
      effectiveEndDate,
      true, // Inclusive
    );

    this.logger.debug('[generateOccurrences] Occurrences after between', {
      count: occurrences.length,
    });

    occurrences = occurrences.slice(0, count);

    this.logger.debug('[generateOccurrences] Occurrences after count slice', {
      count: occurrences.length,
    });

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
      this.logger.debug('[generateOccurrences] Occurrences after exclusion', {
        count: occurrences.length,
      });
    }

    // Verify that all occurrences have consistent local time in the target timezone
    if (occurrences.length > 0 && timeZone !== 'UTC') {
      const localTimes = occurrences.map((occ) =>
        formatInTimeZone(occ, timeZone, 'HH:mm'),
      );

      const firstLocalTime = localTimes[0];
      const allSameTime = localTimes.every((time) => time === firstLocalTime);

      this.logger.debug('[generateOccurrences] Local time consistency check', {
        allSameTime,
        firstLocalTime,
        sampleLocalTimes: localTimes.slice(0, 3),
      });

      if (!allSameTime) {
        this.logger.warn(
          '[generateOccurrences] Inconsistent local times detected across occurrences',
          {
            timeZone,
            localTimes: localTimes.slice(0, 5),
          },
        );
      }

      // Always ensure consistent local times by applying the expected time to all occurrences
      // This ensures that regardless of DST transitions, the local time remains constant
      const expectedLocalTime = localTimeStr.substring(0, 8); // HH:mm:ss

      // Fix the occurrences by ensuring they all have the correct local time
      const fixedOccurrences = occurrences.map((occ) => {
        // Get the date part in target timezone
        const dateStr = formatInTimeZone(occ, timeZone, 'yyyy-MM-dd');
        // Combine with the target time
        const targetDateTime = `${dateStr} ${expectedLocalTime}`;
        // Convert back to UTC
        return toDate(targetDateTime, { timeZone });
      });

      // Replace the occurrences with the fixed ones
      occurrences = fixedOccurrences;

      // Log for debugging
      this.logger.debug(
        '[generateOccurrences] Ensured consistent local times',
        {
          timeZone,
          expectedLocalTime,
          sampleTimes: occurrences.slice(0, 3).map((occ) => ({
            utc: occ.toISOString(),
            local: formatInTimeZone(occ, timeZone, 'HH:mm'),
          })),
        },
      );
    }

    return occurrences.map((occurrence) => occurrence.toISOString());
  }

  /**
   * Determines if a date is part of a recurrence pattern.
   * @param date The date to check
   * @param startDate The start date of the pattern
   * @param rule The recurrence rule
   * @param options Options for checking the date
   * @param anchorDate Optional anchor date for generation
   * @returns Whether the date is part of the pattern
   */
  isDateInRecurrencePattern(
    date: string,
    startDate: Date,
    rule: RecurrenceRule,
    options: RecurrenceOptions = {},
    anchorDate?: Date,
  ): boolean {
    const effectiveTimeZone = options.timeZone || 'UTC';

    // 1. Calculate targetDate: Use toDate to interpret the start-of-day string in the effective timezone
    const targetDateTimeString = `${date}T00:00:00`; // e.g., "2025-04-06T00:00:00"
    const targetDate = toDate(targetDateTimeString, {
      timeZone: effectiveTimeZone,
    });

    // 2. Calculate generationStartDate: Use toDate for the original start date's start-of-day in the effective timezone
    const originalStartDate = anchorDate || startDate;
    const startDateString = formatInTimeZone(
      originalStartDate,
      effectiveTimeZone,
      'yyyy-MM-dd',
    );
    const generationStartDateTimeString = `${startDateString}T00:00:00`;
    const generationStartDate = toDate(generationStartDateTimeString, {
      timeZone: effectiveTimeZone, // Manually apply formatting
    });

    this.logger.debug(
      `[isDateInRecurrencePattern Debug] Checking date: ${targetDate.toISOString()} (${date}) ` +
        `against original start: ${originalStartDate.toISOString()}, using generation start: ${generationStartDate.toISOString()} with rule: ${JSON.stringify(
          rule,
        )} ` +
        `and options: ${JSON.stringify(options)}, timezone: ${effectiveTimeZone}`,
    );

    // 3. Generate occurrences using the precise generationStartDate
    const checkCount = rule.count || 100;
    const occurrences = this.generateOccurrences(generationStartDate, rule, {
      ...options,
      count: checkCount,
      timeZone: effectiveTimeZone,
    });

    this.logger.debug(
      `[isDateInRecurrencePattern Debug] Generating occurrences: ${JSON.stringify(
        occurrences,
      )}`,
    );

    // 4. Check if targetDate exists in occurrences using isSameDay
    const result = occurrences.some((occurrenceISOString) => {
      const occurrenceDate = new Date(occurrenceISOString);
      return this.isSameDay(occurrenceDate, targetDate, effectiveTimeZone);
    });

    this.logger.debug(
      `[isDateInRecurrencePattern Debug] Result for ${targetDate.toISOString()} (${date}): ${result}`,
    );
    return result;
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
    } else {
      // Format both dates as YYYY-MM-DD in the target timezone and compare
      const formatString = 'yyyy-MM-dd';
      const date1Formatted = formatInTimeZone(date1, timeZone, formatString);
      const date2Formatted = formatInTimeZone(date2, timeZone, formatString);
      return date1Formatted === date2Formatted;
    }
  }
}
