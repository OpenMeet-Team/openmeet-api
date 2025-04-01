import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { RecurrenceService } from '../recurrence.service';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { Trace } from '../../utils/trace.decorator';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { parseISO } from 'date-fns';

/**
 * Service for managing event occurrences in a recurring event series
 * Uses tenant-aware context from the request scope
 */
@Injectable({ scope: Scope.REQUEST })
export class EventOccurrenceService {
  private readonly logger = new Logger(EventOccurrenceService.name);

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly recurrenceService: RecurrenceService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
  ) {}

  /**
   * Generate occurrences for a recurring event within a specified date range
   * Uses the tenant context from the request
   * @param eventSlug - The slug of the recurring event
   * @param startDate - Start date of the range (optional)
   * @param endDate - End date of the range (optional)
   * @param count - Maximum number of occurrences to return (optional)
   * @param includeExcluded - Whether to include excluded dates (optional)
   * @returns Array of occurrence dates
   */
  @Trace('event-occurrence.getOccurrences')
  async getOccurrences(
    eventSlug: string,
    startDate?: string,
    endDate?: string,
    count?: number,
    includeExcluded = false,
  ): Promise<Date[]> {
    this.logger.debug(
      `[getOccurrences] Getting occurrences for event ${eventSlug} in tenant ${this.request.tenantId}`,
    );

    // Get the event using tenant-aware query service
    const event = await this.eventQueryService.findEventBySlug(eventSlug);

    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    if (!event.isRecurring || !event.recurrenceRule) {
      throw new BadRequestException('Event is not recurring');
    }

    // Parse dates if provided
    const start = startDate ? parseISO(startDate) : undefined;
    const end = endDate ? parseISO(endDate) : undefined;

    // Generate occurrences
    return this.recurrenceService.generateOccurrences(
      event.startDate,
      event.recurrenceRule as RecurrenceRule,
      {
        timeZone: event.timeZone,
        until: end,
        count,
        exdates: event.recurrenceExceptions,
        includeExdates: includeExcluded,
      },
    );
  }

  /**
   * Add an exclusion date to a recurring event
   * Uses the tenant context from the request
   * @param eventSlug - The slug of the recurring event
   * @param exclusionDate - The date to exclude (ISO string)
   * @param userId - The ID of the user making the change
   */
  @Trace('event-occurrence.addExclusionDate')
  async addExclusionDate(
    eventSlug: string,
    exclusionDate: string,
    userId: number,
  ): Promise<void> {
    this.logger.debug(
      `[addExclusionDate] Adding exclusion date ${exclusionDate} to event ${eventSlug} by user ${userId} in tenant ${this.request.tenantId}`,
    );

    // Get the event using tenant-aware query service
    const event = await this.eventQueryService.findEventBySlug(eventSlug);

    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    if (!event.isRecurring || !event.recurrenceRule) {
      throw new BadRequestException('Event is not recurring');
    }

    // Validate the exclusion date is in the recurrence pattern
    if (
      !this.recurrenceService.isDateInRecurrencePattern(
        exclusionDate,
        event.startDate.toISOString(),
        event.recurrenceRule as RecurrenceRule,
        event.timeZone,
        event.recurrenceExceptions, // Pass existing exceptions to ignore already excluded dates
      )
    ) {
      throw new BadRequestException(
        'Exclusion date is not in the recurrence pattern',
      );
    }

    // Add the exclusion date to the recurrenceExceptions array
    const recurrenceExceptions = event.recurrenceExceptions || [];
    recurrenceExceptions.push(exclusionDate);

    // Update the event using tenant-aware management service
    await this.eventManagementService.update(
      eventSlug,
      { recurrenceExceptions },
      userId,
    );
  }

  /**
   * Remove an exclusion date from a recurring event
   * Uses the tenant context from the request
   * @param eventSlug - The slug of the recurring event
   * @param inclusionDate - The date to include (ISO string)
   * @param userId - The ID of the user making the change
   */
  @Trace('event-occurrence.removeExclusionDate')
  async removeExclusionDate(
    eventSlug: string,
    inclusionDate: string,
    userId: number,
  ): Promise<void> {
    this.logger.debug(
      `[removeExclusionDate] Removing exclusion date ${inclusionDate} from event ${eventSlug} by user ${userId} in tenant ${this.request.tenantId}`,
    );

    // Get the event using tenant-aware query service
    const event = await this.eventQueryService.findEventBySlug(eventSlug);

    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    if (!event.isRecurring || !event.recurrenceRule) {
      throw new BadRequestException('Event is not recurring');
    }

    // Check if the date is in the exceptions list
    const recurrenceExceptions = event.recurrenceExceptions || [];
    const updatedExceptions = recurrenceExceptions.filter(
      (date) => date !== inclusionDate,
    );

    if (recurrenceExceptions.length === updatedExceptions.length) {
      throw new BadRequestException('Date is not in the exclusions list');
    }

    // Update the event using tenant-aware management service
    await this.eventManagementService.update(
      eventSlug,
      { recurrenceExceptions: updatedExceptions },
      userId,
    );
  }

  /**
   * Get expanded event objects for all occurrences in a date range
   * Each occurrence will have all properties from the parent event,
   * with the startDate and endDate adjusted for the specific occurrence
   * Uses the tenant context from the request
   * @param eventSlug - The slug of the recurring event
   * @param startDate - Start date of the range (optional)
   * @param endDate - End date of the range (optional)
   * @param count - Maximum number of occurrences to return (optional)
   * @returns Array of event objects representing each occurrence
   */
  @Trace('event-occurrence.getExpandedEventOccurrences')
  async getExpandedEventOccurrences(
    eventSlug: string,
    startDate?: string,
    endDate?: string,
    count?: number,
  ): Promise<EventEntity[]> {
    this.logger.debug(
      `[getExpandedEventOccurrences] Getting expanded occurrences for event ${eventSlug} in tenant ${this.request.tenantId}`,
    );

    // Get the event using tenant-aware query service
    const event = await this.eventQueryService.findEventBySlug(eventSlug);

    if (!event) {
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    if (!event.isRecurring || !event.recurrenceRule) {
      return [event];
    }

    // Generate the occurrence dates
    const occurrences = this.recurrenceService.generateOccurrences(
      event.startDate,
      event.recurrenceRule as RecurrenceRule,
      {
        timeZone: event.timeZone,
        until: endDate ? parseISO(endDate) : undefined,
        count,
        exdates: event.recurrenceExceptions,
      },
    );

    // Filter by start date if provided
    const filteredOccurrences = startDate
      ? occurrences.filter((date) => date >= parseISO(startDate))
      : occurrences;

    // Create event objects for each occurrence
    return filteredOccurrences.map((occurrenceDate) => {
      // Calculate duration in milliseconds
      const duration = event.endDate
        ? event.endDate.getTime() - event.startDate.getTime()
        : 0;

      // Create a shallow copy of the event
      const occurrence = { ...event } as EventEntity;

      // Set the occurrence date
      occurrence.startDate = new Date(occurrenceDate);

      // Set the end date if the original event had one
      if (event.endDate) {
        occurrence.endDate = new Date(occurrenceDate.getTime() + duration);
      }

      return occurrence;
    });
  }
}
