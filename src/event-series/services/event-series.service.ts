import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
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
  ) {}

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
        timeZone: createEventSeriesDto.timeZone || 'UTC',
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

      // Return the full entity with relations
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
    timeZone: string,
    userId: number,
  ): Promise<EventSeriesEntity> {
    try {
      // Validate the recurrence rule
      this.validateRecurrenceRule(recurrenceRule);

      // Find the event
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Verify the user has permission
      if (event.user?.id !== userId) {
        throw new BadRequestException(
          'You do not have permission to modify this event',
        );
      }

      // Generate a human-readable description
      const recurrenceDescription =
        this.generateRecurrenceDescription(recurrenceRule);

      // Create event series entity
      const eventSeriesData = {
        name: event.name,
        description: event.description || '',
        slug: `${event.slug}-series`, // Create a unique slug for the series
        timeZone: timeZone || 'UTC',
        recurrenceRule,
        recurrenceDescription,
        user: { id: userId } as any,
        group: event.group ? ({ id: event.group.id } as any) : null,
        image: event.image
          ? ({ id: (event.image as any).id } as any)
          : undefined,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        sourceUrl: event.sourceUrl,
        sourceData: event.sourceData,
        matrixRoomId: event.matrixRoomId,
      };

      // Create and save the series entity
      const eventSeries =
        await this.eventSeriesRepository.create(eventSeriesData);
      const savedSeries = await this.eventSeriesRepository.save(eventSeries);

      // Update the existing event to be part of the series
      await this.eventManagementService.update(
        eventSlug,
        {
          seriesSlug: savedSeries.slug,
          isRecurring: true,
          recurrenceRule,
          timeZone,
        },
        userId,
      );

      // Set the template event slug
      savedSeries.templateEventSlug = event.slug;
      await this.eventSeriesRepository.save(savedSeries);

      // Return the complete entity
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
        `Error creating event series from existing event: ${error.message}`,
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
    options?: { page: number; limit: number },
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
  async delete(slug: string, userId: number): Promise<boolean> {
    try {
      // Find the series
      const series = await this.findBySlug(slug);

      // Verify that the user is the owner of the series
      if (!series.user) {
        this.logger.warn(
          `Series ${slug} has no user association, but user ${userId} attempted to delete it`,
        );
        throw new Error('This event series has no owner');
      }

      if (series.user.id !== userId) {
        this.logger.warn(
          `User ${userId} attempted to delete series ${slug} owned by user ${series.user.id}`,
        );
        throw new Error('You are not authorized to delete this event series');
      }

      // Delete the series
      await this.eventSeriesRepository.delete(series.id);

      return true;
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
}
