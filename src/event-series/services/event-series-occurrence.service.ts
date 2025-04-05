import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { EventSeriesService } from './event-series.service';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { Trace } from '../../utils/trace.decorator';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { UserService } from '../../user/user.service';
import { parseISO } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

@Injectable()
export class EventSeriesOccurrenceService {
  private readonly logger = new Logger(EventSeriesOccurrenceService.name);

  constructor(
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    private readonly eventSeriesService: EventSeriesService,
    private readonly recurrencePatternService: RecurrencePatternService,
    private readonly userService: UserService,
  ) {}

  /**
   * Configuration for occurrence materialization timeframes
   * @private
   */
  private readonly materializationConfig = {
    // For Bluesky events, materialize the next 5 future events
    blueskyEventCount: 5,
    // For normal events, materialize occurrences 2 months into the future
    normalEventMonths: 2,
  };

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
      // Convert occurrence date string to Date object
      const date = new Date(occurrenceDate);

      // Find occurrence by series ID and start date using EventQueryService
      const occurrences =
        await this.eventManagementService.findEventsBySeriesSlug(seriesSlug, {
          page: 1,
          limit: 1,
        });

      const occurrence = occurrences[0].find((event) =>
        this.isSameDay(event.startDate, date, 'UTC'),
      );

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

      // Get the user's slug
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new BadRequestException(`User with ID ${userId} not found`);
      }

      // Try to find the template event by slug first
      let updatedTemplateEvent: EventEntity | null = series.templateEventSlug
        ? await this.eventQueryService.findEventBySlug(series.templateEventSlug)
        : null;

      // If no template event found by slug, try to find any event in the series
      if (!updatedTemplateEvent) {
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(seriesSlug, {
            page: 1,
            limit: 1,
          });
        updatedTemplateEvent = events[0];
      }

      // If still no template event, create a default one
      if (!updatedTemplateEvent) {
        const defaultTemplate = await this.eventManagementService.create(
          {
            name: series.name,
            description: series.description || '',
            startDate: new Date(occurrenceDate),
            timeZone: 'UTC',
            type: 'in-person',
            location: '',
            locationOnline: '',
            maxAttendees: 0,
            requireApproval: false,
            approvalQuestion: '',
            allowWaitlist: false,
            categories: [],
            seriesSlug: series.slug,
          },
          userId,
          {}, // Remove materialized flag
        );

        // Update the series with the new template event slug
        series.templateEventSlug = defaultTemplate.slug;
        await this.eventSeriesService.update(
          series.slug,
          {
            templateEventSlug: defaultTemplate.slug,
          },
          userId,
        );

        updatedTemplateEvent = defaultTemplate;
      }

      // Validate that the occurrence date is valid according to the recurrence rule
      const date = new Date(occurrenceDate);
      const isValidOccurrence =
        this.recurrencePatternService.isDateInRecurrencePattern(
          date,
          new Date(series.createdAt),
          series.recurrenceRule as RecurrenceRule,
          { timeZone: 'UTC' },
        );

      if (!isValidOccurrence) {
        throw new BadRequestException(
          `Invalid occurrence date: ${occurrenceDate} is not part of the recurrence pattern`,
        );
      }

      // Calculate the duration of the template event
      let endDate: Date | undefined;
      if (updatedTemplateEvent?.endDate) {
        const durationMs =
          updatedTemplateEvent.endDate.getTime() -
          updatedTemplateEvent.startDate.getTime();
        endDate = new Date(date.getTime() + durationMs);
      }

      // Ensure we have a valid template event
      if (!updatedTemplateEvent) {
        throw new NotFoundException('Template event not found');
      }

      // Create a new event based on the template
      const newOccurrence = await this.eventManagementService.create(
        {
          name: updatedTemplateEvent.name,
          description:
            updatedTemplateEvent.description || series.description || '',
          startDate: date,
          endDate: endDate,
          timeZone: 'UTC',
          type: updatedTemplateEvent.type,
          location: updatedTemplateEvent.location || '',
          locationOnline: updatedTemplateEvent.locationOnline || '',
          maxAttendees: updatedTemplateEvent.maxAttendees || 0,
          requireApproval: updatedTemplateEvent.requireApproval || false,
          approvalQuestion: updatedTemplateEvent.approvalQuestion || '',
          allowWaitlist: updatedTemplateEvent.allowWaitlist || false,
          categories:
            updatedTemplateEvent.categories?.map((cat) => cat.id) || [],
          seriesSlug: series.slug,
          recurrenceRule: {
            ...series.recurrenceRule,
            frequency: series.recurrenceRule.frequency,
          },
        },
        userId,
        {}, // Remove materialized flag
      );

      // Reload the occurrence to get the updated fields
      const updatedOccurrence = await this.eventQueryService.findEventBySlug(
        newOccurrence.slug,
      );
      if (!updatedOccurrence) {
        throw new NotFoundException(
          `Occurrence with slug ${newOccurrence.slug} not found after update`,
        );
      }

      this.logger.debug(
        `Occurrence after update: slug=${updatedOccurrence.slug}, location=${updatedOccurrence.location}`,
      );

      return updatedOccurrence;
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
   * This returns both database events and calculated future occurrences
   */
  @Trace('event-series-occurrence.getUpcomingOccurrences')
  async getUpcomingOccurrences(
    seriesSlug: string,
    count: number = 10,
  ): Promise<{ date: string; event?: EventEntity; materialized: boolean }[]> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Get all events for this series with future dates
      const now = new Date();
      const [existingOccurrences] =
        await this.eventManagementService.findEventsBySeriesSlug(seriesSlug, {
          page: 1,
          limit: count * 2,
        });

      // Filter to only include future dates and exclude the template event
      const futureOccurrences = existingOccurrences.filter(
        (event) =>
          event.startDate >= now && event.slug !== series.templateEventSlug,
      );

      // Get the template event to use its start date
      let templateEvent = series.templateEventSlug
        ? await this.eventQueryService.findEventBySlug(series.templateEventSlug)
        : null;

      // If no template event found by slug, try to find any event in the series
      if (!templateEvent) {
        templateEvent = futureOccurrences[0];
      }

      // If still no template event, use the series creation date and first occurrence date
      let startDate = new Date(series.createdAt);
      if (!templateEvent && series.recurrenceRule) {
        // Generate the first occurrence date from the recurrence rule
        const firstOccurrence =
          this.recurrencePatternService.generateOccurrences(
            new Date(series.createdAt),
            series.recurrenceRule as RecurrenceRule,
            {
              timeZone: 'UTC',
              count: 1,
            },
          )[0];
        startDate = firstOccurrence
          ? new Date(firstOccurrence)
          : new Date(series.createdAt);
      }

      // Generate all occurrence dates from the recurrence rule
      const generatedDates = this.recurrencePatternService.generateOccurrences(
        startDate,
        series.recurrenceRule as RecurrenceRule,
        {
          timeZone: 'UTC',
          count: count * 2, // Get more to account for filtered dates
        },
      );

      // Filter dates to only include future dates
      const futureDates = generatedDates
        .map((date) => new Date(date))
        .filter((date) => date >= now);

      // Map dates to either existing events or calculated placeholders
      const results = futureDates.slice(0, count).map((date) => {
        // Find an existing event matching this date
        const existingOccurrence = futureOccurrences.find((occurrence) =>
          this.isSameDay(occurrence.startDate, date, 'UTC'),
        );

        // If we have an existing occurrence, it exists in the database already
        if (existingOccurrence) {
          return {
            date: date.toISOString(),
            event: existingOccurrence,
            materialized: true, // Determined by whether we have an event object
          };
        }

        // All other dates are not yet stored in the database
        return {
          date: date.toISOString(),
          materialized: false,
        };
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

      // Find the first occurrence that doesn't exist in the database yet
      const nextToCreate = upcomingOccurrences.find(
        (occurrence) => !occurrence.event,
      );

      if (!nextToCreate) {
        // No occurrences to create
        return undefined;
      }

      // Materialize the next occurrence
      return this.materializeOccurrence(seriesSlug, nextToCreate.date, userId);
    } catch (error) {
      this.logger.error(
        `Error materializing next occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Materialize the next N occurrences of a series
   * Specifically designed for Bluesky integration to ensure we have the next 5 events populated
   *
   * @param seriesSlug - The slug of the series to materialize occurrences for
   * @param userId - The user ID to associate with the materialized occurrences
   * @param isBlueskyEvent - Whether this is a Bluesky-sourced event
   * @returns Array of materialized event occurrences
   */
  @Trace('event-series-occurrence.materializeNextNOccurrences')
  async materializeNextNOccurrences(
    seriesSlug: string,
    userId: number,
    isBlueskyEvent: boolean = false,
  ): Promise<EventEntity[]> {
    try {
      this.logger.debug('Starting to materialize next occurrences for series', {
        seriesSlug,
        userId,
        isBlueskyEvent,
      });

      // Configure how many occurrences to materialize
      const count = isBlueskyEvent
        ? this.materializationConfig.blueskyEventCount
        : 5; // Default to 5 for standard operations

      // Get upcoming occurrences (both materialized and unmaterialized)
      const upcomingOccurrences = await this.getUpcomingOccurrences(
        seriesSlug,
        count * 2, // Get more than we need to ensure we have enough unmaterialized
      );

      // Filter out already materialized occurrences
      const unmaterializedOccurrences = upcomingOccurrences
        .filter((occurrence) => !occurrence.materialized)
        .slice(0, count);

      this.logger.debug('Found unmaterialized occurrences to create', {
        count: unmaterializedOccurrences.length,
        dates: unmaterializedOccurrences.map((o) => o.date),
      });

      // No unmaterialized occurrences to create
      if (unmaterializedOccurrences.length === 0) {
        return [];
      }

      // Materialize each occurrence in sequence
      const materializedEvents: EventEntity[] = [];
      for (const occurrence of unmaterializedOccurrences) {
        this.logger.debug('Materializing occurrence', {
          date: occurrence.date,
        });
        try {
          const materializedEvent = await this.materializeOccurrence(
            seriesSlug,
            occurrence.date,
            userId,
          );
          materializedEvents.push(materializedEvent);
        } catch (error) {
          this.logger.error(
            `Error materializing occurrence for date ${occurrence.date}`,
            error.stack,
          );
          // Continue with other occurrences even if one fails
        }
      }

      this.logger.debug('Successfully materialized occurrences', {
        count: materializedEvents.length,
        slugs: materializedEvents.map((e) => e.slug),
      });

      return materializedEvents;
    } catch (error) {
      this.logger.error(
        `Error in materializeNextNOccurrences: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Buffer materialization for when a user logs in
   * This ensures Bluesky events always have the correct number of future occurrences materialized
   *
   * @param userId - The user ID to materialize events for
   * @returns Number of events materialized
   */
  @Trace('event-series-occurrence.bufferBlueskyMaterialization')
  async bufferBlueskyMaterialization(userId: number): Promise<number> {
    try {
      this.logger.debug(
        'Starting buffered materialization for Bluesky events',
        { userId },
      );

      // Get all event series owned by this user that are Bluesky-sourced
      const userSeriesResult = await this.eventSeriesService.findByUser(
        userId,
        {
          sourceType: 'bluesky', // Filter to only Bluesky-sourced events
          page: 1,
          limit: 100, // Retrieve up to 100 series (adjust as needed)
        },
      );

      if (!userSeriesResult || !userSeriesResult.data) {
        this.logger.debug('No Bluesky series found for user', { userId });
        return 0;
      }

      const userSeries = userSeriesResult.data;

      this.logger.debug('Found Bluesky event series for user', {
        userId,
        count: userSeries.length,
        seriesSlugs: userSeries.map((s) => s.slug),
      });

      let totalMaterialized = 0;

      // Process each series to ensure it has the required number of materialized occurrences
      for (const series of userSeries) {
        const materializedEvents = await this.materializeNextNOccurrences(
          series.slug,
          userId,
          true, // This is a Bluesky event
        );

        totalMaterialized += materializedEvents.length;
      }

      this.logger.debug('Completed buffered materialization', {
        userId,
        totalMaterialized,
      });

      return totalMaterialized;
    } catch (error) {
      this.logger.error(
        `Error in bufferBlueskyMaterialization: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update future occurrences from a specific date
   * This is used for changing a recurring event's properties for the future
   *
   * The implementation follows the entity model approach:
   * 1. First, updates the template event with the provided properties
   * 2. Then propagates the updated template properties to all materialized occurrences
   *    from the reference date onwards, including the reference date itself
   * 3. Future unmaterialized occurrences will automatically use the updated template
   *
   * This implements the common calendar pattern of "Change this and all future events"
   * and ensures consistency with our entity model where the template event is the
   * source of truth for future occurrences.
   */
  @Trace('event-series-occurrence.updateFutureOccurrences')
  async updateFutureOccurrences(
    seriesSlug: string,
    fromDate: string,
    updates: any,
    userId: number,
  ): Promise<number> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Get the template event
      const templateEvent = series.templateEventSlug
        ? await this.eventQueryService.findEventBySlug(series.templateEventSlug)
        : null;

      if (!templateEvent) {
        throw new NotFoundException(
          `No template event found for series ${seriesSlug}`,
        );
      }

      // Convert date string to Date object
      const startDate = new Date(fromDate);

      // Find all materialized occurrences with dates on or after fromDate
      const [occurrences] =
        await this.eventManagementService.findEventsBySeriesSlug(
          seriesSlug,
          { page: 1, limit: 100 }, // Get a larger number to ensure we capture all future occurrences
        );

      // Filter to only include occurrences on or after fromDate
      const futureOccurrences = occurrences.filter(
        (event) => event.startDate >= startDate,
      );

      // Log what updates we received to debug the issue
      this.logger.log(`Received updates: ${JSON.stringify(updates)}`);

      // Log what updates were provided
      this.logger.log(
        `Received updates for future occurrences: ${JSON.stringify(updates)}`,
      );

      // Explicitly look for both forms (direct and template-prefixed) for backward compatibility
      // But log a warning that we should be using direct properties in the long run
      const templateUpdates: any = {};

      // Handle description
      if (updates.description !== undefined) {
        templateUpdates.description = updates.description;
      } else if (updates.templateDescription !== undefined) {
        this.logger.warn(
          `Using deprecated 'templateDescription' property - should use 'description' directly`,
        );
        templateUpdates.description = updates.templateDescription;
      }

      // Handle location
      if (updates.location !== undefined) {
        templateUpdates.location = updates.location;
      } else if (updates.templateLocation !== undefined) {
        this.logger.warn(
          `Using deprecated 'templateLocation' property - should use 'location' directly`,
        );
        templateUpdates.location = updates.templateLocation;
      }

      // Handle locationOnline
      if (updates.locationOnline !== undefined) {
        templateUpdates.locationOnline = updates.locationOnline;
      } else if (updates.templateLocationOnline !== undefined) {
        this.logger.warn(
          `Using deprecated 'templateLocationOnline' property - should use 'locationOnline' directly`,
        );
        templateUpdates.locationOnline = updates.templateLocationOnline;
      }

      // Handle maxAttendees
      if (updates.maxAttendees !== undefined) {
        templateUpdates.maxAttendees = updates.maxAttendees;
      } else if (updates.templateMaxAttendees !== undefined) {
        this.logger.warn(
          `Using deprecated 'templateMaxAttendees' property - should use 'maxAttendees' directly`,
        );
        templateUpdates.maxAttendees = updates.templateMaxAttendees;
      }

      // Handle other properties similarly
      if (updates.requireApproval !== undefined) {
        templateUpdates.requireApproval = updates.requireApproval;
      } else if (updates.templateRequireApproval !== undefined) {
        templateUpdates.requireApproval = updates.templateRequireApproval;
      }

      if (updates.approvalQuestion !== undefined) {
        templateUpdates.approvalQuestion = updates.approvalQuestion;
      } else if (updates.templateApprovalQuestion !== undefined) {
        templateUpdates.approvalQuestion = updates.templateApprovalQuestion;
      }

      if (updates.allowWaitlist !== undefined) {
        templateUpdates.allowWaitlist = updates.allowWaitlist;
      } else if (updates.templateAllowWaitlist !== undefined) {
        templateUpdates.allowWaitlist = updates.templateAllowWaitlist;
      }

      if (updates.categories !== undefined) {
        templateUpdates.categories = updates.categories;
      } else if (updates.templateCategories !== undefined) {
        templateUpdates.categories = updates.templateCategories;
      }

      this.logger.log(
        `Processed template updates: ${JSON.stringify(templateUpdates)}`,
      );

      // Only update if we have properties to update
      if (Object.keys(templateUpdates).length > 0) {
        this.logger.debug(
          `Updating template event ${templateEvent.slug} with properties:`,
          templateUpdates,
        );

        // Update the template event first
        await this.eventManagementService.update(
          templateEvent.slug,
          templateUpdates,
          userId,
        );

        // Now refresh the template event to get the updated values
        const updatedTemplateEvent =
          await this.eventQueryService.findEventBySlug(templateEvent.slug);

        // Update each occurrence with the properties from the updated template
        let updateCount = 0;
        for (const occurrence of futureOccurrences) {
          // We should update ALL occurrences from the reference date onwards, including the reference date
          this.logger.debug(
            `Updating occurrence ${occurrence.slug} (${occurrence.startDate})`,
          );

          // Create a propagation object based on the updated template event
          if (!updatedTemplateEvent) {
            throw new Error('Template event not found');
          }
          const propagationUpdates = {
            description: updatedTemplateEvent.description,
            location: updatedTemplateEvent.location,
            locationOnline: updatedTemplateEvent.locationOnline,
            maxAttendees: updatedTemplateEvent.maxAttendees,
            requireApproval: updatedTemplateEvent.requireApproval,
            approvalQuestion: updatedTemplateEvent.approvalQuestion,
            allowWaitlist: updatedTemplateEvent.allowWaitlist,
            categories:
              updatedTemplateEvent.categories?.map((cat) => cat.id) || [],
          };

          this.logger.log(
            `About to update occurrence ${occurrence.slug} with properties: ${JSON.stringify(propagationUpdates)}`,
          );

          // Update the occurrence directly with the template properties
          await this.eventManagementService.update(
            occurrence.slug,
            propagationUpdates,
            userId,
          );

          // Verify the update worked
          const updatedOccurrence =
            await this.eventQueryService.findEventBySlug(occurrence.slug);
          if (!updatedOccurrence) {
            throw new Error(
              `Failed to verify update for occurrence ${occurrence.slug}`,
            );
          }
          this.logger.log(
            `Occurrence after update: slug=${updatedOccurrence.slug}, location=${updatedOccurrence.location}`,
          );
          updateCount++;
        }

        return updateCount;
      }

      this.logger.debug('No properties to update in template or occurrences');
      return 0;
    } catch (error) {
      this.logger.error(
        `Error updating future occurrences: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get the effective event for a specific date
   * This returns the event for a specific date, taking into account any modifications
   */
  @Trace('event-series-occurrence.getEffectiveEventForDate')
  async getEffectiveEventForDate(
    seriesSlug: string,
    date: string,
  ): Promise<EventEntity> {
    try {
      // Get the occurrence for this date (or create one if needed)
      const occurrence = await this.findOccurrence(seriesSlug, date);

      if (occurrence) {
        return occurrence;
      }

      // If no materialized occurrence exists, find the series and check if the date is valid
      const series = await this.eventSeriesService.findBySlug(seriesSlug);
      const isValid = this.recurrencePatternService.isDateInRecurrencePattern(
        new Date(date),
        new Date(series.createdAt),
        series.recurrenceRule as RecurrenceRule,
        { timeZone: 'UTC' },
      );

      if (!isValid) {
        throw new BadRequestException(
          `Invalid occurrence date: ${date} is not part of the recurrence pattern`,
        );
      }

      // Find a template event to return properties from
      const [events] = await this.eventManagementService.findEventsBySeriesSlug(
        seriesSlug,
        { page: 1, limit: 1 },
      );

      const templateEvent = events[0];

      if (!templateEvent) {
        throw new BadRequestException(
          `No template event found for series ${seriesSlug}`,
        );
      }

      // Return the template, as we don't have a materialized occurrence
      return templateEvent;
    } catch (error) {
      this.logger.error(
        `Error getting effective event for date: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Properly converts a date to the specified timezone, accounting for DST
   * @param date The date to convert
   * @param timeZone The timezone to convert to
   * @returns A date object in the specified timezone
   */
  private convertToTimeZone(date: Date | string, timeZone: string): Date {
    const parsedDate = typeof date === 'string' ? parseISO(date) : date;
    return toZonedTime(parsedDate, timeZone);
  }

  /**
   * Formats a date in the specified timezone with the specified format
   * @param date The date to format
   * @param timeZone The timezone to format in
   * @param formatStr The format string to use
   * @returns A formatted date string
   */
  private formatInTimeZone(
    date: Date | string,
    timeZone: string,
    formatStr = 'yyyy-MM-dd',
  ): string {
    const parsedDate = typeof date === 'string' ? parseISO(date) : date;
    return formatInTimeZone(parsedDate, timeZone, formatStr);
  }

  /**
   * Check if two dates represent the same day in the specified timezone
   */
  private isSameDay(
    date1: Date | string,
    date2: Date | string,
    timeZone: string,
  ): boolean {
    // Format both dates as YYYY-MM-DD in the specified timezone
    const d1Str = this.formatInTimeZone(date1, timeZone);
    const d2Str = this.formatInTimeZone(date2, timeZone);
    // Compare the formatted strings
    return d1Str === d2Str;
  }
}
