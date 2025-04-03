import { Injectable, Logger } from '@nestjs/common';
import { RRule, RRuleSet } from 'rrule';
import { formatInTimeZone } from 'date-fns-tz';
import { parseISO } from 'date-fns';
import {
  RecurrenceRule,
  OccurrenceOptions,
  DateFormatOptions,
} from '../interfaces/recurrence.interface';

/**
 * Possible frequency values for recurrence rules
 */
export enum RecurrenceFrequency {
  Daily = 'DAILY',
  Weekly = 'WEEKLY',
  Monthly = 'MONTHLY',
  Yearly = 'YEARLY',
}

/**
 * Service for working with recurrence patterns
 * Migrated from RecurrenceService to eliminate the dependency
 */
@Injectable()
export class RecurrencePatternService {
  private readonly logger = new Logger(RecurrencePatternService.name);

  /**
   * Generate occurrence dates for a recurring event based on a recurrence rule
   */
  generateOccurrences(
    startDate: Date | string,
    recurrenceRule: RecurrenceRule,
    _options: OccurrenceOptions = {},
  ): Date[] {
    // Parse start date if it's a string
    const baseDate =
      typeof startDate === 'string' ? new Date(startDate) : startDate;

    // Default timezone to UTC if not specified
    const timeZone = _options.timeZone || 'UTC';

    try {
      // Build RRuleSet
      const rruleSet = new RRuleSet();

      // Create RRule from recurrence rule
      const rruleOptions = this.buildRRuleOptions(baseDate, recurrenceRule, {
        timeZone,
      });
      rruleSet.rrule(new RRule(rruleOptions));

      // Add excluded dates if specified
      if (_options.exdates && !_options.includeExcluded) {
        _options.exdates.forEach((exdate) => {
          const excludeDate =
            typeof exdate === 'string' ? new Date(exdate) : exdate;
          rruleSet.exdate(excludeDate);
        });
      }

      // Get all occurrences
      let occurrences: Date[];

      if (_options.count !== undefined) {
        // Get a specific number of occurrences
        occurrences = rruleSet.all((_, len) => len < _options.count!);
      } else if (_options.until) {
        // Get occurrences until a specific date
        const untilDate =
          typeof _options.until === 'string'
            ? new Date(_options.until)
            : _options.until;
        occurrences = rruleSet.between(baseDate, untilDate);
      } else {
        // Default to 10 occurrences if no count or until date specified
        occurrences = rruleSet.all((_, len) => len < 10);
      }

      return occurrences;
    } catch (error) {
      this.logger.error(
        `Error generating occurrences: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Build RRule options from recurrence rule
   */
  private buildRRuleOptions(
    baseDate: Date,
    recurrenceRule: RecurrenceRule,
    _options: OccurrenceOptions = {},
  ): any {
    // Convert frequency string to RRule frequency
    const frequency = this.mapFrequencyToRRule(recurrenceRule.frequency);

    // Extract options for the rule
    const ruleOptions: any = {
      freq: frequency,
      interval: recurrenceRule.interval || 1,
      dtstart: baseDate,
    };

    // Add count if specified
    if (recurrenceRule.count) {
      ruleOptions.count = recurrenceRule.count;
    }

    // Add until date if specified
    if (recurrenceRule.until) {
      const untilDate =
        typeof recurrenceRule.until === 'string'
          ? new Date(recurrenceRule.until)
          : recurrenceRule.until;
      ruleOptions.until = untilDate;
    }

    // Add byweekday if specified and frequency is weekly
    if (recurrenceRule.byweekday && frequency === RRule['WEEKLY']) {
      // Convert day names to RRule weekday constants
      ruleOptions.byweekday = recurrenceRule.byweekday.map((day) =>
        this.mapWeekdayToRRule(day),
      );
    }

    // Add bymonthday if specified and frequency is monthly
    if (recurrenceRule.bymonthday && frequency === RRule['MONTHLY']) {
      ruleOptions.bymonthday = recurrenceRule.bymonthday;
    }

    // Add bymonth if specified
    if (recurrenceRule.bymonth) {
      ruleOptions.bymonth = recurrenceRule.bymonth;
    }

    return ruleOptions;
  }

  /**
   * Check if a date is part of a recurrence pattern
   */
  isDateInRecurrencePattern(
    checkDate: Date | string,
    startDate: Date | string,
    recurrenceRule: RecurrenceRule,
    timeZone: string = 'UTC',
    exdates?: Array<string | Date>,
  ): boolean {
    try {
      // Parse dates if they're strings
      const baseDate =
        typeof startDate === 'string' ? new Date(startDate) : startDate;
      const targetDate =
        typeof checkDate === 'string' ? new Date(checkDate) : checkDate;

      // Build RRuleSet
      const rruleSet = new RRuleSet();

      // Create RRule from recurrence rule
      const rruleOptions = this.buildRRuleOptions(baseDate, recurrenceRule, {
        timeZone,
      });
      rruleSet.rrule(new RRule(rruleOptions));

      // Add excluded dates if specified
      if (exdates) {
        exdates.forEach((exdate) => {
          const excludeDate =
            typeof exdate === 'string' ? new Date(exdate) : exdate;
          rruleSet.exdate(excludeDate);
        });
      }

      // Check if the target date is in the recurrence pattern
      // Get all occurrences within a day of the target date
      const oneDayBefore = new Date(targetDate);
      oneDayBefore.setDate(oneDayBefore.getDate() - 1);

      const oneDayAfter = new Date(targetDate);
      oneDayAfter.setDate(oneDayAfter.getDate() + 1);

      const nearbyDates = rruleSet.between(oneDayBefore, oneDayAfter);

      // Check if any occurrence is on the same day as the target date
      return nearbyDates.some((date) =>
        this.isSameDay(date, targetDate, timeZone),
      );
    } catch (error) {
      this.logger.error(
        `Error checking date in recurrence pattern: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Build RRULE string from recurrence rule
   */
  buildRRuleString(recurrenceRule: RecurrenceRule): string {
    try {
      // Start with the frequency
      let rruleString = `FREQ=${recurrenceRule.frequency}`;

      // Add interval if specified
      if (recurrenceRule.interval && recurrenceRule.interval > 1) {
        rruleString += `;INTERVAL=${recurrenceRule.interval}`;
      }

      // Add count if specified
      if (recurrenceRule.count) {
        rruleString += `;COUNT=${recurrenceRule.count}`;
      }

      // Add until date if specified
      if (recurrenceRule.until) {
        const untilDate =
          typeof recurrenceRule.until === 'string'
            ? new Date(recurrenceRule.until)
            : recurrenceRule.until;
        // Format until date in UTC format required by iCalendar
        const untilStr = formatInTimeZone(
          untilDate,
          'UTC',
          'yyyyMMdd\\THHmmss\\Z',
        );
        rruleString += `;UNTIL=${untilStr}`;
      }

      // Add byweekday if specified
      if (recurrenceRule.byweekday && recurrenceRule.byweekday.length > 0) {
        rruleString += `;BYDAY=${recurrenceRule.byweekday.join(',')}`;
      }

      // Add bymonthday if specified
      if (recurrenceRule.bymonthday && recurrenceRule.bymonthday.length > 0) {
        rruleString += `;BYMONTHDAY=${recurrenceRule.bymonthday.join(',')}`;
      }

      // Add bymonth if specified
      if (recurrenceRule.bymonth && recurrenceRule.bymonth.length > 0) {
        rruleString += `;BYMONTH=${recurrenceRule.bymonth.join(',')}`;
      }

      return `RRULE:${rruleString}`;
    } catch (error) {
      this.logger.error(
        `Error building RRULE string: ${error.message}`,
        error.stack,
      );
      return '';
    }
  }

  /**
   * Format a date in a specific timezone
   */
  formatDateInTimeZone(
    date: Date | string,
    timeZone: string,
    options: DateFormatOptions = {},
  ): string {
    try {
      // Parse date if it's a string
      const dateObj = typeof date === 'string' ? parseISO(date) : date;

      // Default format is ISO
      const formatStr = options.format || "yyyy-MM-dd'T'HH:mm:ssXXX";

      // Format date in specified timezone
      return formatInTimeZone(dateObj, timeZone, formatStr);
    } catch (error) {
      this.logger.error(
        `Error formatting date in timezone: ${error.message}`,
        error.stack,
      );
      return date.toString();
    }
  }

  /**
   * Utility function to check if two dates represent the same day in a specific timezone
   */
  isSameDay(date1: Date, date2: Date, timeZone: string): boolean {
    // Converting dates to the same timezone before comparing
    const d1Str = this.formatDateInTimeZone(date1, timeZone, {
      format: 'yyyy-MM-dd',
    });
    const d2Str = this.formatDateInTimeZone(date2, timeZone, {
      format: 'yyyy-MM-dd',
    });
    return d1Str === d2Str;
  }

  /**
   * Map frequency string to RRule constant
   */
  private mapFrequencyToRRule(frequency: string): number {
    switch (frequency.toUpperCase()) {
      case 'DAILY':
        return RRule['DAILY'];
      case 'WEEKLY':
        return RRule['WEEKLY'];
      case 'MONTHLY':
        return RRule['MONTHLY'];
      case 'YEARLY':
        return RRule['YEARLY'];
      default:
        return RRule['WEEKLY']; // Default to weekly
    }
  }

  /**
   * Map weekday string to RRule constant
   */
  private mapWeekdayToRRule(day: string): number {
    const weekdays = {
      MO: RRule['MO'],
      TU: RRule['TU'],
      WE: RRule['WE'],
      TH: RRule['TH'],
      FR: RRule['FR'],
      SA: RRule['SA'],
      SU: RRule['SU'],
    };

    return weekdays[day.toUpperCase()] || RRule['MO'];
  }
}
