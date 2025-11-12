import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
  Scope,
} from '@nestjs/common';
import { EventSeriesService } from './event-series.service';
import { RecurrenceRule } from '../interfaces/recurrence.interface';
import { EventQueryService } from '../../event/services/event-query.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { Trace } from '../../utils/trace.decorator';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { UserService } from '../../user/user.service';
import { parseISO, format } from 'date-fns';
import { toZonedTime, formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { startOfDay } from 'date-fns';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CreateEventDto } from '../../event/dto/create-event.dto';
import { OccurrenceResult } from '../interfaces/occurrence-result.interface';

/**
 * Service for managing event series occurrences
 *
 * This is the primary service for materializing occurrences from event series patterns.
 * Always use this service instead of EventManagementService.createSeriesOccurrence
 * or EventSeriesService.createSeriesOccurrence.
 */
@Injectable({ scope: Scope.REQUEST })
export class EventSeriesOccurrenceService {
  private readonly logger = new Logger(EventSeriesOccurrenceService.name);

  constructor(
    @Inject(forwardRef(() => EventSeriesService))
    private readonly eventSeriesService: EventSeriesService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => RecurrencePatternService))
    private readonly recurrencePatternService: RecurrencePatternService,
    @Inject(REQUEST) private readonly request: any,
    private readonly userService: UserService,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Configuration for occurrence materialization timeframes
   * @private
   */
  private readonly materializationConfig = {
    // For Bluesky events, materialize the next 2 future events
    blueskyEventCount: 2,
    // For normal events, materialize occurrences 2 months into the future
    normalEventMonths: 2,
  };

  /**
   * Initialize repository with the appropriate tenant connection
   */
  @Trace('event-series-occurrence.initializeRepository')
  private initializeRepository(tenantId?: string) {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }
  }

  /**
   * Get or create (materialize) an occurrence for a specific date
   * This is the core function for materializing occurrences when needed
   */
  @Trace('event-series-occurrence.getOrCreateOccurrence')
  async getOrCreateOccurrence(
    seriesSlug: string,
    occurrenceDate: string,
    userId: number,
    tenantId?: string,
  ): Promise<EventEntity> {
    try {
      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      // First, check if the occurrence already exists
      const existingOccurrence = await this.findOccurrence(
        seriesSlug,
        occurrenceDate,
        tenantId,
      );

      if (existingOccurrence) {
        return existingOccurrence;
      }

      // If not, materialize it
      return this.materializeOccurrence(
        seriesSlug,
        occurrenceDate,
        userId,
        tenantId,
      );
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
    tenantId?: string,
  ): Promise<EventEntity | undefined> {
    try {
      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      // Convert occurrence date string to Date object
      const date = new Date(occurrenceDate);
      this.logger.debug(
        `Finding occurrence for series ${seriesSlug} on date ${occurrenceDate}`,
      );

      // Get the series to verify it exists
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );

      if (!series) {
        throw new NotFoundException(`Series with slug ${seriesSlug} not found`);
      }

      // Find occurrence by series ID and start date using management service
      const [events] = await this.eventManagementService.findEventsBySeriesSlug(
        seriesSlug,
        { page: 1, limit: 100 },
        tenantId,
      );

      // Find the occurrence matching the provided date
      const occurrence = events.find((event) =>
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
    tenantId?: string,
  ): Promise<EventEntity> {
    try {
      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      this.logger.debug(
        `Starting materialization for seriesSlug: ${seriesSlug}, date: ${occurrenceDate}`,
      );

      // Get the series
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );
      this.logger.debug(
        `Materializing occurrence for series ${seriesSlug} on date ${occurrenceDate}`,
      );

      // Store the expected seriesSlug for verification later
      const expectedSeriesSlug = seriesSlug;

      // Get the user's slug
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new BadRequestException(`User with ID ${userId} not found`);
      }

      // Try to find the template event by slug first
      let updatedTemplateEvent: EventEntity | null = series.templateEventSlug
        ? await this.eventQueryService.findEventBySlug(series.templateEventSlug)
        : null;

      if (updatedTemplateEvent) {
        this.logger.debug(
          `Found template event ${updatedTemplateEvent.slug} with seriesSlug: ${updatedTemplateEvent.seriesSlug || 'null'}`,
        );
      } else {
        this.logger.debug(
          `No template event found by slug ${series.templateEventSlug || 'null'}`,
        );
      }

      // If no template event found by slug, try to find any event in the series
      if (!updatedTemplateEvent) {
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(
            seriesSlug,
            { page: 1, limit: 100 },
            tenantId,
          );

        if (events.length > 0) {
          // Sort events by start date descending (most recent first)
          events.sort(
            (a, b) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
          );
          updatedTemplateEvent = events[0]; // Use the most recent event
          this.logger.log(
            `Using most recent event (${updatedTemplateEvent.slug}) as template for series ${seriesSlug}`,
          );
          this.logger.debug(
            `Most recent event seriesSlug: ${updatedTemplateEvent.seriesSlug || 'null'}`,
          );
        }
      }

      // If still no template event, create a default one
      if (!updatedTemplateEvent) {
        this.logger.warn(
          `No template or events found for series ${seriesSlug}. Creating a new template event.`,
        );
        // Create a minimal but valid CreateEventDto with required fields
        const defaultEventDto: CreateEventDto = {
          name: series.name,
          description: series.description || '',
          startDate: new Date(occurrenceDate),
          endDate: new Date(
            new Date(occurrenceDate).getTime() + 60 * 60 * 1000,
          ),
          seriesSlug: seriesSlug,
          timeZone: series.timeZone || 'UTC',
          // Add required fields that might be undefined in the DTO
          type: 'in-person', // Default type
          locationOnline: '',
          maxAttendees: 0,
          categories: [],
        };

        const defaultTemplate = await this.eventManagementService.create(
          defaultEventDto,
          userId,
        );
        updatedTemplateEvent = defaultTemplate;
        this.logger.debug(
          `Created new template event ${updatedTemplateEvent.slug} with seriesSlug: ${updatedTemplateEvent.seriesSlug || 'null'}`,
        );
      }

      // DST-AWARE DATE CALCULATION
      // The occurrenceDate from RRule already has the correct UTC time that maintains
      // the local time across DST boundaries. We need to use it directly.
      const timeZone = series.timeZone || 'UTC';

      // Parse the occurrence date (which comes from RRule with correct UTC time)
      const occurrenceDateUtc = new Date(occurrenceDate);

      // Get the local date and time components from the RRule-generated date
      const rruleLocalDate = formatInTimeZone(
        occurrenceDateUtc,
        timeZone,
        'yyyy-MM-dd',
      );
      const rruleLocalTime = formatInTimeZone(
        occurrenceDateUtc,
        timeZone,
        'HH:mm:ss',
      );

      // Get the expected local time from the template event
      const templateLocalTime = formatInTimeZone(
        updatedTemplateEvent.startDate,
        timeZone,
        'HH:mm:ss',
      );

      // Combine the RRule date with the template's local time
      const localDateTime = `${rruleLocalDate}T${templateLocalTime}`;

      // Convert to UTC using the timezone (this handles DST correctly)
      const startDateUtc = fromZonedTime(localDateTime, timeZone);

      // Calculate end date using duration from template
      const durationMs = updatedTemplateEvent.endDate
        ? updatedTemplateEvent.endDate.getTime() -
          updatedTemplateEvent.startDate.getTime()
        : 60 * 60 * 1000; // 1 hour default

      const endDateUtc = new Date(startDateUtc.getTime() + durationMs);

      this.logger.debug('[materializeOccurrence] DST-aware date calculation', {
        occurrenceDate,
        occurrenceDateUtc: occurrenceDateUtc.toISOString(),
        rruleLocalDate,
        rruleLocalTime,
        templateLocalTime,
        localDateTime,
        startDateUtc: startDateUtc.toISOString(),
        endDateUtc: endDateUtc.toISOString(),
        timeZone,
      });

      // Create a properly typed CreateEventDto object
      const createDto: CreateEventDto = {
        name: updatedTemplateEvent.name,
        description: updatedTemplateEvent.description || '',
        startDate: startDateUtc,
        endDate: endDateUtc,
        type: updatedTemplateEvent.type,
        location: updatedTemplateEvent.location,
        lat: updatedTemplateEvent.lat,
        lon: updatedTemplateEvent.lon,
        locationOnline: updatedTemplateEvent.locationOnline || '',
        maxAttendees: updatedTemplateEvent.maxAttendees || 0,
        requireApproval: updatedTemplateEvent.requireApproval,
        approvalQuestion: updatedTemplateEvent.approvalQuestion || '',
        requireGroupMembership: updatedTemplateEvent.requireGroupMembership,
        allowWaitlist: updatedTemplateEvent.allowWaitlist,
        status: updatedTemplateEvent.status,
        visibility: updatedTemplateEvent.visibility,
        categories: updatedTemplateEvent.categories?.map((cat) => cat.id) || [],
        seriesSlug: expectedSeriesSlug,
        // Fix the group structure
        group: updatedTemplateEvent.group
          ? { id: updatedTemplateEvent.group.id }
          : undefined,
        // Copy the image directly
        image: updatedTemplateEvent.image,
        // Copy RFC fields
        securityClass: updatedTemplateEvent.securityClass,
        priority: updatedTemplateEvent.priority,
        isAllDay: updatedTemplateEvent.isAllDay,
        blocksTime: updatedTemplateEvent.blocksTime,
        resources: updatedTemplateEvent.resources,
        color: updatedTemplateEvent.color,
        conferenceData: updatedTemplateEvent.conferenceData,
        // Use series timezone instead of hardcoding UTC
        timeZone: series.timeZone || 'UTC',
      };

      this.logger.debug(
        `Creating materialized occurrence with seriesSlug: ${createDto.seriesSlug}`,
      );

      // Create the occurrence
      const materializedEvent = await this.eventManagementService.create(
        createDto,
        userId,
      );

      // Verify that the seriesSlug was preserved - but do not attempt to restore it
      if (!materializedEvent.seriesSlug) {
        this.logger.error(
          `[SERIES_SLUG_LOST] seriesSlug is null on materialized event ${materializedEvent.slug}`,
        );
      } else if (materializedEvent.seriesSlug !== expectedSeriesSlug) {
        this.logger.error(
          `[SERIES_SLUG_LOST] seriesSlug has incorrect value on materialized event. Expected: ${expectedSeriesSlug}, Got: ${materializedEvent.seriesSlug}`,
        );
      } else {
        this.logger.debug(
          `SeriesSlug correctly preserved on materialized event ${materializedEvent.slug}: ${materializedEvent.seriesSlug}`,
        );
      }

      return materializedEvent;
    } catch (error) {
      this.logger.error(
        `Error materializing occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Utility method to validate slug parameters
   * @throws BadRequestException for invalid slugs
   */
  private validateSlug(slug: string): void {
    if (!slug || slug === 'null' || slug === 'undefined') {
      throw new BadRequestException('Invalid series slug provided');
    } else {
      this.logger.debug(`Validated slug: ${slug}`);
    }
  }

  /**
   * Get upcoming occurrences for a series
   *
   * This is a READ-ONLY method that returns both materialized and unmaterialized occurrences.
   * It doesn't create any new events in the database - it just returns what's already there,
   * plus calculated future occurrences based on the recurrence pattern.
   *
   * If you need to ensure events are created in the database, use materializeNextNOccurrences
   * after calling this method.
   *
   * @param seriesSlug The slug of the series
   * @param count Maximum number of occurrences to return
   * @param includePast Whether to include past occurrences
   * @param tenantId Optional tenant ID
   * @returns Array of occurrences
   */
  @Trace('event-series-occurrence.getUpcomingOccurrences')
  async getUpcomingOccurrences(
    seriesSlug: string,
    count = 10,
    includePast = false,
    tenantId?: string,
  ): Promise<OccurrenceResult[]> {
    try {
      // Validate input
      this.validateSlug(seriesSlug);

      const startTime = Date.now();
      await this.initializeRepository(tenantId);

      // Set a reasonable timeout for the entire operation
      const timeoutMs = 5000;

      // Create a logger function to track performance
      const logStep = (message: string) => {
        const elapsed = Date.now() - startTime;
        this.logger.debug(`PERF [${elapsed}ms]: ${message}`);
      };

      // Use a promise with timeout to prevent hanging
      const timeoutPromise = new Promise<OccurrenceResult[]>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout: Operation took too long to process'));
        }, timeoutMs);
      });

      // Main work promise
      const workPromise = this._getUpcomingOccurrencesInternal(
        seriesSlug,
        count,
        includePast,
        tenantId,
        logStep,
        startTime,
      );

      // Race the promises to ensure we don't hang
      const result = await Promise.race([timeoutPromise, workPromise]);

      // Return the results without attempting to materialize anything
      return result;
    } catch (error) {
      this.logger.error(
        `Error getting occurrences for series ${seriesSlug}: ${error.message}`,
        error.stack,
      );

      // Return a minimal response instead of throwing
      return [
        {
          date: new Date().toISOString(),
          materialized: false,
          error: `Failed to get occurrences: ${error.message}`,
        },
      ];
    }
  }

  // Internal method that does the actual work of getting upcoming occurrences
  private async _getUpcomingOccurrencesInternal(
    seriesSlug: string,
    count = 10,
    includePast = false,
    tenantId?: string,
    logStep?: (message: string) => void,
    startTime?: number,
  ): Promise<OccurrenceResult[]> {
    // Initialize logger function
    const log = logStep || ((message: string) => this.logger.debug(message));
    const effectiveStartTime = startTime || Date.now();

    try {
      // 1. Get the event series
      log('Getting event series');
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );
      if (!series) {
        throw new NotFoundException(`Series with slug ${seriesSlug} not found`);
      }

      // 2. Determine if recurrence rule has a count limit
      const recurrenceRuleCount = series.recurrenceRule?.count || 0;

      // If the recurrence rule has a count, respect it as the maximum
      const effectiveCount =
        recurrenceRuleCount > 0
          ? Math.min(count, recurrenceRuleCount)
          : Math.min(count, 50); // Safety cap at 50

      // 3. Determine timezone and date range
      const effectiveTimeZone = series.timeZone || 'UTC';
      log(`Using timezone: ${effectiveTimeZone}`);

      // Get the start of today in the effective timezone
      const today = startOfDay(
        this.convertToTimeZone(new Date(), effectiveTimeZone),
      );

      // Calculate start date for searching (today or in the past)
      const startDate = includePast
        ? (() => {
            // For past dates, look back 3 months
            const threeMonthsAgo = new Date(today);
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            return threeMonthsAgo;
          })()
        : today;

      // 4. Find existing events for this series
      log('Finding existing events');
      let existingOccurrences: EventEntity[] = [];
      try {
        const queryLimit = Math.min(effectiveCount * 2, 20); // Reasonable limit to prevent memory issues
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(
            seriesSlug,
            { page: 1, limit: queryLimit },
            tenantId || this.request.tenantId,
          );
        existingOccurrences = events;
        log(`Found ${existingOccurrences.length} existing events`);
      } catch (error) {
        this.logger.error(`Database query failed: ${error.message}`);
        existingOccurrences = []; // Continue with empty results
      }

      // 5. Get template event for this series
      log('Getting template event');
      let templateEvent: EventEntity | null = null;

      // First, try to find by templateEventSlug if available
      if (series.templateEventSlug) {
        try {
          templateEvent = await this.eventQueryService.findEventBySlug(
            series.templateEventSlug,
          );
          log(`Found template: ${templateEvent?.slug || 'null'}`);
        } catch (error) {
          this.logger.warn(`Template event lookup error: ${error.message}`);
        }
      }

      // If no template found by slug, use the most recent event
      if (!templateEvent && existingOccurrences.length > 0) {
        const sortedEvents = [...existingOccurrences].sort(
          (a, b) =>
            new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
        );
        templateEvent = sortedEvents[0];
        log(`Using most recent event as template: ${templateEvent.slug}`);
      }

      // 6. Determine effective start date for recurrence pattern
      let effectiveStartDate: Date;
      if (templateEvent?.startDate) {
        effectiveStartDate = new Date(templateEvent.startDate);
      } else {
        // Fallback to series creation date
        effectiveStartDate = new Date(series.createdAt);
        this.logger.warn(
          `No template event found. Using series created date: ${effectiveStartDate.toISOString()}`,
        );
      }

      // 7. Generate occurrence dates from recurrence pattern
      log('Generating occurrences from pattern');
      let generatedDates: string[] = [];
      try {
        generatedDates =
          await this.recurrencePatternService.generateOccurrences(
            effectiveStartDate,
            series.recurrenceRule as RecurrenceRule,
            {
              timeZone: effectiveTimeZone,
              count: Math.min(effectiveCount * 2, 20), // Cap count for performance
              startAfterDate: startDate,
            },
          );
        log(`Generated ${generatedDates.length} dates`);
      } catch (error) {
        this.logger.error(`Failed to generate dates: ${error.message}`);
        return [
          {
            date: new Date().toISOString(),
            materialized: false,
            error: `Failed to generate occurrences: ${error.message}`,
          },
        ];
      }

      // 8. Map dates to results
      log('Mapping dates to results');
      const results: OccurrenceResult[] = [];

      // Convert all generated dates to Date objects first
      const allDates = generatedDates.map((date) => new Date(date));

      // Track events that have been included already
      const includedEventIds = new Set<number>();

      // FIRST: Always add the template event if it exists, regardless of date or pattern
      if (templateEvent) {
        log(
          'Adding template event to results (this should always be included)',
        );
        results.push({
          date: templateEvent.startDate.toISOString(),
          event: templateEvent,
          materialized: true,
        });
        includedEventIds.add(templateEvent.id);
      }

      // SECOND: Include ALL existing events from the series upfront, regardless of date
      // This ensures any manually added events or one-off events are always included
      for (const event of existingOccurrences) {
        if (!includedEventIds.has(event.id)) {
          log(
            `Adding existing series event upfront: ${event.slug} (${event.startDate})`,
          );
          results.push({
            date: event.startDate.toISOString(),
            event: event,
            materialized: true,
          });
          includedEventIds.add(event.id);
        }
      }

      // THIRD: Match generated dates with existing events or add as unmaterialized
      for (const date of allDates) {
        // Check for execution time limit
        if (Date.now() - effectiveStartTime > 15000) {
          this.logger.warn(
            'Execution time limit exceeded, returning partial results',
          );
          break;
        }

        // Skip dates that already have an event (added above)
        const existingEvent = existingOccurrences.find((event) =>
          this.isSameDay(event.startDate, date, effectiveTimeZone),
        );

        if (existingEvent) {
          // If we already added this event above, skip it
          if (includedEventIds.has(existingEvent.id)) {
            continue;
          }

          // Otherwise add it now
          results.push({
            date: date.toISOString(),
            event: existingEvent,
            materialized: true,
          });
          includedEventIds.add(existingEvent.id);
        } else {
          // No materialized event yet for this date from the pattern
          results.push({
            date: date.toISOString(),
            materialized: false,
          });
        }
      }

      // 10. Sort and limit results
      if (includePast) {
        // Sort by date ascending
        results.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      }

      // IMPORTANT: Prioritize materialized events, especially the template event and manually added events
      // Split results into materialized and unmaterialized
      const materializedResults = results.filter((r) => r.materialized);
      const unmaterializedResults = results.filter((r) => !r.materialized);

      // Always include all materialized events, and fill the rest with unmaterialized
      // up to the effective count, but never exclude materialized events
      const limitedResults = [
        ...materializedResults,
        ...unmaterializedResults.slice(
          0,
          Math.max(0, effectiveCount - materializedResults.length),
        ),
      ];

      const totalTime = Date.now() - effectiveStartTime;
      log(
        `Completed in ${totalTime}ms, returning ${limitedResults.length} occurrences`,
      );

      return limitedResults;
    } catch (error) {
      this.logger.error(
        `Error in _getUpcomingOccurrencesInternal: ${error.message}`,
        error.stack,
      );

      // Return minimal error result
      return [
        {
          date: new Date().toISOString(),
          materialized: false,
          error: `Internal error: ${error.message}`,
        },
      ];
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
    tenantId?: string,
  ): Promise<EventEntity | undefined> {
    try {
      // Check if the seriesSlug is null or "null" string
      this.validateSlug(seriesSlug);

      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      // Check if any events exist in this series
      const [existingEvents] =
        await this.eventManagementService.findEventsBySeriesSlug(
          seriesSlug,
          {
            page: 1,
            limit: 1,
          },
          tenantId,
        );

      // If the series has no events (possibly due to template deletion),
      // create new ones automatically
      if (existingEvents.length === 0) {
        this.logger.warn(
          `Series ${seriesSlug} has no materialized events. Auto-materializing...`,
        );

        // Create at least 2 events
        const materializedEvents = await this.materializeNextNOccurrences(
          seriesSlug,
          userId,
          false,
          tenantId,
        );

        if (materializedEvents.length > 0) {
          return materializedEvents[0];
        }
      }

      // Standard behavior: Get upcoming occurrences
      const upcomingOccurrences = await this.getUpcomingOccurrences(
        seriesSlug,
        5,
        false,
        tenantId,
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
      return this.materializeOccurrence(
        seriesSlug,
        nextToCreate.date,
        userId,
        tenantId,
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
   * Materialize the next N occurrences of a series
   *
   * This method explicitly creates database records for future occurrences.
   * Unlike getUpcomingOccurrences (which only returns what would occur),
   * this method actually creates the events in the database.
   *
   * Use this when you need to ensure future events exist as concrete database records.
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
    tenantId?: string,
  ): Promise<EventEntity[]> {
    try {
      // Check if the seriesSlug is null or "null" string
      this.validateSlug(seriesSlug);

      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      this.logger.debug('Starting to materialize next occurrences for series', {
        seriesSlug,
        userId,
        isBlueskyEvent,
      });

      // Configure how many occurrences to materialize
      let count = isBlueskyEvent
        ? this.materializationConfig.blueskyEventCount
        : 2; // Default to 2 for standard operations

      // Get the series to check if it has a recurrence rule with count
      try {
        const series = await this.eventSeriesService.findBySlug(
          seriesSlug,
          tenantId,
        );
        if (
          series?.recurrenceRule?.count &&
          series.recurrenceRule.count > count
        ) {
          // Use the count from the recurrence rule if greater than our default
          count = series.recurrenceRule.count;
          this.logger.debug(`Using recurrence rule count of ${count}`);
        }
      } catch (error) {
        // Log but continue with default count
        this.logger.warn(
          `Could not get recurrence rule count: ${error.message}`,
        );
      }

      // Get upcoming occurrences (both materialized and unmaterialized)
      const upcomingOccurrences = await this.getUpcomingOccurrences(
        seriesSlug,
        count * 2, // Get more than we need to ensure we have enough unmaterialized
        false,
        tenantId,
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
            tenantId,
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
   * @param tenantId - The tenant ID to materialize events for
   * @returns Number of events materialized
   */
  @Trace('event-series-occurrence.bufferBlueskyMaterialization')
  async bufferBlueskyMaterialization(
    userId: number,
    tenantId?: string,
  ): Promise<number> {
    try {
      this.logger.debug(
        'Starting buffered materialization for Bluesky events',
        { userId },
      );

      // Get Bluesky event series for the user
      const { data: userSeries } = await this.eventSeriesService.findByUser(
        userId,
        {
          page: 1,
          limit: 100,
          sourceType: 'bluesky', // Only get Bluesky series
        },
        tenantId, // Pass tenant ID explicitly
      );

      if (!userSeries || !userSeries.length) {
        this.logger.debug('No Bluesky series found for user', { userId });
        return 0;
      }

      this.logger.debug('Found Bluesky event series for user', {
        userId,
        count: userSeries.length,
      });

      let totalMaterialized = 0;

      // Process only the 2 most recent series to ensure we don't overload memory
      // This is a compromise between functionality and memory usage
      const recentSeries = userSeries.slice(0, 2);

      // Process each series to ensure it has the required number of materialized occurrences
      for (const series of recentSeries) {
        try {
          const materializedEvents = await this.materializeNextNOccurrences(
            series.slug,
            userId,
            true, // This is a Bluesky event
          );

          totalMaterialized += materializedEvents.length;

          // Brief pause between series to allow garbage collection
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (seriesError) {
          // Log but continue with other series
          this.logger.error(
            `Error materializing series ${series.slug}: ${seriesError.message}`,
            seriesError.stack,
          );
        }
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
      // Return 0 instead of throwing to avoid propagating errors
      return 0;
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

      // Explicitly preserve the seriesSlug to prevent it from being lost during update
      templateUpdates.seriesSlug = seriesSlug;

      // Also set the series relationship directly
      templateUpdates.series = series;

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
            // Set the series property directly for the relationship
            series: series,
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
    tenantId?: string,
  ): Promise<EventEntity> {
    try {
      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      // Get the occurrence for this date (or create one if needed)
      const occurrence = await this.findOccurrence(seriesSlug, date, tenantId);

      if (occurrence) {
        return occurrence;
      }

      // If no materialized occurrence exists, find the series and check if the date is valid
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );
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
   * @param _formatStr The format string to use
   * @returns A formatted date string
   */
  private formatInTimeZone(
    date: Date | string,
    timeZone: string,
    _formatStr = 'yyyy-MM-dd',
  ): string {
    const parsedDate = typeof date === 'string' ? parseISO(date) : date;
    return format(toZonedTime(parsedDate, timeZone), 'yyyy-MM-dd');
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

  async findEventsBySeriesSlug(
    seriesSlug: string,
    includePast = false,
    onlyPast = false,
    tenantId?: string,
  ): Promise<EventEntity[]> {
    this.logger.debug(
      'About to query database for events in series ' + seriesSlug,
    );

    try {
      // Always initialize repository with tenantId from param or request
      const effectiveTenantId = tenantId || this.request?.tenantId;

      // Use the event management service to find events by series
      // This maintains proper service layer boundaries
      const [events] = await this.eventManagementService.findEventsBySeriesSlug(
        seriesSlug,
        { page: 1, limit: 1000 }, // Use a large limit to get all events
        effectiveTenantId,
      );

      // Apply date filters based on parameters
      const today = new Date();
      let filteredEvents = events;

      if (!includePast && !onlyPast) {
        // Only future events
        filteredEvents = events.filter((event) => event.startDate >= today);
      } else if (onlyPast) {
        // Only past events
        filteredEvents = events.filter((event) => event.startDate < today);
      }
      // If includePast is true without onlyPast, we include all events

      // Sort events by start date
      filteredEvents.sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      );

      return filteredEvents;
    } catch (error) {
      this.logger.error(
        `Error in findEventsBySeriesSlug: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }
}
