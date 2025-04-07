import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EventSeriesRepository,
  EVENT_SERIES_REPOSITORY,
} from '../interfaces/event-series-repository.interface';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { UpdateEventSeriesDto } from '../dto/update-event-series.dto';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { Trace } from '../../utils/trace.decorator';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { CreateEventDto } from '../../event/dto/create-event.dto';
import { EventQueryService } from '../../event/services/event-query.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';

@Injectable()
export class EventSeriesService {
  private readonly logger = new Logger(EventSeriesService.name);

  constructor(
    @Inject(EVENT_SERIES_REPOSITORY)
    private readonly eventSeriesRepository: EventSeriesRepository,
    private readonly recurrencePatternService: RecurrencePatternService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  /**
   * Initialize a repository for the EventEntity for direct updates
   * This avoids having to use EventQueryService for updates
   */
  @Trace('event-series.initializeRepository')
  private async initializeRepository() {
    // We don't need to store this as a class property since we only use it in one method
    // This avoids holding a reference to the repository between requests
  }

  /**
   * Create a new event series
   */
  @Trace('event-series.create')
  async create(
    createEventSeriesDto: CreateEventSeriesDto,
    userId: number,
  ): Promise<EventSeriesEntity> {
    try {
      // Validate the recurrence rule
      this.validateRecurrenceRule(createEventSeriesDto.recurrenceRule);

      // Generate a human-readable description of the recurrence pattern
      const recurrenceDescription = this.generateRecurrenceDescription(
        createEventSeriesDto.recurrenceRule,
      );

      // <<< START NEW LOGIC: Default Template Creation >>>
      let templateSlugToLink: string | undefined =
        createEventSeriesDto.templateEventSlug;

      if (!templateSlugToLink) {
        this.logger.debug(
          'No templateEventSlug provided, creating default template event.',
        );
        // Construct DTO for the default template event
        const defaultTemplateDto: CreateEventDto = {
          name: createEventSeriesDto.name, // Use series name
          description: createEventSeriesDto.description || '', // Use series description
          startDate: new Date(), // Placeholder - This might need refinement
          endDate: new Date(Date.now() + 3600000), // Placeholder - 1 hour duration
          // Provide hardcoded defaults for fields not on CreateEventSeriesDto
          timeZone: 'UTC', // Default timezone
          type: 'in-person', // Default type
          location: '', // Default location
          locationOnline: '',
          maxAttendees: 0, // Default max attendees
          requireApproval: false, // Default approval setting
          approvalQuestion: '',
          allowWaitlist: false, // Default waitlist setting
          categories: [], // Default categories
        };

        // Create the default template event
        const defaultTemplateEvent = await this.eventManagementService.create(
          defaultTemplateDto,
          userId,
        );
        templateSlugToLink = defaultTemplateEvent.slug;
        this.logger.debug(
          `Default template event created with slug: ${templateSlugToLink}`,
        );
      }
      // <<< END NEW LOGIC >>>

      // Create a complete entity including the user relation
      const eventSeriesData = {
        name: createEventSeriesDto.name,
        description: createEventSeriesDto.description || '',
        slug: createEventSeriesDto.slug || '',
        recurrenceRule: createEventSeriesDto.recurrenceRule,
        recurrenceDescription,
        user: { id: userId } as any,
        group: createEventSeriesDto.groupId
          ? ({ id: createEventSeriesDto.groupId } as any)
          : null,
        image: createEventSeriesDto.imageId
          ? ({ id: createEventSeriesDto.imageId } as any)
          : undefined,
        sourceType: createEventSeriesDto.sourceType,
        sourceId: createEventSeriesDto.sourceId,
        sourceUrl: createEventSeriesDto.sourceUrl,
        sourceData: createEventSeriesDto.sourceData,
        matrixRoomId: createEventSeriesDto.matrixRoomId,
        templateEventSlug: templateSlugToLink, // Use the determined slug
      };

      // Use the repository's create method to initialize the entity
      const eventSeries =
        await this.eventSeriesRepository.create(eventSeriesData);

      // Save the series first to ensure it has an ID
      const savedSeries = await this.eventSeriesRepository.save(eventSeries);

      // IMPORTANT FIX: Link the template event to the series if it exists
      if (templateSlugToLink) {
        try {
          this.logger.debug(
            `Linking template event ${templateSlugToLink} to series ${savedSeries.slug}`,
          );

          // Get the template event
          const templateEvent =
            await this.eventQueryService.findEventBySlug(templateSlugToLink);

          if (templateEvent) {
            // Update the template event to link it to the series
            await this.eventManagementService.update(
              templateSlugToLink,
              {
                seriesSlug: savedSeries.slug,
              },
              userId,
            );

            this.logger.debug(
              `Successfully linked template event ${templateSlugToLink} to series ${savedSeries.slug}`,
            );
          } else {
            this.logger.warn(
              `Template event with slug ${templateSlugToLink} not found for linking to series`,
            );
          }
        } catch (error) {
          // Log the error but don't fail the whole operation
          this.logger.error(
            `Error linking template event to series: ${error.message}`,
            error.stack,
          );
        }
      }

      // Return the full entity with relations - use findById as defined in the interface
      const foundSeries = await this.eventSeriesRepository.findById(
        savedSeries.id,
      );
      if (!foundSeries) {
        throw new Error(
          `Failed to find event series with id ${savedSeries.id} after creation`,
        );
      }
      return foundSeries;
    } catch (error) {
      this.logger.error(
        `Error creating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create a new event series from an existing event
   */
  @Trace('event-series.createFromExistingEvent')
  async createFromExistingEvent(
    eventSlug: string,
    recurrenceRule: any,
    userId: number,
    name?: string,
    description?: string,
    timeZone?: string,
  ): Promise<EventSeriesEntity> {
    try {
      this.logger.debug('Starting createFromExistingEvent', {
        eventSlug,
        userId,
        recurrenceRule,
        name,
        description,
        timeZone,
      });

      // Find the existing event
      this.logger.debug(`[Promote Debug] Finding event by slug: ${eventSlug}`);
      const event = await this.eventQueryService.findEventBySlug(eventSlug);

      if (!event) {
        this.logger.debug(
          `[Promote Debug] Event ${eventSlug} NOT FOUND by eventQueryService`,
        );
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      this.logger.debug(
        `[Promote Debug] Found event ${eventSlug} with ID ${event.id}`,
      );

      // Check if the event is already part of a series
      if (event.seriesSlug) {
        this.logger.error(
          `[Promote Debug] Event ${eventSlug} is already part of series ${event.seriesSlug}`,
        );
        throw new BadRequestException(
          `Event ${eventSlug} is already part of a series`,
        );
      }
      this.logger.debug(
        `[Promote Debug] Event ${eventSlug} is not part of a series yet.`,
      );

      // Create a new series entity
      this.logger.debug('[Promote Debug] Creating new series entity');
      const series = new EventSeriesEntity();
      series.name = name || event.name;
      series.description = description || event.description;
      series.recurrenceRule = recurrenceRule;
      series.user = { id: userId } as any;
      series.recurrenceDescription =
        this.generateRecurrenceDescription(recurrenceRule);
      series.timeZone = timeZone || 'UTC';

      // Set the template event slug before saving
      this.logger.debug('Setting template event slug');
      series.templateEventSlug = event.slug;

      // Save the series with all properties set
      this.logger.debug('[Promote Debug] Saving new series');
      const savedSeries = await this.eventSeriesRepository.save(series);
      this.logger.debug(
        `[Promote Debug] Series saved with ID ${savedSeries.id} and slug ${savedSeries.slug}`,
      );

      // Update the existing event to be part of the series - this is critical
      this.logger.debug(
        `[Promote Debug] Attempting to link event ${eventSlug} to series ${savedSeries.slug}`,
      );

      // Link the original event to the new series
      this.logger.debug(
        `[Promote Debug] Re-fetching event ${eventSlug} before linking`,
      );
      const eventToLink =
        await this.eventQueryService.findEventBySlug(eventSlug);
      if (!eventToLink) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      this.logger.debug(
        `[Promote Debug] Event ${eventSlug} ready for linking. Current seriesSlug: ${eventToLink.seriesSlug}`,
      );

      try {
        // Directly update the event in the database to avoid circular dependencies
        // Since EventQueryService doesn't have an update method, we need to use the repository directly
        await this.initializeRepository();

        // Manually construct a repository for the EventEntity
        const tenantId = this.request.tenantId;
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(tenantId);
        const eventRepository = dataSource.getRepository(EventEntity);

        // Update event directly with seriesSlug
        // We need a full entity to update with TypeORM
        const eventToUpdate = await eventRepository.findOne({
          where: { id: eventToLink.id },
        });
        if (eventToUpdate) {
          eventToUpdate.seriesSlug = savedSeries.slug;
          // isRecurring property isn't actually on the entity, it was part of a DTO
          await eventRepository.save(eventToUpdate);
        }

        this.logger.log(
          `[Promote Debug] Successfully linked event ${eventSlug} (ID: ${eventToLink.id}) to series ${savedSeries.slug} (ID: ${savedSeries.id})`,
        );
      } catch (updateError) {
        this.logger.error(
          `[Promote Debug] Error linking event ${eventSlug} to series: ${updateError.message}`,
          updateError.stack,
        );
        // Continue despite the error - at least the series was created
      }

      this.logger.debug(
        `[Promote Debug] Finished linking process for event ${eventSlug}.`,
      );

      // Generate future occurrences based on the recurrence rule
      this.logger.debug(
        '[Promote Debug] Generating future occurrences (post-linking)',
      );
      const maxOccurrences = 5;
      const recurrencePattern = this.recurrencePatternService
        .generateOccurrences(event.startDate, recurrenceRule, {
          timeZone: series.timeZone,
        })
        .map((date) => new Date(date))
        .slice(0, maxOccurrences);
      this.logger.debug('Generated occurrence pattern', {
        count: recurrencePattern.length,
        dates: recurrencePattern.map((d) => d.toISOString()),
        timeZone: series.timeZone,
      });

      // Create future occurrences in smaller batches
      const batchSize = 2;
      for (let i = 0; i < recurrencePattern.length; i += batchSize) {
        const batch = recurrencePattern.slice(i, i + batchSize);
        this.logger.debug('Processing batch of occurrences', {
          batchIndex: i,
          batchSize: batch.length,
          dates: batch.map((d) => d.toISOString()),
        });

        await Promise.all(
          batch.map(async (occurrenceDate) => {
            // Check if occurrence already exists
            const existingOccurrence =
              await this.eventQueryService.findEventByDateAndSeries(
                occurrenceDate,
                savedSeries.slug,
              );

            if (existingOccurrence) {
              this.logger.debug(
                'Occurrence already exists, skipping creation',
                {
                  date: occurrenceDate.toISOString(),
                  slug: existingOccurrence.slug,
                },
              );
              return;
            }

            // Create a new occurrence with a timeout
            try {
              this.logger.debug('Creating occurrence', {
                date: occurrenceDate.toISOString(),
              });
              await Promise.race([
                this.eventManagementService.createSeriesOccurrence(
                  {
                    name: event.name,
                    description: event.description,
                    startDate: occurrenceDate,
                    endDate: event.endDate
                      ? new Date(
                          occurrenceDate.getTime() +
                            (event.endDate.getTime() -
                              event.startDate.getTime()),
                        )
                      : undefined,
                    type: event.type,
                    location: event.location,
                    locationOnline: event.locationOnline,
                    maxAttendees: event.maxAttendees,
                    requireApproval: event.requireApproval,
                    approvalQuestion: event.approvalQuestion,
                    allowWaitlist: event.allowWaitlist,
                    categories: event.categories.map((cat) => cat.id),
                    seriesSlug: savedSeries.slug,
                  },
                  userId,
                  savedSeries.slug,
                  occurrenceDate,
                ),
                new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error('Operation timed out')),
                    5000,
                  ),
                ),
              ]);
              this.logger.debug('Occurrence created successfully');
            } catch (error) {
              this.logger.error(
                `Failed to create occurrence for date ${occurrenceDate}: ${error.message}`,
              );
              // Continue with next occurrence even if one fails
            }
          }),
        );
      }

      // Return the complete entity after updates
      this.logger.debug('Finding complete series entity after updates');
      const updatedSeries = await this.eventSeriesRepository.findById(
        savedSeries.id,
      );

      if (!updatedSeries) {
        this.logger.error(`Series ${savedSeries.slug} not found after update.`);
        throw new Error(`Series ${savedSeries.slug} not found after update.`);
      }

      this.logger.debug('Series creation completed successfully', {
        seriesId: updatedSeries.id,
        seriesSlug: updatedSeries.slug,
        templateEventSlug: updatedSeries.templateEventSlug,
      });

      return updatedSeries;
    } catch (error) {
      this.logger.error(
        `Error creating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Update an event series
   */
  @Trace('event-series.update')
  async update(
    slug: string,
    updateEventSeriesDto: UpdateEventSeriesDto,
    userId: number,
  ): Promise<EventSeriesEntity> {
    try {
      // Find the series by slug
      const series = await this.findBySlug(slug);

      // Check if user has permission to update the series
      if (series.user.id !== userId) {
        throw new UnauthorizedException(
          'You do not have permission to update this series',
        );
      }

      // If recurrence rule is provided, validate it
      if (updateEventSeriesDto.recurrenceRule) {
        this.validateRecurrenceRule(updateEventSeriesDto.recurrenceRule);
      }

      // Create an update object with the user relationship properly set
      const updateData = {
        ...updateEventSeriesDto,
        // Ensure the user relationship is maintained
        user: { id: userId } as any,
      };

      this.logger.log(
        `About to update series ${series.slug} with data: ${JSON.stringify(
          updateData,
        )}`,
      );

      const updatedSeries = await this.eventSeriesRepository.save({
        ...series,
        ...updateData,
      });

      this.logger.log(
        `Series update successful, re-fetching: ${updatedSeries.id}`,
      );

      // Re-fetch to ensure all relations are loaded correctly after save
      const reFetchedSeries = await this.eventSeriesRepository.findById(
        updatedSeries.id,
      );

      if (!reFetchedSeries) {
        this.logger.error(
          `Series ${updatedSeries.slug} not found after update.`,
        );
        throw new Error(`Series ${updatedSeries.slug} not found after update.`);
      }

      this.logger.log(
        `Successfully updated series ${reFetchedSeries.slug} and template event ${reFetchedSeries.templateEventSlug}`,
      );

      return reFetchedSeries;
    } catch (error) {
      this.logger.error(
        `Error updating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find an event series by slug
   */
  @Trace('event-series.findBySlug')
  async findBySlug(slug: string): Promise<EventSeriesEntity> {
    try {
      const series = await this.eventSeriesRepository.findBySlug(slug);
      if (!series) {
        throw new NotFoundException(`Event series with slug ${slug} not found`);
      }
      return series;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error finding event series by slug: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all event series
   */
  @Trace('event-series.findAll')
  async findAll(options?: {
    page: number;
    limit: number;
  }): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      const page = options?.page || 1;
      const limit = options?.limit || 10;

      // Use the repository to find all series with pagination
      const [data, total] = await this.eventSeriesRepository.findByUser(null, {
        page,
        limit,
      });

      return { data, total };
    } catch (error) {
      this.logger.error(
        `Error finding all event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find event series by user ID
   */
  @Trace('event-series.findByUser')
  async findByUser(
    userId: number,
    options?: {
      page: number;
      limit: number;
      sourceType?: string; // Add sourceType parameter for filtering Bluesky events
    },
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      const [data, total] = await this.eventSeriesRepository.findByUser(
        userId,
        options,
      );
      return { data, total };
    } catch (error) {
      this.logger.error(
        `Error finding event series by user: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find event series by group ID
   */
  @Trace('event-series.findByGroup')
  async findByGroup(
    groupId: number,
    options?: { page: number; limit: number },
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      const [data, total] = await this.eventSeriesRepository.findByGroup(
        groupId,
        options,
      );
      return { data, total };
    } catch (error) {
      this.logger.error(
        `Error finding event series by group: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete an event series
   */
  @Trace('event-series.delete')
  async delete(
    slug: string,
    userId: number,
    deleteEvents: boolean = false,
  ): Promise<void> {
    try {
      // Find the series by slug
      const series = await this.findBySlug(slug);

      // Check if user has permission to delete the series
      if (series.user.id !== userId) {
        throw new UnauthorizedException(
          'You do not have permission to delete this series',
        );
      }

      if (deleteEvents) {
        // Get all events in the series
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(slug);

        // Use proper event deletion through the event management service
        // which handles proper chat room cleanup
        for (const event of events) {
          try {
            // Use the eventManagementService.remove method which properly handles
            // chat room cleanup through discussionService.cleanupEventChatRooms
            await this.eventManagementService.remove(event.slug);
            this.logger.log(`Successfully deleted event ${event.slug}`);
          } catch (eventDeleteError) {
            this.logger.error(
              `Error deleting event ${event.slug}: ${eventDeleteError.message}`,
              eventDeleteError.stack,
            );
            // Continue with other events despite error
          }
        }
      } else {
        // Remove series association from events
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(slug);
        for (const event of events) {
          await this.eventManagementService.update(
            event.slug,
            { seriesSlug: undefined },
            userId,
          );
        }
      }

      // Delete the series
      await this.eventSeriesRepository.delete(series.id);
    } catch (error) {
      this.logger.error(
        `Error deleting event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Validate a recurrence rule
   */
  private validateRecurrenceRule(recurrenceRule: any): void {
    if (!recurrenceRule) {
      throw new BadRequestException('Recurrence rule is required');
    }

    if (!recurrenceRule.frequency) {
      throw new BadRequestException('Frequency is required in recurrence rule');
    }

    // Validate frequency
    const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
    if (!validFrequencies.includes(recurrenceRule.frequency)) {
      throw new BadRequestException(
        `Invalid frequency: ${recurrenceRule.frequency}. Must be one of: ${validFrequencies.join(
          ', ',
        )}`,
      );
    }

    // Validate interval
    if (recurrenceRule.interval && recurrenceRule.interval < 1) {
      throw new BadRequestException('Interval must be greater than 0');
    }

    // Validate count
    if (recurrenceRule.count && recurrenceRule.count < 1) {
      throw new BadRequestException('Count must be greater than 0');
    }

    // Validate until date if provided
    if (recurrenceRule.until) {
      const untilDate = new Date(recurrenceRule.until);
      if (isNaN(untilDate.getTime())) {
        throw new BadRequestException('Invalid until date');
      }
    }

    // Validate byweekday if provided
    if (recurrenceRule.byweekday) {
      const validDays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      const days = Array.isArray(recurrenceRule.byweekday)
        ? recurrenceRule.byweekday
        : [recurrenceRule.byweekday];

      for (const day of days) {
        if (!validDays.includes(day)) {
          throw new BadRequestException(
            `Invalid weekday: ${day}. Must be one of: ${validDays.join(', ')}`,
          );
        }
      }
    }

    // Validate bymonth if provided
    if (recurrenceRule.bymonth) {
      const months = Array.isArray(recurrenceRule.bymonth)
        ? recurrenceRule.bymonth
        : [recurrenceRule.bymonth];

      for (const month of months) {
        if (month < 1 || month > 12) {
          throw new BadRequestException('Month must be between 1 and 12');
        }
      }
    }

    // Validate bymonthday if provided
    if (recurrenceRule.bymonthday) {
      const days = Array.isArray(recurrenceRule.bymonthday)
        ? recurrenceRule.bymonthday
        : [recurrenceRule.bymonthday];

      for (const day of days) {
        if (day < 1 || day > 31) {
          throw new BadRequestException('Month day must be between 1 and 31');
        }
      }
    }
  }

  /**
   * Generate a human-readable description of a recurrence pattern
   */
  private generateRecurrenceDescription(recurrenceRule: any): string {
    // For complex rules, use a simple description
    if (
      recurrenceRule.byweekday ||
      recurrenceRule.bymonth ||
      recurrenceRule.bymonthday ||
      recurrenceRule.byyearday ||
      recurrenceRule.byweekno ||
      recurrenceRule.bysetpos
    ) {
      return this.simpleRecurrenceDescription(recurrenceRule);
    }

    // For simple rules, generate a human-readable description
    const freq = recurrenceRule.frequency.toLowerCase();
    const interval = recurrenceRule.interval || 1;
    const count = recurrenceRule.count;
    const until = recurrenceRule.until;

    let description = '';

    // Handle frequency and interval
    if (interval === 1) {
      description = `Every ${freq}`;
    } else {
      description = `Every ${interval} ${freq}s`;
    }

    // Add count or until date if specified
    if (count) {
      description += ` (${count} times)`;
    } else if (until) {
      const untilDate = new Date(until);
      description += ` until ${untilDate.toLocaleDateString()}`;
    }

    return description;
  }

  /**
   * Simple implementation of recurrence description
   */
  private simpleRecurrenceDescription(recurrenceRule: any): string {
    const parts: string[] = [];

    // Add frequency
    parts.push(recurrenceRule.frequency.toLowerCase());

    // Add interval if specified
    if (recurrenceRule.interval && recurrenceRule.interval > 1) {
      parts.push(`every ${recurrenceRule.interval}`);
    }

    // Add count if specified
    if (recurrenceRule.count) {
      parts.push(`(${recurrenceRule.count} times)`);
    }

    // Add until date if specified
    if (recurrenceRule.until) {
      const untilDate = new Date(recurrenceRule.until);
      parts.push(`until ${untilDate.toLocaleDateString()}`);
    }

    return parts.join(' ');
  }

  /**
   * Get the full name of a day from its abbreviation
   */
  private getDayName(abbreviation: string): string {
    const days: { [key: string]: string } = {
      MO: 'Monday',
      TU: 'Tuesday',
      WE: 'Wednesday',
      TH: 'Thursday',
      FR: 'Friday',
      SA: 'Saturday',
      SU: 'Sunday',
    };
    return days[abbreviation] || abbreviation;
  }

  // Fix for the event series association when updating past events
  // in the delete method
  @Trace('event-series.updatePastEventForSeriesRemoval')
  private async updatePastEventForSeriesRemoval(
    event: EventEntity,
    userId: number,
  ): Promise<void> {
    try {
      // Update the event to remove the series association - only modify the necessary fields
      await this.eventManagementService.update(
        event.slug,
        {
          seriesSlug: undefined,
        },
        userId,
      );

      this.logger.log(
        `Successfully preserved past event ${event.slug} (ID: ${event.id}) by removing series association`,
      );
    } catch (error) {
      this.logger.error(
        `Error preserving past event ${event.slug} (ID: ${event.id}): ${error.message}`,
      );
      throw error;
    }
  }

  @Trace('event-series.createSeriesOccurrence')
  async createSeriesOccurrence(
    eventData: CreateEventDto,
    userId: number,
    seriesSlug: string,
    occurrenceDate: Date,
  ): Promise<EventEntity> {
    this.logger.debug('Creating series occurrence:', {
      eventData,
      userId,
      seriesSlug,
      occurrenceDate,
    });

    // Get the series by slug
    const series = await this.findBySlug(seriesSlug);
    if (!series) {
      throw new NotFoundException(
        `Event series with slug ${seriesSlug} not found`,
      );
    }

    // Create the event with materialized and seriesSlug set
    const event = await this.eventManagementService.create(
      {
        ...eventData,
        startDate: occurrenceDate,
        seriesSlug,
      },
      userId,
    );

    return event;
  }

  /**
   * @deprecated Use createSeriesOccurrence with slug instead
   */
  @Trace('event-series.createSeriesOccurrenceBySlug')
  async createSeriesOccurrenceBySlug(
    createEventDto: CreateEventDto,
    userId: number,
    seriesSlug: string,
    occurrenceDate: Date,
  ): Promise<EventEntity> {
    return this.createSeriesOccurrence(
      createEventDto,
      userId,
      seriesSlug,
      occurrenceDate,
    );
  }

  /**
   * Associate an existing event with an event series as a one-off occurrence
   */
  @Trace('event-series.associateEventWithSeries')
  async associateEventWithSeries(
    seriesSlug: string,
    eventSlug: string,
    userId: number,
  ): Promise<EventEntity> {
    try {
      // Get the series
      const series = await this.eventSeriesRepository.findBySlug(seriesSlug);
      if (!series) {
        throw new NotFoundException(
          `Event series with slug ${seriesSlug} not found`,
        );
      }

      // Get the event
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Check if the event is already part of a series
      if (event.seriesSlug) {
        throw new BadRequestException(
          `Event ${eventSlug} is already part of a series`,
        );
      }

      // Check if the user has permission to edit both the event and the series
      if (event.user.id !== userId || series.user.id !== userId) {
        throw new BadRequestException(
          'You do not have permission to perform this action',
        );
      }

      // Associate the event with the series
      event.seriesSlug = series.slug;

      // Save the updated event
      const updatedEvent = await this.eventManagementService.update(
        event.slug,
        {
          seriesSlug: series.slug,
        },
        userId,
      );

      return updatedEvent;
    } catch (error) {
      this.logger.error(
        `Error associating event with series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
