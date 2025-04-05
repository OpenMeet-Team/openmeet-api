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

      // Create a complete entity including the user relation
      const eventSeriesData = {
        name: createEventSeriesDto.name,
        description: createEventSeriesDto.description || '',
        slug: createEventSeriesDto.slug || '',
        recurrenceRule: createEventSeriesDto.recurrenceRule,
        recurrenceDescription, // Add the generated human-readable description
        // Important: Set the user relationship using the TypeORM expected format
        user: { id: userId } as any,
        // Include any group if provided
        group: createEventSeriesDto.groupId
          ? ({ id: createEventSeriesDto.groupId } as any)
          : null,
        // Include any image if provided
        image: createEventSeriesDto.imageId
          ? ({ id: createEventSeriesDto.imageId } as any)
          : undefined,
        // Include external source fields if provided
        sourceType: createEventSeriesDto.sourceType,
        sourceId: createEventSeriesDto.sourceId,
        sourceUrl: createEventSeriesDto.sourceUrl,
        sourceData: createEventSeriesDto.sourceData,
        // Include matrix room ID if provided
        matrixRoomId: createEventSeriesDto.matrixRoomId,
      };

      // Use the repository's create method to initialize the entity
      const eventSeries =
        await this.eventSeriesRepository.create(eventSeriesData);

      // Save the series first to ensure it has an ID
      const savedSeries = await this.eventSeriesRepository.save(eventSeries);

      // Create initial template event
      const templateStartDate = new Date(
        createEventSeriesDto.templateEvent.startDate,
      );
      const templateEvent =
        await this.eventManagementService.createSeriesOccurrence(
          {
            name: createEventSeriesDto.name,
            description: createEventSeriesDto.description || '',
            startDate: templateStartDate,
            endDate: createEventSeriesDto.templateEvent.endDate
              ? new Date(createEventSeriesDto.templateEvent.endDate)
              : undefined,
            type: createEventSeriesDto.templateEvent.type,
            location: createEventSeriesDto.templateEvent.location || '',
            locationOnline:
              createEventSeriesDto.templateEvent.locationOnline || '',
            maxAttendees: createEventSeriesDto.templateEvent.maxAttendees || 0,
            requireApproval:
              createEventSeriesDto.templateEvent.requireApproval || false,
            approvalQuestion:
              createEventSeriesDto.templateEvent.approvalQuestion || '',
            allowWaitlist:
              createEventSeriesDto.templateEvent.allowWaitlist || false,
            categories: createEventSeriesDto.templateEvent.categories || [],
            seriesSlug: savedSeries.slug,
          },
          userId,
          savedSeries.slug,
          templateStartDate,
        );

      // Update the series with the template event slug
      savedSeries.templateEventSlug = templateEvent.slug;
      await this.eventSeriesRepository.save(savedSeries);

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
  ): Promise<EventSeriesEntity> {
    try {
      this.logger.debug('Starting createFromExistingEvent', {
        eventSlug,
        userId,
        recurrenceRule,
      });

      // Find the existing event
      this.logger.debug('Finding existing event by slug');
      const event = await this.eventQueryService.findEventBySlug(eventSlug);

      if (!event) {
        this.logger.error(`Event with slug ${eventSlug} not found`);
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Check if the event is already part of a series
      if (event.seriesId) {
        this.logger.error(`Event ${eventSlug} is already part of a series`);
        throw new BadRequestException(
          `Event ${eventSlug} is already part of a series`,
        );
      }

      this.logger.debug('Found existing event', {
        eventId: event.id,
        eventSlug: event.slug,
        seriesId: event.seriesId,
        seriesSlug: event.seriesSlug,
      });

      // Create a new series entity
      this.logger.debug('Creating new series entity');
      const series = new EventSeriesEntity();
      series.name = event.name;
      series.description = event.description;
      series.recurrenceRule = recurrenceRule;
      series.user = { id: userId } as any;
      series.recurrenceDescription =
        this.generateRecurrenceDescription(recurrenceRule);

      // Set the template event slug before saving
      this.logger.debug('Setting template event slug');
      series.templateEventSlug = event.slug;

      // Save the series with all properties set
      this.logger.debug('Saving new series');
      const savedSeries = await this.eventSeriesRepository.save(series);
      this.logger.debug('Series saved', {
        seriesId: savedSeries.id,
        seriesSlug: savedSeries.slug,
      });

      // Update the existing event to be part of the series - this is critical
      this.logger.debug('Updating existing event to be part of series');

      // First check if the event already has a series ID or slug to prevent circular dependencies
      const updatedEvent =
        await this.eventQueryService.findEventBySlug(eventSlug);

      if (!updatedEvent) {
        this.logger.error(
          `Could not find event with slug ${eventSlug} to update series relationship`,
        );
      } else if (updatedEvent.seriesId || updatedEvent.seriesSlug) {
        this.logger.log(
          `Event ${eventSlug} already has series ID ${updatedEvent.seriesId} or slug ${updatedEvent.seriesSlug}, skipping update`,
        );
      } else {
        try {
          // Directly update the event in the database to avoid circular dependencies
          // Since EventQueryService doesn't have an update method, we need to use the repository directly
          await this.initializeRepository();

          // Manually construct a repository for the EventEntity
          const tenantId = this.request.tenantId;
          const dataSource =
            await this.tenantConnectionService.getTenantConnection(tenantId);
          const eventRepository = dataSource.getRepository(EventEntity);

          // Update event directly with seriesId and seriesSlug
          // We need a full entity to update with TypeORM
          const eventToUpdate = await eventRepository.findOne({
            where: { id: updatedEvent.id },
          });
          if (eventToUpdate) {
            eventToUpdate.seriesId = savedSeries.id;
            eventToUpdate.seriesSlug = savedSeries.slug;
            // isRecurring property isn't actually on the entity, it was part of a DTO
            await eventRepository.save(eventToUpdate);
          }

          this.logger.log(
            `Successfully linked event ${eventSlug} (ID: ${updatedEvent.id}) to series ${savedSeries.slug} (ID: ${savedSeries.id})`,
          );
        } catch (updateError) {
          this.logger.error(
            `Error linking event to series: ${updateError.message}`,
            updateError.stack,
          );
          // Continue despite the error - at least the series was created
        }
      }

      this.logger.debug('Event updated to be part of series');

      // Generate future occurrences based on the recurrence rule
      this.logger.debug('Generating future occurrences');
      const maxOccurrences = 5;
      const recurrencePattern = this.recurrencePatternService
        .generateOccurrences(event.startDate, recurrenceRule)
        .map((date) => new Date(date))
        .slice(0, maxOccurrences);
      this.logger.debug('Generated occurrence pattern', {
        count: recurrencePattern.length,
        dates: recurrencePattern.map((d) => d.toISOString()),
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
            // Skip the first occurrence since it's already the original event
            if (occurrenceDate.getTime() === event.startDate.getTime()) {
              this.logger.debug('Skipping first occurrence (original event)');
              return;
            }

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

      // Return the complete entity
      this.logger.debug('Finding complete series entity');
      const foundSeries = await this.eventSeriesRepository.findById(
        savedSeries.id,
      );

      if (!foundSeries) {
        this.logger.error(
          `Failed to find event series with id ${savedSeries.id} after creation`,
        );
        throw new Error(
          `Failed to find event series with id ${savedSeries.id} after creation`,
        );
      }

      this.logger.debug('Series creation completed successfully', {
        seriesId: foundSeries.id,
        seriesSlug: foundSeries.slug,
        templateEventSlug: foundSeries.templateEventSlug,
      });

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

      // Update the series
      Object.assign(series, updateData);

      // If the recurrence rule was updated, regenerate the description
      if (updateEventSeriesDto.recurrenceRule) {
        series.recurrenceDescription = this.generateRecurrenceDescription(
          updateEventSeriesDto.recurrenceRule,
        );
      }

      // If template properties were updated, update the template event
      if (series.templateEventSlug) {
        const templateUpdates: any = {};
        if (updateEventSeriesDto.location !== undefined) {
          templateUpdates.location = updateEventSeriesDto.location;
        }
        if (updateEventSeriesDto.locationOnline !== undefined) {
          templateUpdates.locationOnline = updateEventSeriesDto.locationOnline;
        }
        if (updateEventSeriesDto.maxAttendees !== undefined) {
          templateUpdates.maxAttendees = updateEventSeriesDto.maxAttendees;
        }
        if (updateEventSeriesDto.requireApproval !== undefined) {
          templateUpdates.requireApproval =
            updateEventSeriesDto.requireApproval;
        }
        if (updateEventSeriesDto.approvalQuestion !== undefined) {
          templateUpdates.approvalQuestion =
            updateEventSeriesDto.approvalQuestion;
        }
        if (updateEventSeriesDto.allowWaitlist !== undefined) {
          templateUpdates.allowWaitlist = updateEventSeriesDto.allowWaitlist;
        }
        if (updateEventSeriesDto.categories !== undefined) {
          templateUpdates.categories = updateEventSeriesDto.categories;
        }

        if (Object.keys(templateUpdates).length > 0) {
          this.logger.debug(
            `Updating template event ${series.templateEventSlug} with properties:`,
            templateUpdates,
          );
          await this.eventManagementService.update(
            series.templateEventSlug,
            templateUpdates,
            userId,
          );
        }
      }

      // Save the updated series
      return await this.eventSeriesRepository.save(series);
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
        // Delete all events in the series
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(slug);
        for (const event of events) {
          await this.eventManagementService.remove(event.slug);
        }
      } else {
        // Remove series association from events
        const [events] =
          await this.eventManagementService.findEventsBySeriesSlug(slug);
        for (const event of events) {
          await this.eventManagementService.update(
            event.slug,
            { seriesId: undefined, seriesSlug: undefined },
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

    // Create the event with materialized and seriesId set
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
      if (event.seriesId) {
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
      event.seriesId = series.id;
      event.seriesSlug = series.slug;

      // Save the updated event
      const updatedEvent = await this.eventManagementService.update(
        event.slug,
        {
          seriesId: series.id,
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
