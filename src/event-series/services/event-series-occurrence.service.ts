import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { EventSeriesRepository } from '../interfaces/event-series-repository.interface';
import { EventSeriesService } from './event-series.service';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { RecurrenceRule } from '../../recurrence/interfaces/recurrence.interface';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { Trace } from '../../utils/trace.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, IsNull } from 'typeorm';

@Injectable()
export class EventSeriesOccurrenceService {
  private readonly logger = new Logger(EventSeriesOccurrenceService.name);

  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepository: Repository<EventEntity>,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    private readonly eventSeriesService: EventSeriesService,
    private readonly recurrenceService: RecurrenceService,
  ) {}

  /**
   * Get or create (materialize) an occurrence for a specific date
   * This is the core function for materializing occurrences when needed
   */
  @Trace('event-series-occurrence.getOrCreateOccurrence')
  async getOrCreateOccurrence(
    seriesSlug: string,
    occurrenceDate: string,
    userId: number,
  ): Promise<EventEntity> {
    try {
      // First, check if the occurrence already exists
      const existingOccurrence = await this.findOccurrence(
        seriesSlug,
        occurrenceDate,
      );

      if (existingOccurrence) {
        return existingOccurrence;
      }

      // If not, materialize it
      return this.materializeOccurrence(seriesSlug, occurrenceDate, userId);
    } catch (error) {
      this.logger.error(
        `Error in getOrCreateOccurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find an occurrence for a specific date
   */
  @Trace('event-series-occurrence.findOccurrence')
  async findOccurrence(
    seriesSlug: string,
    occurrenceDate: string,
  ): Promise<EventEntity | undefined> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Convert occurrence date string to Date object
      const date = new Date(occurrenceDate);

      // Find occurrence by series ID and occurrence date
      // We need to find events that match this series and have this original occurrence date
      const occurrence = await this.eventRepository.findOne({
        where: {
          seriesId: series.id,
          originalOccurrenceDate: date,
        },
        relations: ['user', 'categories', 'image', 'series'],
      });

      return occurrence || undefined;
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Pass through the not found error
        throw error;
      }

      this.logger.error(
        `Error finding occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Materialize an occurrence for a specific date
   * This is called when an occurrence needs to be created from the template
   */
  @Trace('event-series-occurrence.materializeOccurrence')
  async materializeOccurrence(
    seriesSlug: string,
    occurrenceDate: string,
    userId: number,
  ): Promise<EventEntity> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Validate that the occurrence date is valid according to the recurrence rule
      const date = new Date(occurrenceDate);
      const isValidOccurrence =
        this.recurrenceService.isDateInRecurrencePattern(
          date,
          series.createdAt.toISOString(), // Use series creation date as reference
          series.recurrenceRule as RecurrenceRule,
          series.timeZone,
        );

      if (!isValidOccurrence) {
        throw new BadRequestException(
          `Invalid occurrence date: ${occurrenceDate} is not part of the recurrence pattern`,
        );
      }

      // Find a template event to use as a basis
      // This is typically the first occurrence that was created with the series
      const templateEvent = await this.eventRepository.findOne({
        where: {
          seriesId: series.id,
          materialized: true,
        },
        order: {
          createdAt: 'ASC',
        },
      });

      if (!templateEvent) {
        throw new BadRequestException(
          `No template event found for series ${seriesSlug}`,
        );
      }

      // Calculate the duration of the template event
      let endDate: Date | undefined;
      if (templateEvent.endDate) {
        const durationMs =
          templateEvent.endDate.getTime() - templateEvent.startDate.getTime();
        endDate = new Date(date.getTime() + durationMs);
      }

      // Create a new event based on the template
      const newOccurrence = this.eventRepository.create({
        name: series.name,
        description: series.description,
        startDate: date,
        endDate: endDate,
        timeZone: series.timeZone,
        type: templateEvent.type,
        location: templateEvent.location,
        locationOnline: templateEvent.locationOnline,
        maxAttendees: templateEvent.maxAttendees,
        requireApproval: templateEvent.requireApproval,
        approvalQuestion: templateEvent.approvalQuestion,
        allowWaitlist: templateEvent.allowWaitlist,

        // Set it as part of the series
        seriesId: series.id,
        materialized: true,
        originalOccurrenceDate: date,

        // Set it as recurring (for compatibility with existing code)
        isRecurring: true,
        recurrenceRule: series.recurrenceRule,

        // Set user via user reference rather than id
        user: { id: userId } as any,
      });

      // Save the new occurrence
      const savedOccurrence = await this.eventRepository.save(newOccurrence);

      // Add categories from template
      if (templateEvent.categories?.length > 0) {
        // We'd typically handle this in a transaction using a more specific method
        // but for simplicity, we'll assume there's a way to add categories
        // TODO: Implement proper category handling
      }

      // The savedOccurrence should have a slug generated
      if (savedOccurrence && savedOccurrence.slug) {
        return this.eventQueryService.findEventBySlug(savedOccurrence.slug);
      }

      // If we don't have a slug yet, return the saved occurrence
      return savedOccurrence;
    } catch (error) {
      this.logger.error(
        `Error materializing occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get upcoming occurrences for a series
   * This returns both materialized and unmaterialized occurrences
   */
  @Trace('event-series-occurrence.getUpcomingOccurrences')
  async getUpcomingOccurrences(
    seriesSlug: string,
    count: number = 10,
  ): Promise<{ date: string; event?: EventEntity; materialized: boolean }[]> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Get all materialized occurrences for this series with future dates
      const now = new Date();
      const materializedOccurrences = await this.eventRepository.find({
        where: {
          seriesId: series.id,
          materialized: true,
          startDate: MoreThanOrEqual(now),
        },
        relations: ['user', 'categories', 'image', 'series'],
        order: {
          startDate: 'ASC',
        },
        take: count,
      });

      // Generate all occurrence dates from the recurrence rule
      const generatedDates = this.recurrenceService.generateOccurrences(
        series.createdAt.toISOString(),
        series.recurrenceRule as RecurrenceRule,
        {
          timeZone: series.timeZone,
          count: count * 2, // Get more to account for filtered dates
        },
      );

      // Filter dates to only include future dates
      const futureDates = generatedDates.filter((date) => date >= now);

      // Map dates to either materialized occurrences or unmaterialized placeholders
      const results = futureDates.slice(0, count).map((date) => {
        // Find a materialized occurrence matching this date
        const existingOccurrence = materializedOccurrences.find((occurrence) =>
          this.isSameDay(
            occurrence.originalOccurrenceDate,
            date,
            series.timeZone,
          ),
        );

        if (existingOccurrence) {
          return {
            date: date.toISOString(),
            event: existingOccurrence,
            materialized: true,
          };
        } else {
          return {
            date: date.toISOString(),
            materialized: false,
          };
        }
      });

      return results;
    } catch (error) {
      this.logger.error(
        `Error getting upcoming occurrences: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Auto-materialize the next occurrence in the series
   * This is called after an event has completed
   */
  @Trace('event-series-occurrence.materializeNextOccurrence')
  async materializeNextOccurrence(
    seriesSlug: string,
    userId: number,
  ): Promise<EventEntity | undefined> {
    try {
      // Get upcoming occurrences
      const upcomingOccurrences = await this.getUpcomingOccurrences(
        seriesSlug,
        5,
      );

      // Find the first unmaterialized occurrence
      const nextUnmaterialized = upcomingOccurrences.find(
        (occurrence) => !occurrence.materialized,
      );

      if (!nextUnmaterialized) {
        // No unmaterialized occurrences to create
        return undefined;
      }

      // Materialize the next occurrence
      return this.materializeOccurrence(
        seriesSlug,
        nextUnmaterialized.date,
        userId,
      );
    } catch (error) {
      this.logger.error(
        `Error materializing next occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update all future unmaterialized occurrences when the series template changes
   */
  @Trace('event-series-occurrence.updateFutureOccurrences')
  async updateFutureOccurrences(
    seriesSlug: string,
    fromDate: string,
    updates: Partial<EventEntity>,
    userId: number,
  ): Promise<number> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Find all materialized occurrences for this series after the specified date
      const date = new Date(fromDate);
      const materializedOccurrences = await this.eventRepository.find({
        where: {
          seriesId: series.id,
          startDate: MoreThanOrEqual(date),
        },
      });

      // Update each materialized occurrence with the changes
      // In a full implementation, you'd want to be more careful about which fields to update
      for (const occurrence of materializedOccurrences) {
        // The eventManagementService.update method expects an UpdateEventDto object
        // and performs conversion of categories from IDs to entities internally
        await this.eventManagementService.update(
          occurrence.slug,
          updates as any, // Cast to any to bypass type check temporarily
          userId,
        );
      }

      return materializedOccurrences.length;
    } catch (error) {
      this.logger.error(
        `Error updating future occurrences: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Utility function to check if two dates represent the same day in a specific timezone
   */
  private isSameDay(date1: Date, date2: Date, timeZone: string): boolean {
    // Converting dates to the same timezone before comparing
    const d1Str = this.recurrenceService.formatDateInTimeZone(date1, timeZone, {
      format: 'yyyy-MM-dd',
    });
    const d2Str = this.recurrenceService.formatDateInTimeZone(date2, timeZone, {
      format: 'yyyy-MM-dd',
    });
    return d1Str === d2Str;
  }
}
