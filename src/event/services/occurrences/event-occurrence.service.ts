import { Injectable, Logger, Scope, Inject, forwardRef } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository, Between } from 'typeorm';
import { EventEntity } from '../../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../../tenant/tenant.service';
import { EventSeriesOccurrenceService } from '../../../event-series/services/event-series-occurrence.service';
import { RecurrencePatternService } from '../../../event-series/services/recurrence-pattern.service';
import { IEventOccurrenceService } from './event-occurrence.interface';
import { OccurrenceOptions } from '../../../event-series/interfaces/recurrence.interface';
import { isAfter, isBefore, isEqual } from 'date-fns';
import { Trace } from '../../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { EventStatus } from '../../../core/constants/constant';

@Injectable({ scope: Scope.REQUEST })
export class EventOccurrenceService implements IEventOccurrenceService {
  private readonly logger = new Logger(EventOccurrenceService.name);
  private readonly tracer = trace.getTracer('event-occurrence-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    @Inject(forwardRef(() => RecurrencePatternService))
    private readonly recurrencePatternService: RecurrencePatternService,
    @Inject(forwardRef(() => EventSeriesOccurrenceService))
    private readonly eventSeriesOccurrenceService: EventSeriesOccurrenceService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-occurrence.initializeRepository')
  async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  /**
   * Generate occurrence events for a recurring event
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences instead
   */
  @Trace('event-occurrence.generateOccurrences')
  async generateOccurrences(
    parentEvent: EventEntity,
    options: OccurrenceOptions = {},
  ): Promise<EventEntity[]> {
    try {
      await this.initializeRepository();

      if (!parentEvent.isRecurring) {
        this.logger.warn(
          `Cannot generate occurrences for non-recurring event ${parentEvent.id}`,
        );
        return [];
      }

      // If this is a new EventSeries-based event
      if (parentEvent.seriesId) {
        this.logger.log(
          `Using EventSeriesOccurrenceService for event with seriesId ${parentEvent.seriesId}`,
        );

        // Find the series for this event
        if (!parentEvent.series) {
          // Try to find the series from the series ID
          const series = await this.eventRepository.findOne({
            where: { id: parentEvent.seriesId },
            relations: ['series'],
          });

          if (!series || !series.series) {
            this.logger.warn(
              `Cannot find series for event with seriesId ${parentEvent.seriesId}`,
            );
            return [];
          }

          parentEvent.series = series.series;
        }

        // Use the EventSeriesOccurrenceService to get upcoming occurrences
        const seriesSlug = parentEvent.series.slug;
        const count = options.count || 10;

        const occurrences =
          await this.eventSeriesOccurrenceService.getUpcomingOccurrences(
            seriesSlug,
            count,
          );

        // Filter and convert the occurrences to EventEntity objects
        const result: EventEntity[] = [];

        for (const occurrence of occurrences) {
          // Only include materialized occurrences with event data
          if (occurrence.materialized && occurrence.event) {
            result.push(occurrence.event);
          }
        }

        return result;
      }

      // Fallback to using RecurrencePatternService for backward compatibility
      // Get recurrence rule and settings from parent event
      const { recurrenceRule, timeZone, startDate } = parentEvent;
      const recurrenceExceptions = parentEvent.recurrenceExceptions || [];

      // Set generation options
      const generationOptions: OccurrenceOptions = {
        timeZone: timeZone || 'UTC',
        ...options,
      };

      // Handle exception dates with proper typing
      if (recurrenceExceptions && recurrenceExceptions.length > 0) {
        const processedExdates = recurrenceExceptions.map((d) =>
          typeof d === 'string' ? d : new Date(d),
        );
        generationOptions.exdates = processedExdates as string[]; // Type assertion for TypeScript
      }

      // Generate occurrence dates using RecurrencePatternService
      const occurrenceDates = this.recurrencePatternService.generateOccurrences(
        startDate,
        recurrenceRule as any,
        generationOptions,
      );

      // Skip the first occurrence if it's the same as the parent event's start date
      const filteredDates = occurrenceDates.filter(
        (date) =>
          !isEqual(
            new Date(date.toISOString().split('T')[0]),
            new Date(parentEvent.startDate.toISOString().split('T')[0]),
          ),
      );

      // Check which occurrences already exist in the database
      const existingOccurrences = await this.eventRepository.find({
        where: {
          parentEventId: parentEvent.id,
          isRecurrenceException: false,
        },
      });

      // Map of existing occurrence dates for quick lookup
      const existingDatesMap = new Map<string, EventEntity>();
      existingOccurrences.forEach((occurrence) => {
        const dateKey = occurrence.startDate.toISOString().split('T')[0];
        existingDatesMap.set(dateKey, occurrence);
      });

      // Create occurrence events for new dates
      const newOccurrences: EventEntity[] = [];

      for (const occurrenceDate of filteredDates) {
        const dateKey = occurrenceDate.toISOString().split('T')[0];

        // Skip if this occurrence already exists
        if (existingDatesMap.has(dateKey)) {
          continue;
        }

        // Create the occurrence entity
        const occurrence = this.createOccurrenceFromParent(
          parentEvent,
          occurrenceDate,
        );
        newOccurrences.push(occurrence);
      }

      // Batch save the new occurrences
      if (newOccurrences.length > 0) {
        return await this.eventRepository.save(newOccurrences);
      }

      return newOccurrences;
    } catch (error) {
      this.logger.error(
        `Error generating occurrences: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Get occurrences of a recurring event within a date range
   * @deprecated Use EventSeriesOccurrenceService.getUpcomingOccurrences with date filtering instead
   */
  @Trace('event-occurrence.getOccurrencesInRange')
  async getOccurrencesInRange(
    parentEventId: number,
    startDate: Date,
    endDate: Date,
    includeExceptions: boolean = true,
  ): Promise<EventEntity[]> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      if (!parentEvent) {
        this.logger.warn(
          `Parent event with ID ${parentEventId} not found or not recurring`,
        );
        return [];
      }

      // If this is a new EventSeries-based event
      if (parentEvent.seriesId && parentEvent.series) {
        this.logger.log(
          `Using EventSeriesOccurrenceService for event with seriesId ${parentEvent.seriesId}`,
        );

        const seriesSlug = parentEvent.series.slug;
        // Get a larger number to ensure we capture enough dates in range
        const count = 50;

        const occurrences =
          await this.eventSeriesOccurrenceService.getUpcomingOccurrences(
            seriesSlug,
            count,
          );

        // Filter and convert the occurrences to EventEntity objects
        const result: EventEntity[] = [];

        for (const occurrence of occurrences) {
          // Only include materialized occurrences with event data that are in the date range
          if (occurrence.materialized && occurrence.event) {
            const occurrenceDate = new Date(occurrence.date);
            if (
              isAfter(occurrenceDate, startDate) &&
              isBefore(occurrenceDate, endDate)
            ) {
              result.push(occurrence.event);
            }
          }
        }

        return result;
      }

      // Fallback to the old implementation for backward compatibility

      // Base query conditions for occurrences
      const whereConditions: any = {
        parentEventId,
        startDate: Between(startDate, endDate),
      };

      // If we don't want exceptions, exclude them
      if (!includeExceptions) {
        whereConditions.isRecurrenceException = false;
      }

      // Fetch occurrences from the database
      const occurrences = await this.eventRepository.find({
        where: whereConditions,
        order: { startDate: 'ASC' },
      });

      // Check if we need to generate additional occurrences
      const { recurrenceRule, timeZone } = parentEvent;

      if (recurrenceRule) {
        // Generate occurrence dates for the range
        const generatedDates = this.recurrencePatternService
          .generateOccurrences(parentEvent.startDate, recurrenceRule as any, {
            timeZone: timeZone || 'UTC',
            exdates: parentEvent.recurrenceExceptions,
            until: endDate,
          })
          .filter(
            (date) => isAfter(date, startDate) && isBefore(date, endDate),
          );

        // Create a map of existing occurrences by date for quick lookup
        const existingDatesMap = new Map<string, boolean>();
        occurrences.forEach((occurrence) => {
          const dateKey = occurrence.startDate.toISOString().split('T')[0];
          existingDatesMap.set(dateKey, true);
        });

        // Create occurrence entities for dates not in the database
        const newOccurrences: EventEntity[] = [];

        for (const occurrenceDate of generatedDates) {
          const dateKey = occurrenceDate.toISOString().split('T')[0];

          // Skip if this occurrence already exists
          if (existingDatesMap.has(dateKey)) {
            continue;
          }

          // Create the occurrence entity
          const occurrence = this.createOccurrenceFromParent(
            parentEvent,
            occurrenceDate,
          );
          newOccurrences.push(occurrence);
        }

        // Batch save the new occurrences
        if (newOccurrences.length > 0) {
          const savedOccurrences =
            await this.eventRepository.save(newOccurrences);
          occurrences.push(...savedOccurrences);
        }
      }

      // Sort by start date before returning
      return occurrences.sort(
        (a, b) => a.startDate.getTime() - b.startDate.getTime(),
      );
    } catch (error) {
      this.logger.error(
        `Error getting occurrences in range: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  /**
   * Create or update an exception occurrence of a recurring event
   * @deprecated Use EventSeriesOccurrenceService.materializeOccurrence instead
   */
  @Trace('event-occurrence.createExceptionOccurrence')
  async createExceptionOccurrence(
    parentEventId: number,
    originalDate: Date,
    modifications: Partial<EventEntity>,
  ): Promise<EventEntity> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      if (!parentEvent) {
        throw new Error(
          `Parent event with ID ${parentEventId} not found or not recurring`,
        );
      }

      // If this is a new EventSeries-based event
      if (parentEvent.seriesId && parentEvent.series) {
        this.logger.log(
          `Using EventSeriesOccurrenceService for event with seriesId ${parentEvent.seriesId}`,
        );

        const seriesSlug = parentEvent.series.slug;
        const userId = parentEvent.user?.id || 1; // Default to admin user if not found

        // First, materialize the occurrence if it's not already materialized
        const materializedOccurrence =
          await this.eventSeriesOccurrenceService.materializeOccurrence(
            seriesSlug,
            originalDate.toISOString(),
            userId,
          );

        // Apply the modifications to the materialized occurrence
        if (materializedOccurrence) {
          Object.assign(materializedOccurrence, modifications);
          return await this.eventRepository.save(materializedOccurrence);
        }

        throw new Error(
          `Failed to materialize occurrence for series ${seriesSlug} on date ${originalDate.toISOString()}`,
        );
      }

      // Fallback to the old implementation for backward compatibility

      // Check if this occurrence is part of the recurrence pattern
      const isInPattern =
        this.recurrencePatternService.isDateInRecurrencePattern(
          originalDate,
          parentEvent.startDate,
          parentEvent.recurrenceRule as any,
          parentEvent.timeZone,
          parentEvent.recurrenceExceptions,
        );

      if (!isInPattern) {
        throw new Error(
          `Date ${originalDate.toISOString()} is not part of the recurrence pattern`,
        );
      }

      // Check if this exception already exists
      const existingException = await this.eventRepository.findOne({
        where: {
          parentEventId,
          originalDate,
          isRecurrenceException: true,
        },
      });

      // If it exists, update it
      if (existingException) {
        Object.assign(existingException, modifications);
        return await this.eventRepository.save(existingException);
      }

      // Otherwise, create a new exception occurrence
      // First, find the regular occurrence if it exists
      let occurrence = await this.eventRepository.findOne({
        where: {
          parentEventId,
          startDate: originalDate,
          isRecurrenceException: false,
        },
      });

      // If no occurrence exists yet, create one from the parent
      if (!occurrence) {
        occurrence = this.createOccurrenceFromParent(parentEvent, originalDate);
      }

      // Convert it to an exception and apply modifications
      occurrence.isRecurrenceException = true;
      occurrence.originalDate = originalDate;
      Object.assign(occurrence, modifications);

      // Add to parent's exception list if not already there
      if (!parentEvent.recurrenceExceptions) {
        parentEvent.recurrenceExceptions = [];
      }

      if (
        !parentEvent.recurrenceExceptions.includes(originalDate.toISOString())
      ) {
        parentEvent.recurrenceExceptions.push(originalDate.toISOString());
        await this.eventRepository.save(parentEvent);
      }

      // Save and return the exception occurrence
      return await this.eventRepository.save(occurrence);
    } catch (error) {
      this.logger.error(
        `Error creating exception occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete an occurrence from a recurring event
   * @deprecated For EventSeries-based events, cancel a specific occurrence instead
   */
  @Trace('event-occurrence.excludeOccurrence')
  async excludeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      if (!parentEvent) {
        throw new Error(
          `Parent event with ID ${parentEventId} not found or not recurring`,
        );
      }

      // For EventSeries-based events, we handle differently
      // We would typically cancel a specific occurrence rather than exclude it
      if (parentEvent.seriesId && parentEvent.series) {
        // Find the specific occurrence for this date
        const seriesSlug = parentEvent.series.slug;
        const occurrence =
          await this.eventSeriesOccurrenceService.findOccurrence(
            seriesSlug,
            occurrenceDate.toISOString(),
          );

        // If the occurrence exists, update its status to canceled
        if (occurrence) {
          occurrence.status = EventStatus.Cancelled;
          await this.eventRepository.save(occurrence);
          return true;
        }

        // If the occurrence doesn't exist yet, materialize it and then cancel it
        const userId = parentEvent.user?.id || 1; // Default to admin user if not found
        try {
          const materializedOccurrence =
            await this.eventSeriesOccurrenceService.materializeOccurrence(
              seriesSlug,
              occurrenceDate.toISOString(),
              userId,
            );

          if (materializedOccurrence) {
            materializedOccurrence.status = EventStatus.Cancelled;
            await this.eventRepository.save(materializedOccurrence);
            return true;
          }
        } catch (error) {
          this.logger.error(
            `Error materializing occurrence for exclusion: ${error.message}`,
            error.stack,
          );
          return false;
        }
      }

      // Fallback for old-style recurrence

      // Check if this occurrence is part of the recurrence pattern
      const isInPattern =
        this.recurrencePatternService.isDateInRecurrencePattern(
          occurrenceDate,
          parentEvent.startDate,
          parentEvent.recurrenceRule as any,
          parentEvent.timeZone,
        );

      if (!isInPattern) {
        throw new Error(
          `Date ${occurrenceDate.toISOString()} is not part of the recurrence pattern`,
        );
      }

      // Add to parent's exception list if not already there
      if (!parentEvent.recurrenceExceptions) {
        parentEvent.recurrenceExceptions = [];
      }

      const dateString = occurrenceDate.toISOString();
      if (!parentEvent.recurrenceExceptions.includes(dateString)) {
        parentEvent.recurrenceExceptions.push(dateString);
        await this.eventRepository.save(parentEvent);
      }

      // Delete any existing occurrence for this date
      const result = await this.eventRepository.delete({
        parentEventId,
        startDate: occurrenceDate,
      });

      return result.affected ? result.affected > 0 : false;
    } catch (error) {
      this.logger.error(
        `Error excluding occurrence: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Add back a previously excluded occurrence
   * @deprecated For EventSeries-based events, reactivate a specific occurrence instead
   */
  @Trace('event-occurrence.includeOccurrence')
  async includeOccurrence(
    parentEventId: number,
    occurrenceDate: Date,
  ): Promise<boolean> {
    try {
      await this.initializeRepository();

      // Fetch the parent event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      if (!parentEvent) {
        throw new Error(
          `Parent event with ID ${parentEventId} not found or not recurring`,
        );
      }

      // For EventSeries-based events, we handle differently
      if (parentEvent.seriesId && parentEvent.series) {
        // Find the specific occurrence for this date
        const seriesSlug = parentEvent.series.slug;
        const occurrence =
          await this.eventSeriesOccurrenceService.findOccurrence(
            seriesSlug,
            occurrenceDate.toISOString(),
          );

        // If the occurrence exists and is canceled, reactivate it
        if (occurrence && occurrence.status === EventStatus.Cancelled) {
          occurrence.status = EventStatus.Published;
          await this.eventRepository.save(occurrence);
          return true;
        }

        // If the occurrence doesn't exist yet, materialize it
        if (!occurrence) {
          const userId = parentEvent.user?.id || 1; // Default to admin user if not found
          try {
            await this.eventSeriesOccurrenceService.materializeOccurrence(
              seriesSlug,
              occurrenceDate.toISOString(),
              userId,
            );
            return true;
          } catch (error) {
            this.logger.error(
              `Error materializing occurrence for inclusion: ${error.message}`,
              error.stack,
            );
            return false;
          }
        }

        return true;
      }

      // Fallback for old-style recurrence

      // Remove from parent's exception list
      if (
        parentEvent.recurrenceExceptions &&
        parentEvent.recurrenceExceptions.length > 0
      ) {
        const dateString = occurrenceDate.toISOString();
        parentEvent.recurrenceExceptions =
          parentEvent.recurrenceExceptions.filter((d) => d !== dateString);
        await this.eventRepository.save(parentEvent);
      }

      // Create a new occurrence for this date if it doesn't exist
      const existingOccurrence = await this.eventRepository.findOne({
        where: {
          parentEventId,
          startDate: occurrenceDate,
        },
      });

      if (!existingOccurrence) {
        const newOccurrence = this.createOccurrenceFromParent(
          parentEvent,
          occurrenceDate,
        );
        await this.eventRepository.save(newOccurrence);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Error including occurrence: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Delete all occurrences of a recurring event
   * @deprecated For EventSeries events, delete the entire series instead
   */
  @Trace('event-occurrence.deleteAllOccurrences')
  async deleteAllOccurrences(parentEventId: number): Promise<number> {
    try {
      await this.initializeRepository();

      // Fetch the parent event to check if it's an EventSeries-based event
      const parentEvent = await this.eventRepository.findOne({
        where: { id: parentEventId, isRecurring: true },
        relations: ['series'],
      });

      // For EventSeries-based events, we can delete all materialized occurrences
      if (parentEvent?.seriesId) {
        const seriesId = parentEvent.seriesId;

        // Delete all events with this seriesId
        const result = await this.eventRepository.delete({
          seriesId,
        });

        return result.affected ? result.affected : 0;
      }

      // Fallback for old-style recurrence - delete all occurrences for this parent event
      const result = await this.eventRepository.delete({
        parentEventId,
      });

      return result.affected ? result.affected : 0;
    } catch (error) {
      this.logger.error(
        `Error deleting occurrences: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  /**
   * Create a new occurrence entity from a parent event
   */
  private createOccurrenceFromParent(
    parentEvent: EventEntity,
    occurrenceDate: Date,
  ): EventEntity {
    // Calculate the time difference between start and end dates
    const duration = parentEvent.endDate
      ? parentEvent.endDate.getTime() - parentEvent.startDate.getTime()
      : 0;

    // Create end date for the occurrence based on the same duration
    const endDate =
      duration > 0 ? new Date(occurrenceDate.getTime() + duration) : undefined;

    // Create the occurrence entity
    const occurrence = new EventEntity();

    // Copy relevant properties from parent
    Object.assign(occurrence, {
      name: parentEvent.name,
      description: parentEvent.description,
      type: parentEvent.type,
      status: parentEvent.status,
      visibility: parentEvent.visibility,
      locationOnline: parentEvent.locationOnline,
      maxAttendees: parentEvent.maxAttendees,
      requireApproval: parentEvent.requireApproval,
      approvalQuestion: parentEvent.approvalQuestion,
      requireGroupMembership: parentEvent.requireGroupMembership,
      allowWaitlist: parentEvent.allowWaitlist,
      location: parentEvent.location,
      lat: parentEvent.lat,
      lon: parentEvent.lon,
      image: parentEvent.image,
      isAllDay: parentEvent.isAllDay,
      securityClass: parentEvent.securityClass,
      priority: parentEvent.priority,
      blocksTime: parentEvent.blocksTime,
      resources: parentEvent.resources,
      color: parentEvent.color,
      conferenceData: parentEvent.conferenceData,

      // Occurrence-specific fields
      startDate: occurrenceDate,
      endDate: endDate,
      parentEventId: parentEvent.id,
      timeZone: parentEvent.timeZone,
      isRecurring: false,
      isRecurrenceException: false,
    });

    return occurrence;
  }
}
