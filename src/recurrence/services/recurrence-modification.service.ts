import {
  Injectable,
  BadRequestException,
  Scope,
  Inject,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { RecurrenceService } from '../recurrence.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { Trace } from '../../utils/trace.decorator';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { parseISO, format, isDate } from 'date-fns';
import { UpdateEventDto } from '../../event/dto/update-event.dto';
import {
  CreateEventDto,
  RecurrenceRuleDto,
} from '../../event/dto/create-event.dto';

/**
 * Service for modifying recurring events, including "this and future occurrences" functionality
 * This service respects tenant boundaries by using the proper service layers
 */
@Injectable({ scope: Scope.REQUEST })
export class RecurrenceModificationService {
  private readonly logger = new Logger(RecurrenceModificationService.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly recurrenceService: RecurrenceService,
    private readonly eventManagementService: EventManagementService,
    private readonly eventQueryService: EventQueryService,
  ) {}

  /**
   * Split a recurrence series at a specified date
   * Modifies the original series to end before the specified date
   * Creates a new series starting from the specified date with modified properties
   */
  @Trace('recurrence.splitSeriesAt')
  async splitSeriesAt(
    eventSlug: string,
    splitDate: string,
    modifications: UpdateEventDto,
  ): Promise<EventEntity> {
    // 1. Fetch the event using the query service (respects tenant context)
    const event = await this.eventQueryService.findEventBySlug(eventSlug);

    // 2. Validate that the event is recurring
    if (!event.isRecurring) {
      throw new BadRequestException('Event is not recurring');
    }

    // 3. Validate the split date is in the recurring pattern
    if (
      !this.recurrenceService.isDateInRecurrencePattern(
        splitDate,
        event.startDate.toISOString(),
        event.recurrenceRule as RecurrenceRule,
        event.timeZone,
      )
    ) {
      throw new BadRequestException(
        'Split date is not in the recurrence pattern',
      );
    }

    // 4. Create a new event for future occurrences (using event management service)
    const newEvent = await this.createNewSeriesFrom(
      event,
      splitDate,
      modifications,
    );

    // 5. Modify the original event to end before the split date
    const originalRecurrenceRule = {
      ...event.recurrenceRule,
    } as RecurrenceRule;
    const untilDate = this.calculatePreviousOccurrence(
      splitDate,
      event.startDate.toISOString(),
      originalRecurrenceRule,
      event.timeZone,
    );

    // Convert to a RecurrenceRuleDto for the update operation using our helper method
    const updatedRuleDto = this.convertToRecurrenceRuleDto({
      ...originalRecurrenceRule,
      until: untilDate,
    });

    await this.eventManagementService.update(
      eventSlug,
      { recurrenceRule: updatedRuleDto },
      this.request.user?.id,
    );

    // 6. Return the newly created series
    return newEvent;
  }

  /**
   * Create a new series from the original, starting at the split date
   */
  @Trace('recurrence.createNewSeriesFrom')
  private async createNewSeriesFrom(
    originalEvent: EventEntity,
    startFromDate: string,
    modifications: UpdateEventDto,
  ): Promise<EventEntity> {
    // Adjust the recurrence rule for the new series
    const adjustedRule = this.adjustRecurrenceRule(
      originalEvent.recurrenceRule as RecurrenceRule,
      originalEvent.startDate.toISOString(),
      startFromDate,
    );

    // Convert RecurrenceRule to RecurrenceRuleDto
    const recurrenceRuleDto = this.convertToRecurrenceRuleDto(adjustedRule);

    // Extract categories from the original event if present
    const categories = originalEvent.categories?.map((c) => c.id) || [];

    // Prepare data for the new event, adhering to CreateEventDto structure
    // Using dynamic object to handle both defined fields in CreateEventDto and entity fields
    const newEventData: Record<string, any> = {
      name: originalEvent.name,
      description: originalEvent.description,
      startDate: originalEvent.startDate,
      endDate: originalEvent.endDate,
      type: originalEvent.type,
      location: originalEvent.location,
      locationOnline: originalEvent.locationOnline,
      maxAttendees: originalEvent.maxAttendees,
      categories: categories,
      lat: originalEvent.lat,
      lon: originalEvent.lon,
      timeZone: originalEvent.timeZone,

      // Mark as recurring since we're creating a recurrence series
      isRecurring: true,

      // Special fields for split point
      parentEventId: originalEvent.id,
      originalDate: new Date(startFromDate),
      recurrenceSplitPoint: true,

      // Add the recurrence rule
      recurrenceRule: recurrenceRuleDto,

      // Copy relevant properties
      requireApproval: originalEvent.requireApproval,
      requireGroupMembership: originalEvent.requireGroupMembership,
      approvalQuestion: originalEvent.approvalQuestion,
      allowWaitlist: originalEvent.allowWaitlist,

      // Apply user modifications (after base properties to ensure overrides)
      ...modifications,
    };

    // Use event management service to create the new event (respects tenant context)
    return this.eventManagementService.create(
      newEventData as CreateEventDto,
      this.request.user?.id,
    );
  }

  /**
   * Adjust the recurrence rule for the new series
   */
  private adjustRecurrenceRule(
    originalRule: RecurrenceRule,
    originalStartDate: string,
    newStartDate: string,
  ): RecurrenceRule {
    const newRule = { ...originalRule };

    // If the original had a count, we need to adjust it
    if (newRule.count) {
      const remainingOccurrences = this.countOccurrencesAfter(
        newStartDate,
        originalStartDate,
        originalRule,
      );

      if (remainingOccurrences > 0) {
        newRule.count = remainingOccurrences;
      } else {
        // If no occurrences remain, remove count to avoid empty series
        delete newRule.count;
      }
    }

    // Remove the until date if it exists, as the new series will have its own end date
    if (newRule.until) {
      delete newRule.until;
    }

    return newRule;
  }

  /**
   * Count occurrences after a given date
   */
  private countOccurrencesAfter(
    afterDate: string,
    startDate: string,
    recurrenceRule: RecurrenceRule,
  ): number {
    const allOccurrences = this.recurrenceService.generateOccurrences(
      startDate,
      recurrenceRule,
    );

    const afterDateObj = new Date(afterDate);

    return allOccurrences.filter((date) => date >= afterDateObj).length;
  }

  /**
   * Calculate the date of the last occurrence before the split date
   */
  private calculatePreviousOccurrence(
    splitDate: string,
    startDate: string,
    recurrenceRule: RecurrenceRule,
    timeZone?: string,
  ): string {
    const occurrences = this.recurrenceService.generateOccurrences(
      startDate,
      recurrenceRule,
      {
        timeZone,
        until: new Date(splitDate), // Convert string to Date for the OccurrenceOptions type
      },
    );

    // Get the last occurrence before the split date
    if (occurrences.length > 0) {
      const lastOccurrence = occurrences[occurrences.length - 1];
      // Return one day before to make it exclusive of the split date
      const previousDate = new Date(lastOccurrence.getTime() - 86400000);
      return previousDate.toISOString();
    }

    return startDate;
  }

  /**
   * Converts a RecurrenceRule interface object to a RecurrenceRuleDto class instance
   * This ensures proper typing for the EventManagementService API
   */
  private convertToRecurrenceRuleDto(rule: RecurrenceRule): RecurrenceRuleDto {
    const dto = new RecurrenceRuleDto();

    // Handle the freq field - ensure it's a string as required by RecurrenceRuleDto
    dto.freq = rule.freq.toString();

    // Copy optional fields if they exist
    if (rule.interval !== undefined) dto.interval = rule.interval;
    if (rule.count !== undefined) dto.count = rule.count;
    if (rule.byday !== undefined) dto.byday = rule.byday;
    if (rule.bymonth !== undefined) dto.bymonth = rule.bymonth;
    if (rule.bymonthday !== undefined) dto.bymonthday = rule.bymonthday;
    if (rule.wkst !== undefined) dto.wkst = rule.wkst;

    // Handle the until field, converting Date to string if needed
    if (rule.until !== undefined) {
      if (isDate(rule.until)) {
        // Format date as ISO string
        dto.until = (rule.until as Date).toISOString();
      } else {
        // Already a string
        dto.until = rule.until as string;
      }
    }

    return dto;
  }

  /**
   * Get the effective event for a specific date, considering all split points
   */
  @Trace('recurrence.getEffectiveEventForDate')
  async getEffectiveEventForDate(
    parentEventSlug: string,
    date: string,
  ): Promise<EventEntity> {
    // Get the original parent event
    const parentEvent =
      await this.eventQueryService.findEventBySlug(parentEventSlug);

    if (!parentEvent) {
      throw new BadRequestException('Parent event not found');
    }

    // Find all split points for this parent
    const splitPoints = await this.eventQueryService.findEventsByParentId(
      parentEvent.id,
    );

    // Filter to only include split points
    const splitPointEvents = splitPoints
      .filter((event) => event.recurrenceSplitPoint === true)
      .sort((a, b) => a.originalDate.getTime() - b.originalDate.getTime());

    // If no split points, return the parent
    if (splitPointEvents.length === 0) {
      // The EventQueryService.findEventBySlug already adds recurrence description
      return parentEvent;
    }

    // Find the split point that applies to this date
    const dateObj = new Date(date);
    for (let i = splitPointEvents.length - 1; i >= 0; i--) {
      const splitPoint = splitPointEvents[i];
      if (splitPoint.originalDate <= dateObj) {
        // The recurrence description will already be added by findEventsByParentId
        return splitPoint;
      }
    }

    // If no split point applies, return the parent
    return parentEvent;
  }
}
