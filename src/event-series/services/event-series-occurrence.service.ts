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
import { startOfDay } from 'date-fns';

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
            location: undefined,
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

      // Apply series properties to the template event if they exist
      // This ensures updates to the series are propagated to new materializations
      if (series['location'] !== undefined) {
        updatedTemplateEvent.location = series['location'];
      }
      if (series['locationOnline'] !== undefined) {
        updatedTemplateEvent.locationOnline = series['locationOnline'];
      }
      if (series['maxAttendees'] !== undefined) {
        updatedTemplateEvent.maxAttendees = series['maxAttendees'];
      }
      if (series['requireApproval'] !== undefined) {
        updatedTemplateEvent.requireApproval = series['requireApproval'];
      }
      if (series['approvalQuestion'] !== undefined) {
        updatedTemplateEvent.approvalQuestion = series['approvalQuestion'];
      }
      if (series['allowWaitlist'] !== undefined) {
        updatedTemplateEvent.allowWaitlist = series['allowWaitlist'];
      }

      // Validate that the occurrence date is valid according to the recurrence rule
      const date = new Date(occurrenceDate);
      this.logger.debug(
        `[Materialize Debug] Validating date: ${date.toISOString()} (${occurrenceDate}) ` +
          `against series ${series.slug} created at ${new Date(series.createdAt).toISOString()} ` +
          `with rule ${JSON.stringify(series.recurrenceRule)} and timezone ${series.timeZone || 'UTC'}`,
      );
      const effectiveTimeZone = series.timeZone || 'UTC';
      const occurrenceDateString = this.formatInTimeZone(
        date,
        effectiveTimeZone,
      );

      const isValidOccurrence =
        this.recurrencePatternService.isDateInRecurrencePattern(
          occurrenceDateString,
          new Date(series.createdAt),
          series.recurrenceRule as RecurrenceRule,
          { timeZone: effectiveTimeZone },
          updatedTemplateEvent?.startDate
            ? new Date(updatedTemplateEvent.startDate)
            : undefined,
        );

      if (!isValidOccurrence) {
        this.logger.error(
          `[Materialize Debug] Validation FAILED for date ${occurrenceDate} in series ${series.slug}`,
        );
        throw new BadRequestException(
          `Invalid occurrence date: ${occurrenceDate} is not part of the recurrence pattern`,
        );
      }
      this.logger.debug(
        `[Materialize Debug] Validation PASSED for date ${occurrenceDate} in series ${series.slug}`,
      );

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

      // Create a new event using the template event data
      const createDto = {
        name: updatedTemplateEvent.name,
        description: updatedTemplateEvent.description || '', // Use template description
        startDate: date, // The calculated occurrence date
        endDate: endDate, // Calculated based on template duration
        timeZone: series.timeZone || 'UTC', // Use series timezone (could also use template's)
        type: updatedTemplateEvent.type,
        location: updatedTemplateEvent.location,
        locationOnline: updatedTemplateEvent.locationOnline || '',
        maxAttendees: updatedTemplateEvent.maxAttendees || 0,
        requireApproval: updatedTemplateEvent.requireApproval || false,
        approvalQuestion: updatedTemplateEvent.approvalQuestion || '',
        allowWaitlist: updatedTemplateEvent.allowWaitlist || false,
        categories: updatedTemplateEvent.categories?.map((cat) => cat.id) || [],
        seriesSlug: series.slug, // Link to the parent series
      };

      const newOccurrence = await this.eventManagementService.create(
        createDto,
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
    includePast: boolean = false,
  ): Promise<{ date: string; event?: EventEntity; materialized: boolean }[]> {
    try {
      // Get the series
      const series = await this.eventSeriesService.findBySlug(seriesSlug);

      // Determine the effective timezone early
      const effectiveTimeZone = series.timeZone || 'UTC';

      // Get the start of today relative to the effective timezone
      const today = startOfDay(
        this.convertToTimeZone(new Date(), effectiveTimeZone),
      );
      this.logger.debug(
        `[getUpcomingOccurrences] Today (in ${effectiveTimeZone}): ${today.toISOString()}`,
      );

      // Get all events for this series
      const [existingOccurrences] =
        await this.eventManagementService.findEventsBySeriesSlug(seriesSlug, {
          page: 1,
          limit: count * 2,
        });

      // Log number of existing occurrences
      this.logger.debug(
        `[getUpcomingOccurrences] Found ${existingOccurrences.length} existing occurrences for series ${seriesSlug}`,
        {
          includePast,
          pastEvents: existingOccurrences.filter(
            (event) => new Date(event.startDate) < today
          ).length,
          futureEvents: existingOccurrences.filter(
            (event) => new Date(event.startDate) >= today
          ).length
        }
      );

      // Get the template event to use its start date
      let templateEvent = series.templateEventSlug
        ? await this.eventQueryService.findEventBySlug(series.templateEventSlug)
        : null;

      // If no template event found by slug, try to find any event in the series
      if (!templateEvent) {
        templateEvent = existingOccurrences[0];
      }

      // Determine the correct start date and timezone for recurrence generation
      let effectiveStartDate: Date;

      if (templateEvent?.startDate) {
        effectiveStartDate = new Date(templateEvent.startDate);
        this.logger.debug(
          `[getUpcomingOccurrences] Using template event start date: ${effectiveStartDate.toISOString()}`,
        );
      } else {
        // Fallback: If no template event found, this is likely an issue, but we'll use createdAt as a last resort.
        effectiveStartDate = new Date(series.createdAt);
        this.logger.warn(
          `[getUpcomingOccurrences] Template event not found for series ${series.slug}. Falling back to series createdAt: ${effectiveStartDate.toISOString()}`,
        );
      }

      // Respect the recurrence rule count if it's set and less than requested count
      const recurrenceCount = series.recurrenceRule?.count;
      const effectiveCount =
        recurrenceCount && recurrenceCount < count ? recurrenceCount : count;

      // For past dates, we need to look back further in time
      let startDate = today;
      
      // If includePast is true, start generating from the effective start date or an earlier date
      if (includePast) {
        // Use either the template event date or the first event's date or the series creation date
        // and subtract a reasonable buffer (e.g., 365 days) to catch early occurrences
        const firstEventDate = existingOccurrences.length > 0 
          ? new Date(existingOccurrences[0].startDate)
          : new Date(series.createdAt);
        
        // Get the earliest date we can find
        const potentialDates = [
          effectiveStartDate,
          firstEventDate,
          new Date(series.createdAt)
        ].filter(d => d instanceof Date);
        
        // Sort dates in ascending order and pick the earliest one
        potentialDates.sort((a, b) => a.getTime() - b.getTime());
        
        if (potentialDates.length > 0) {
          const earliestDate = potentialDates[0];
          // Go back further to ensure we catch all possible occurrences
          const oneYearBefore = new Date(earliestDate);
          oneYearBefore.setFullYear(oneYearBefore.getFullYear() - 1);
          startDate = oneYearBefore;
        }
        
        this.logger.debug(
          `[getUpcomingOccurrences] Including past dates, starting from: ${startDate.toISOString()}`,
        );
      }

      // Generate all occurrence dates from the recurrence rule 
      const generatedDates = this.recurrencePatternService.generateOccurrences(
        effectiveStartDate, // Use the determined effective start date
        series.recurrenceRule as RecurrenceRule,
        {
          timeZone: effectiveTimeZone, // Use the series timezone
          count: effectiveCount * 2, // Get more to account for filtered dates
          startAfterDate: startDate, // Use today or earlier date if includePast is true
        },
      );

      // Map the generated dates directly
      const allDates = generatedDates.map((date) => new Date(date));
      
      // Keep debug logging to understand what times we're getting
      this.logger.debug('[getUpcomingOccurrences] Generated occurrence times', {
        timeZone: effectiveTimeZone,
        includePast,
        totalDates: allDates.length,
        sampleDates: allDates.slice(0, 3).map((d) => ({
          utc: d.toISOString(),
          local: formatInTimeZone(d, effectiveTimeZone, 'HH:mm'),
        })),
      });

      // Map dates to either existing events or calculated placeholders
      let results = allDates.map((date) => {
        // Find an existing event matching this date
        const existingOccurrence = existingOccurrences.find((occurrence) =>
          this.isSameDay(occurrence.startDate, date, effectiveTimeZone),
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
      
      // If includePast is true, sort by date (ascending)
      if (includePast) {
        results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // Limit to the requested count
      return results.slice(0, effectiveCount);
    } catch (error) {
      this.logger.error(
        `Error getting occurrences: ${error.message}`,
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
      const effectiveTimeZone = series.timeZone || 'UTC';
      const isValid = this.recurrencePatternService.isDateInRecurrencePattern(
        date,
        new Date(series.createdAt),
        series.recurrenceRule as RecurrenceRule,
        { timeZone: effectiveTimeZone },
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
