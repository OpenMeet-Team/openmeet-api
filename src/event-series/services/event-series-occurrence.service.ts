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
import { toZonedTime } from 'date-fns-tz';
import { startOfDay } from 'date-fns';
import { Connection, Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable({ scope: Scope.REQUEST })
export class EventSeriesOccurrenceService {
  private readonly logger = new Logger(EventSeriesOccurrenceService.name);
  private eventRepository: Repository<EventEntity>;

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
    private readonly connection: Connection,
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
  private async initializeRepository(tenantId?: string) {
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('Tenant ID is required');
    }

    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
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

      // Get the series
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );
      this.logger.debug(
        `Materializing occurrence for series ${seriesSlug} on date ${occurrenceDate}`,
      );

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
        }
      }

      // If still no template event, create a default one
      if (!updatedTemplateEvent) {
        this.logger.warn(
          `No template or events found for series ${seriesSlug}. Creating a new template event.`,
        );
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
          {},
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
        // Create a new FileEntity instance with just the ID to avoid unique constraint violations
        image: updatedTemplateEvent.image
          ? ({ id: updatedTemplateEvent.image.id } as any)
          : undefined,
        seriesSlug: series.slug, // Link to the parent series
        status: updatedTemplateEvent.status, // Preserve the same status as template
        visibility: updatedTemplateEvent.visibility, // Preserve the same visibility
        // Pass Bluesky information if this is a Bluesky event
        sourceType: updatedTemplateEvent.sourceType,
        sourceId: updatedTemplateEvent.sourceId,
        sourceData: updatedTemplateEvent.sourceData,
      };

      this.logger.debug(
        `Creating materialized occurrence with seriesSlug: ${createDto.seriesSlug}`,
      );

      // Log if this is a Bluesky event
      if (updatedTemplateEvent.sourceType === 'bluesky') {
        this.logger.log(
          `Materializing a Bluesky event occurrence from template ${updatedTemplateEvent.slug}`,
          {
            sourceType: updatedTemplateEvent.sourceType,
            sourceId: updatedTemplateEvent.sourceId,
            sourceData: updatedTemplateEvent.sourceData,
          },
        );
      }

      const newOccurrence = await this.eventManagementService.create(
        createDto,
        userId,
        {},
      );

      this.logger.debug(
        `New occurrence created with slug: ${newOccurrence.slug}, seriesSlug: ${newOccurrence.seriesSlug || 'null'}`,
      );

      // If the seriesSlug wasn't properly set, update it explicitly
      if (!newOccurrence.seriesSlug) {
        this.logger.warn(
          `SeriesSlug missing on newly created occurrence ${newOccurrence.slug} - fixing by setting to ${series.slug}`,
        );
        // Fix the missing seriesSlug
        await this.eventManagementService.update(
          newOccurrence.slug,
          { seriesSlug: series.slug },
          userId,
        );
      }

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
        `Occurrence after reload: slug=${updatedOccurrence.slug}, seriesSlug=${updatedOccurrence.seriesSlug || 'null'}, location=${updatedOccurrence.location}`,
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
    count = 10,
    includePast = false,
    tenantId?: string,
  ): Promise<
    Array<{ date: string; event?: EventEntity; materialized: boolean }>
  > {
    this.logger.log(
      `DEBUG START: getUpcomingOccurrences for series ${seriesSlug} (count=${count}, includePast=${includePast})`,
    );
    const startTime = Date.now();

    // Initialize repository with appropriate tenant connection
    await this.initializeRepository(tenantId);

    const logStep = (message: string) => {
      const elapsed = Date.now() - startTime;
      this.logger.log(`DEBUG STEP [${elapsed}ms]: ${message}`);
    };

    // Step 1: Get the series
    logStep('Getting series by slug');
    const series = await this.eventSeriesService.findBySlug(
      seriesSlug,
      tenantId,
    );
    logStep(`Found series: ${series.name}`);

    // Log recurrence rule details to help diagnose issues
    this.logger.log(
      `DEBUG: Series recurrence rule:`,
      JSON.stringify(series.recurrenceRule),
    );

    // Determine the effective timezone early
    const effectiveTimeZone = series.timeZone || 'UTC';
    logStep(`Using timezone: ${effectiveTimeZone}`);

    // Get the start of today relative to the effective timezone
    const today = startOfDay(
      this.convertToTimeZone(new Date(), effectiveTimeZone),
    );
    this.logger.log(
      `DEBUG: Today (in ${effectiveTimeZone}): ${today.toISOString()}`,
    );

    // STEP 2: Find existing events for series
    logStep('Finding existing events for series');

    // Safety cap on count parameter
    const safeCount = Math.min(count, 50); // Prevent excessive queries

    // Add timeout protection for the potentially hanging database query
    let existingOccurrences: EventEntity[] = [];
    try {
      this.logger.log(
        `DEBUG: About to query database for events in series ${seriesSlug}`,
      );

      // Create a timeout promise
      const dbQueryTimeout = new Promise<[EventEntity[], number]>(
        (_, reject) => {
          setTimeout(() => {
            reject(
              new Error('Timeout: Database query for events took too long'),
            );
          }, 10000); // 10 second timeout
        },
      );

      // Create the actual query promise
      const dbQueryPromise = this.eventManagementService.findEventsBySeriesSlug(
        seriesSlug,
        {
          page: 1,
          limit: Math.min(safeCount * 2, 20), // Cap at 20 to prevent memory issues
        },
        tenantId || this.request.tenantId,
      );

      // Race the promises
      this.logger.log(
        `DEBUG: Executing database query with timeout protection`,
      );
      const [events] = await Promise.race([dbQueryTimeout, dbQueryPromise]);

      existingOccurrences = events;
      this.logger.log(
        `DEBUG: Database query completed successfully, found ${existingOccurrences.length} events`,
      );
    } catch (error) {
      this.logger.error(
        `ERROR: Database query failed or timed out: ${error.message}`,
      );
      // Continue with empty results rather than failing completely
      existingOccurrences = [];
    }

    // Log number of existing occurrences
    logStep(`Found ${existingOccurrences.length} existing occurrences`);

    this.logger.log(`DEBUG: Existing occurrences breakdown:`, {
      totalFound: existingOccurrences.length,
      includePast,
      pastEvents: existingOccurrences.filter(
        (event) => new Date(event.startDate) < today,
      ).length,
      futureEvents: existingOccurrences.filter(
        (event) => new Date(event.startDate) >= today,
      ).length,
    });

    // STEP 3: Get template event
    logStep('Getting template event');
    let templateEvent: EventEntity | null = null;

    if (series.templateEventSlug) {
      this.logger.log(
        `DEBUG: Looking for template event with slug ${series.templateEventSlug}`,
      );
      try {
        // Create a timeout promise for template event retrieval
        const templateQueryTimeout = new Promise<EventEntity>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Timeout: Template event query took too long'));
          }, 5000); // 5 second timeout
        });

        // Create the actual query promise
        const templateQueryPromise = this.eventQueryService.findEventBySlug(
          series.templateEventSlug,
        );

        // Race the promises
        this.logger.log(
          `DEBUG: Executing template event query with timeout protection`,
        );
        templateEvent = await Promise.race([
          templateQueryTimeout,
          templateQueryPromise,
        ]);

        logStep(
          `Found template event: ${templateEvent ? templateEvent.slug : 'null'}`,
        );
      } catch (error) {
        this.logger.error(`Failed to find template event: ${error.message}`);
      }
    }

    // If no template event found by slug, try to find any event in the series
    if (!templateEvent && existingOccurrences.length > 0) {
      logStep('No template event found, using most recent event');
      // Sort events by start date descending (most recent first)
      const sortedEvents = [...existingOccurrences].sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      );
      templateEvent = sortedEvents[0]; // Use the most recent event
      if (templateEvent) {
        this.logger.log(
          `DEBUG: Using most recent event (${templateEvent.slug}) as template for series ${seriesSlug}`,
        );
      }
    } else if (!templateEvent) {
      // Simplified recovery path - only try to recover the template if it's critical
      logStep('No template event and no existing events found');
      this.logger.warn(
        `Series ${seriesSlug} has no events and no template. Using series creation date as fallback.`,
      );
    }

    // STEP 4: Determine effective start date
    logStep('Determining effective start date');

    let effectiveStartDate: Date;

    if (templateEvent?.startDate) {
      effectiveStartDate = new Date(templateEvent.startDate);
      this.logger.log(
        `DEBUG: Using template event start date: ${effectiveStartDate.toISOString()}`,
      );
    } else {
      // Fallback: If no template event found, this is likely an issue, but we'll use createdAt as a last resort.
      effectiveStartDate = new Date(series.createdAt);
      this.logger.warn(
        `DEBUG: Template event not found for series ${series.slug}. Falling back to series createdAt: ${effectiveStartDate.toISOString()}`,
      );
    }

    // STEP 5: Determine effective count and date range
    logStep('Setting up date range parameters');

    // Respect the recurrence rule count if it's set and less than requested count
    const recurrenceCount = series.recurrenceRule?.count;
    const effectiveCount =
      recurrenceCount && recurrenceCount < safeCount
        ? recurrenceCount
        : safeCount;

    this.logger.log(`DEBUG: Effective count: ${effectiveCount}`);

    // For past dates, we need to look back further in time
    let startDate = today;

    // Simplified past date handling to reduce memory pressure
    if (includePast) {
      // Use a reasonable static window instead of complex calculations
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      startDate = threeMonthsAgo;

      this.logger.log(
        `DEBUG: Including past dates, starting from: ${startDate.toISOString()}`,
      );
    }

    // STEP 6: Generate occurrence dates - THIS IS LIKELY WHERE HANGING OCCURS
    logStep('About to generate occurrence dates - CRITICAL SECTION');

    this.logger.log(`DEBUG: Generating occurrences with params:`, {
      effectiveStartDate: effectiveStartDate.toISOString(),
      recurrenceRule: JSON.stringify(series.recurrenceRule),
      timeZone: effectiveTimeZone,
      count: Math.min(effectiveCount * 2, 20),
      startAfterDate: startDate.toISOString(),
    });

    // Set a hard timeout for the recurrence pattern generation
    const maxExecutionTime = 5000; // 5 seconds max for pattern generation
    const generationStartTime = Date.now();

    // Generate a limited number of occurrence dates from the recurrence rule
    let generatedDates: string[] = [];

    try {
      // Wrap the potentially problematic call in a timeout
      const timeoutPromise = new Promise<string[]>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout: Generation of occurrences took too long'));
        }, maxExecutionTime);
      });

      const generationPromise = Promise.resolve(
        this.recurrencePatternService.generateOccurrences(
          effectiveStartDate,
          series.recurrenceRule as RecurrenceRule,
          {
            timeZone: effectiveTimeZone,
            count: Math.min(effectiveCount * 2, 20), // Cap at 20 to prevent memory issues
            startAfterDate: startDate,
          },
        ),
      );

      // Race the generation against the timeout
      generatedDates = await Promise.race([timeoutPromise, generationPromise]);

      const generationTime = Date.now() - generationStartTime;
      this.logger.log(
        `DEBUG: Generated ${generatedDates.length} dates in ${generationTime}ms`,
      );
    } catch (error) {
      this.logger.error(
        `ERROR: Occurrence generation failed: ${error.message}`,
      );
      // Return a minimal safe result rather than failing completely
      return [
        {
          date: new Date().toISOString(),
          materialized: false,
          error: `Failed to generate occurrences: ${error.message}`,
        } as any,
      ];
    }

    logStep(`Generated ${generatedDates.length} occurrence dates`);

    // Map the generated dates directly - avoid extra operations
    const allDates = generatedDates.map((date) => new Date(date));

    // STEP 7: Create results by matching dates with events
    logStep('Mapping occurrences to events');

    // Map dates to either existing events or calculated placeholders - with memory optimization
    interface OccurrenceResult {
      date: string;
      event?: EventEntity;
      materialized: boolean;
    }
    const results: OccurrenceResult[] = [];

    for (const date of allDates) {
      // Check for execution time limit
      if (Date.now() - startTime > 20000) {
        // 20 seconds overall limit
        this.logger.warn(
          `DEBUG: Execution time limit exceeded, returning partial results`,
        );
        break;
      }

      // Find an existing event matching this date
      const existingOccurrence = existingOccurrences.find((occurrence) =>
        this.isSameDay(occurrence.startDate, date, effectiveTimeZone),
      );

      // If we have an existing occurrence, it exists in the database already
      if (existingOccurrence) {
        results.push({
          date: date.toISOString(),
          event: existingOccurrence,
          materialized: true, // Determined by whether we have an event object
        });
      } else {
        // All other dates are not yet stored in the database
        results.push({
          date: date.toISOString(),
          materialized: false,
        });
      }
    }

    // STEP 8: Include template event if needed
    logStep('Handling template event inclusion');

    if (templateEvent) {
      const templateDate = new Date(templateEvent.startDate);
      const templateDateStr = templateDate.toISOString();
      const templateIncluded = results.some(
        (result) =>
          (result.event && result.event.id === templateEvent.id) ||
          this.isSameDay(
            new Date(result.date),
            templateDate,
            effectiveTimeZone,
          ),
      );

      if (!templateIncluded && results.length < effectiveCount) {
        results.push({
          date: templateDateStr,
          event: templateEvent,
          materialized: true,
        });
      }
    }

    // STEP 9: Final sorting and limiting
    logStep('Sorting and finalizing results');

    // If includePast is true, sort by date (ascending)
    if (includePast) {
      results.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    }

    // Limit to the requested count to ensure we don't return too many results
    const limitedResults = results.slice(0, effectiveCount);

    const totalTime = Date.now() - startTime;
    this.logger.log(
      `DEBUG END: getUpcomingOccurrences completed in ${totalTime}ms, returning ${limitedResults.length} occurrences`,
    );

    return limitedResults;
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
    tenantId?: string,
  ): Promise<EventEntity[]> {
    try {
      // Initialize repository with appropriate tenant connection
      await this.initializeRepository(tenantId);

      this.logger.debug('Starting to materialize next occurrences for series', {
        seriesSlug,
        userId,
        isBlueskyEvent,
      });

      // Configure how many occurrences to materialize
      const count = isBlueskyEvent
        ? this.materializationConfig.blueskyEventCount
        : 2; // Default to 2 for standard operations

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
            // Explicitly preserve the seriesSlug to prevent it from being lost during update
            seriesSlug: seriesSlug,
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
