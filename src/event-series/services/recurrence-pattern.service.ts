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
  private readonly MAX_OCCURRENCES = 2000; // Safety limit to prevent excessive generation

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
      count = 10, // Changed from 100 to 10 to prevent excessive occurrence generation
      until,
      startAfterDate,
      excludeDates = [],
      timeZone = 'UTC',
    } = options;

    // Apply safety limit to prevent excessive occurrence generation
    const safeCount = count ? Math.min(count, this.MAX_OCCURRENCES) : 10;

    // Ensure startDate is a valid Date object
    const originalUtcStartDate =
      startDate instanceof Date ? startDate : new Date();

    // WALL-CLOCK-TIME APPROACH:
    // To correctly handle timezones and DST:
    // 1. Extract local time components (e.g., "Wednesday 6:00 PM PST")
    // 2. Create a Date with those components as if they were UTC (wall clock)
    // 3. Let RRule generate occurrences in wall-clock-time (no tzid)
    // 4. Convert each generated occurrence back to real UTC for that timezone
    //
    // This approach avoids RRule's tzid interpretation issues and handles DST naturally.

    // Extract local time components
    const localTimeStr = formatInTimeZone(
      originalUtcStartDate,
      timeZone,
      'HH:mm:ss',
    );
    const localDateStr = formatInTimeZone(
      originalUtcStartDate,
      timeZone,
      'yyyy-MM-dd',
    );

    // Parse components for wall-clock Date creation
    const [year, month, day] = localDateStr.split('-').map(Number);
    const [hours, minutes, seconds] = localTimeStr.split(':').map(Number);

    // Create wall-clock Date (local components treated as UTC)
    // E.g., "Wed Oct 15, 6:00 PM PST" becomes "Wed Oct 15, 6:00 PM UTC" for RRule
    const wallClockDate = new Date(
      Date.UTC(year, month - 1, day, hours, minutes, seconds),
    );

    this.logger.debug('[generateOccurrences] Wall-clock-time setup', {
      originalUTC: originalUtcStartDate.toISOString(),
      localComponents: `${localDateStr} ${localTimeStr}`,
      wallClockUTC: wallClockDate.toISOString(),
      wallClockDay: formatInTimeZone(wallClockDate, 'UTC', 'EEEE'),
      timeZone,
    });

    // Check specifically for monthly patterns with bysetpos (nth weekday of month)
    if (rule.frequency === 'MONTHLY' && rule.byweekday && rule.bysetpos) {
      this.logger.log(
        '[generateOccurrences] Monthly bysetpos pattern detected:',
        {
          byweekday: rule.byweekday,
          bysetpos: rule.bysetpos,
          pattern: `${rule.bysetpos[0]}${rule.byweekday[0]} of each month`,
        },
      );
    }

    // Add special logging for weekly patterns to debug issues
    if (rule.frequency === 'WEEKLY') {
      this.logger.log('[WEEKLY_PATTERN_DEBUG] Weekly pattern details:', {
        byweekday: rule.byweekday,
        interval: rule.interval || 1,
        startDate: wallClockDate.toISOString(), // Using wall-clock date
        timeZone,
        until: rule.until,
        count: rule.count,
        // In JavaScript and RRule: 0 = Sunday, 1 = Monday, etc.
        weekStart: 0, // Using Sunday as the first day of the week (default in US calendars)
        fullRule: JSON.stringify(rule),
      });
    }

    // Map byweekday with logging
    let mappedByWeekday: number[] | null = null;
    if (rule.byweekday && rule.byweekday.length > 0) {
      // Store the result of mapByWeekDay which returns number[]
      const mappedResult = this.mapByWeekDay(rule.byweekday);

      // Only assign if we got a non-empty array
      if (mappedResult && mappedResult.length > 0) {
        mappedByWeekday = mappedResult;
      }

      this.logger.log('[generateOccurrences] Mapped byweekday:', {
        original: rule.byweekday,
        mapped: mappedByWeekday,
        frequency: rule.frequency,
      });
    }

    const rruleOptions: Partial<Options> = {
      freq: this.mapFrequency(rule.frequency),
      interval: rule.interval || 1,
      dtstart: wallClockDate, // Use wall-clock date
      until: rule.until
        ? toDate(rule.until, { timeZone })
        : until
          ? toDate(until, { timeZone })
          : null,
      byweekday: mappedByWeekday,
      bymonthday: rule.bymonthday || null,
      bymonth: rule.bymonth || null,
      bysetpos: rule.bysetpos || null, // Add bysetpos for monthly nth weekday patterns
      wkst: 0,
      // NO tzid - we handle timezone conversion manually for each occurrence
    };

    // Log if we're using bysetpos for debugging
    if (rule.bysetpos && rule.bysetpos.length > 0) {
      this.logger.debug(
        '[generateOccurrences] Using bysetpos for monthly day-of-week pattern',
        {
          bysetpos: rule.bysetpos,
          byweekday: rule.byweekday,
          frequency: rule.frequency,
        },
      );
    }

    // Log the final RRule options right before creating the rule
    this.logger.log('[RRULE_OPTIONS] Final options for RRule creation:', {
      freq: rruleOptions.freq,
      interval: rruleOptions.interval,
      byweekday: rruleOptions.byweekday,
      dtstart: rruleOptions.dtstart?.toISOString(),
      until: rruleOptions.until?.toISOString(),
      bymonthday: rruleOptions.bymonthday,
      bymonth: rruleOptions.bymonth,
      bysetpos: rruleOptions.bysetpos,
      wkst: rruleOptions.wkst,
      tzid: rruleOptions.tzid,
    });

    // Create the RRule instance
    const rrule = new RRule(rruleOptions);

    // Log the string representation to confirm it's created correctly
    this.logger.log('[RRULE_CREATED] RRule created:', {
      ruleString: rrule.toString(),
      options: rruleOptions,
    });

    // Determine the date range for generation
    const effectiveStartDate =
      startAfterDate instanceof Date ? startAfterDate : wallClockDate;
    // For yearly patterns, we need a longer window to see future occurrences
    const yearsToLookAhead = rule.frequency === 'YEARLY' ? 5 : 1;
    const effectiveEndDate =
      rruleOptions.until instanceof Date
        ? rruleOptions.until
        : addYears(effectiveStartDate, yearsToLookAhead);

    this.logger.debug('[generateOccurrences] Generating between', {
      start: effectiveStartDate.toISOString(),
      end: effectiveEndDate.toISOString(),
      rule: rrule.toString(),
    });

    // Generate occurrences with better control over the number
    let occurrences = rrule.between(
      effectiveStartDate,
      effectiveEndDate,
      true, // Inclusive
    );

    // Immediately limit to count to avoid excessive memory usage
    if (safeCount > 0) {
      occurrences = occurrences.slice(0, safeCount);
    }

    this.logger.debug('[generateOccurrences] Occurrences after between', {
      count: occurrences.length,
    });

    // Add detailed logging for weekly pattern results
    if (rule.frequency === 'WEEKLY') {
      try {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        this.logger.log('[WEEKLY_RESULT_DEBUG] Generated weekly occurrences:', {
          count: occurrences.length,
          // Include first 5 dates for debugging
          firstFiveDates: occurrences.slice(0, 5).map((date) => ({
            iso: date.toISOString(),
            local: date.toLocaleString(),
            day: date.getDay(), // 0 = Sunday, 1 = Monday, etc.
            dayName: dayNames[date.getDay()],
          })),
          // Show the pattern of days of week in the results
          dayOfWeekPattern: occurrences.slice(0, 10).map((date) => {
            const day = date.getDay();
            return {
              numeric: day,
              name: dayNames[day],
            };
          }),
          // How many of each day of week are in the result
          dayCounts: occurrences.slice(0, 20).reduce((acc, date) => {
            const day = date.getDay();
            const dayName = dayNames[day];
            acc[dayName] = (acc[dayName] || 0) + 1;
            return acc;
          }, {}),
          timeZone,
          inputRule: {
            frequency: rule.frequency,
            interval: rule.interval || 1,
            byweekday: rule.byweekday,
          },
        });
      } catch (error) {
        // Catch any errors in our logging code so it doesn't break the functionality
        this.logger.error(
          '[WEEKLY_RESULT_ERROR] Error in weekly debug logging:',
          error,
        );
      }
    }

    // We've already sliced to count above, so nothing to do here
    // This used to be where we limited to count, but moved it up for optimization

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

    // CONVERT WALL-CLOCK TIMES BACK TO REAL UTC:
    // RRule generated occurrences in wall-clock time (e.g., "Wed 6:00 PM UTC").
    // Now convert each to real UTC by interpreting as local time in the target timezone.
    // This naturally handles DST - each occurrence date gets its own offset.
    if (timeZone !== 'UTC' && occurrences.length > 0) {
      this.logger.debug(
        '[generateOccurrences] Converting wall-clock times to real UTC',
        {
          timeZone,
          beforeConversion: occurrences.slice(0, 3).map((occ) => ({
            wallClock: occ.toISOString(),
            day: formatInTimeZone(occ, 'UTC', 'EEEE'),
          })),
        },
      );

      occurrences = occurrences.map((wallClockOcc) => {
        // Extract wall-clock components (treating UTC as wall-clock)
        const wallYear = wallClockOcc.getUTCFullYear();
        const wallMonth = String(wallClockOcc.getUTCMonth() + 1).padStart(
          2,
          '0',
        );
        const wallDay = String(wallClockOcc.getUTCDate()).padStart(2, '0');
        const wallHour = String(wallClockOcc.getUTCHours()).padStart(2, '0');
        const wallMinute = String(wallClockOcc.getUTCMinutes()).padStart(
          2,
          '0',
        );
        const wallSecond = String(wallClockOcc.getUTCSeconds()).padStart(
          2,
          '0',
        );

        // Build local datetime string
        const localDateTimeString = `${wallYear}-${wallMonth}-${wallDay} ${wallHour}:${wallMinute}:${wallSecond}`;

        // Convert to real UTC for this timezone (handles DST automatically)
        return toDate(localDateTimeString, { timeZone });
      });

      this.logger.debug('[generateOccurrences] After conversion to real UTC', {
        timeZone,
        afterConversion: occurrences.slice(0, 3).map((occ) => ({
          realUTC: occ.toISOString(),
          localTime: formatInTimeZone(occ, timeZone, 'EEEE h:mm a z'),
        })),
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

    // Debug logging disabled to avoid invalid date errors in tests
    // this.logger.debug(
    //   `[isDateInRecurrencePattern Debug] Checking date: ${targetDate ? targetDate.toISOString() : 'Invalid Date'} (${date}) ` +
    //     `against original start: ${originalStartDate.toISOString()}, using generation start: ${generationStartDate ? generationStartDate.toISOString() : 'Invalid Date'} with rule: ${JSON.stringify(
    //       rule,
    //     )} ` +
    //     `options: ${JSON.stringify(options)}`,
    // );

    // 3. Generate occurrences using the precise generationStartDate
    const startDateTime = new Date(generationStartDate);
    const targetDateTime = new Date(targetDate);

    // First check if the date is in excluded dates
    if (options.excludeDates?.length) {
      const isExcluded = options.excludeDates.some((excludeDate) =>
        this.isSameDay(
          targetDate,
          TimezoneUtils.parseInTimezone(excludeDate, effectiveTimeZone),
          effectiveTimeZone,
        ),
      );
      if (isExcluded) {
        return false;
      }
    }

    // Then check if it's in the pattern
    // Generate at most 20 occurrences to limit processing time
    const occurrences = this.generateOccurrences(startDateTime, rule, {
      timeZone: effectiveTimeZone,
      count: 20, // Reduced from 365 to 20 to improve performance
    });

    // Check if target date is in the occurrences
    const result = occurrences.some((occurrenceISOString) => {
      const occurrenceDate = new Date(occurrenceISOString);
      return this.isSameDay(occurrenceDate, targetDateTime, effectiveTimeZone);
    });

    // Debug logging disabled to avoid invalid date errors in tests
    // this.logger.debug(
    //   `[isDateInRecurrencePattern Debug] Result for ${targetDate.toISOString()} (${date}): ${result}`,
    // );
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
      bysetpos: frontendRule.bySetPos, // Add bySetPos support for nth weekday patterns
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
      case 'YEARLY':
        return RecurrenceFrequency.YEARLY;
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
      case RecurrenceFrequency.YEARLY:
        return Frequency.YEARLY;
      default:
        return Frequency.DAILY;
    }
  }

  /**
   * Maps a backend byWeekDay to an RRule byweekday.
   * @param byWeekDay The backend byWeekDay
   * @returns The RRule byweekday or null if invalid
   */
  private mapByWeekDay(byweekday: string[]): number[] {
    if (!byweekday || !Array.isArray(byweekday)) {
      this.logger.error(
        `[WEEKDAY_MAPPING_ERROR] Invalid byweekday parameter: ${JSON.stringify(byweekday)}`,
      );
      return []; // Return empty array instead of null to maintain type compatibility
    }

    this.logger.log(
      `[WEEKDAY_MAPPING] Starting to map byweekday: ${JSON.stringify(byweekday)}`,
    );

    // Get the actual RRule weekday constants
    const getRRuleWeekday = (day: string): number => {
      if (!day) {
        this.logger.error(
          `[WEEKDAY_MAPPING_ERROR] Null or undefined day passed to getRRuleWeekday`,
        );
        return RRule.MO.weekday; // Default to Monday
      }

      // Handle cases where the day might have a position prefix like '-1MO'
      const match = day.match(/^(?:[+-]?\d+)?([A-Z]{2})$/);
      const dayCode = match ? match[1] : day;

      // Map to RRule's constants directly
      switch (dayCode) {
        case 'MO':
          return RRule.MO.weekday;
        case 'TU':
          return RRule.TU.weekday;
        case 'WE':
          return RRule.WE.weekday;
        case 'TH':
          return RRule.TH.weekday;
        case 'FR':
          return RRule.FR.weekday;
        case 'SA':
          return RRule.SA.weekday;
        case 'SU':
          return RRule.SU.weekday;
        default:
          this.logger.warn(
            `[WEEKDAY_MAPPING_ERROR] Unknown weekday code: ${day}, defaulting to Monday`,
          );
          return RRule.MO.weekday;
      }
    };

    try {
      const mappedResults = byweekday.map(getRRuleWeekday);

      // Log all the mappings together
      this.logger.log(`[WEEKDAY_MAPPING] Complete mapping results:`, {
        input: byweekday,
        output: mappedResults,
        rruleMOReference: RRule.MO.weekday, // Log the reference value for Monday
      });

      // Validate that we have at least one valid weekday for WEEKLY patterns
      if (mappedResults.length === 0) {
        this.logger.warn(
          `[WEEKDAY_MAPPING_WARNING] Empty result after mapping byweekday: ${JSON.stringify(byweekday)}`,
        );
      }

      return mappedResults;
    } catch (error) {
      this.logger.error(
        `[WEEKDAY_MAPPING_EXCEPTION] Error mapping byweekday: ${error.message}`,
        {
          input: JSON.stringify(byweekday),
          stack: error.stack,
        },
      );

      // Return Monday as fallback in case of error
      return [RRule.MO.weekday];
    }
  }

  /**
   * Determines if two dates represent the same day.
   * @param date1 The first date
   * @param date2 The second date
   * @param timeZone The timezone to use for comparison
   * @returns Whether the dates represent the same day
   */
  isSameDay(date1: Date, date2: Date, timeZone = 'UTC'): boolean {
    // Add null checks
    if (!date1 || !date2 || isNaN(date1.getTime()) || isNaN(date2.getTime())) {
      return false;
    }

    try {
      const formatString = 'yyyy-MM-dd';
      const date1Formatted = formatInTimeZone(date1, timeZone, formatString);
      const date2Formatted = formatInTimeZone(date2, timeZone, formatString);
      return date1Formatted === date2Formatted;
    } catch (error) {
      this.logger.error(`Error comparing dates: ${error.message}`, {
        date1: date1 ? date1.toISOString() : 'Invalid Date',
        date2: date2 ? date2.toISOString() : 'Invalid Date',
        timeZone,
      });
      return false;
    }
  }
}
