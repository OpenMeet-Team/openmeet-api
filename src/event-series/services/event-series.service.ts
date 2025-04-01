import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { EventSeriesRepository } from '../interfaces/event-series-repository.interface';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { UpdateEventSeriesDto } from '../dto/update-event-series.dto';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { Trace } from '../../utils/trace.decorator';

@Injectable()
export class EventSeriesService {
  private readonly logger = new Logger(EventSeriesService.name);

  constructor(
    @Inject(EventSeriesRepository)
    private readonly eventSeriesRepository: EventSeriesRepository,
    private readonly recurrenceService: RecurrenceService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
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
      // Create the event series entity
      const eventSeries = new EventSeriesEntity();
      eventSeries.name = createEventSeriesDto.name;
      eventSeries.slug = createEventSeriesDto.slug; // Will be auto-generated if not provided
      eventSeries.description = createEventSeriesDto.description;
      eventSeries.timeZone = createEventSeriesDto.timeZone;
      eventSeries.recurrenceRule = createEventSeriesDto.recurrenceRule;
      eventSeries.userId = userId;
      eventSeries.groupId = createEventSeriesDto.groupId;
      eventSeries.imageId = createEventSeriesDto.imageId;
      eventSeries.matrixRoomId = createEventSeriesDto.matrixRoomId;
      
      // External source fields
      eventSeries.sourceType = createEventSeriesDto.sourceType;
      eventSeries.sourceId = createEventSeriesDto.sourceId;
      eventSeries.sourceUrl = createEventSeriesDto.sourceUrl;
      eventSeries.sourceData = createEventSeriesDto.sourceData;

      // Save the event series
      const savedEventSeries = await this.eventSeriesRepository.create(eventSeries);

      // Create the first occurrence from the template
      await this.createFirstOccurrence(savedEventSeries, createEventSeriesDto, userId);

      return this.findBySlug(savedEventSeries.slug);
    } catch (error) {
      this.logger.error(
        `Error creating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create the first occurrence from the template
   */
  private async createFirstOccurrence(
    eventSeries: EventSeriesEntity,
    template: CreateEventSeriesDto,
    userId: number,
  ): Promise<EventEntity> {
    // Create an event from the template properties
    const eventData = {
      name: eventSeries.name,
      description: eventSeries.description,
      startDate: template.templateStartDate,
      endDate: template.templateEndDate,
      timeZone: eventSeries.timeZone,
      type: template.templateType,
      location: template.templateLocation,
      locationOnline: template.templateLocationOnline,
      maxAttendees: template.templateMaxAttendees,
      requireApproval: template.templateRequireApproval,
      approvalQuestion: template.templateApprovalQuestion,
      allowWaitlist: template.templateAllowWaitlist,
      categories: template.templateCategories,
      
      // Set it as part of the series
      seriesId: eventSeries.id,
      materialized: true,
      originalOccurrenceDate: new Date(template.templateStartDate),
      
      // Set it as recurring (for compatibility with existing code)
      isRecurring: true,
      recurrenceRule: eventSeries.recurrenceRule,
    };

    // Create the event using the management service
    const event = await this.eventManagementService.create(eventData, userId);
    return event;
  }

  /**
   * Find all event series with pagination
   */
  @Trace('event-series.findAll')
  async findAll(
    options: { page: number; limit: number } = { page: 1, limit: 10 },
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      // For now, this is a simple pass-through to findByUser with null userId
      // In a real implementation, we'd have filtering, search, etc.
      const [data, total] = await this.eventSeriesRepository.findByUser(
        null,
        options,
      );
      
      // Add human-readable descriptions to each series
      data.forEach((series) => {
        series.recurrenceDescription = this.recurrenceService.getRecurrenceDescription(
          series.recurrenceRule,
          series.timeZone,
        );
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
    options: { page: number; limit: number } = { page: 1, limit: 10 },
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      const [data, total] = await this.eventSeriesRepository.findByUser(
        userId,
        options,
      );
      
      // Add human-readable descriptions to each series
      data.forEach((series) => {
        series.recurrenceDescription = this.recurrenceService.getRecurrenceDescription(
          series.recurrenceRule,
          series.timeZone,
        );
      });
      
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
    options: { page: number; limit: number } = { page: 1, limit: 10 },
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      const [data, total] = await this.eventSeriesRepository.findByGroup(
        groupId,
        options,
      );
      
      // Add human-readable descriptions to each series
      data.forEach((series) => {
        series.recurrenceDescription = this.recurrenceService.getRecurrenceDescription(
          series.recurrenceRule,
          series.timeZone,
        );
      });
      
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
   * Find a specific event series by slug
   */
  @Trace('event-series.findBySlug')
  async findBySlug(slug: string): Promise<EventSeriesEntity> {
    try {
      const eventSeries = await this.eventSeriesRepository.findBySlug(slug);
      
      if (!eventSeries) {
        throw new NotFoundException(`Event series with slug ${slug} not found`);
      }
      
      // Add human-readable description
      eventSeries.recurrenceDescription = this.recurrenceService.getRecurrenceDescription(
        eventSeries.recurrenceRule,
        eventSeries.timeZone,
      );
      
      return eventSeries;
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
   * Update an event series
   */
  @Trace('event-series.update')
  async update(
    slug: string,
    updateEventSeriesDto: UpdateEventSeriesDto,
    userId: number,
  ): Promise<EventSeriesEntity> {
    try {
      const eventSeries = await this.findBySlug(slug);
      
      // Ensure the user has permission to update this series
      // This would typically be handled by a guard, but we'll check here as well
      if (eventSeries.userId !== userId) {
        throw new BadRequestException('You do not have permission to update this event series');
      }
      
      // Update the event series
      const updatedSeries = await this.eventSeriesRepository.update(
        eventSeries.id,
        updateEventSeriesDto,
      );
      
      // Determine if we should propagate changes to future occurrences
      const propagateChanges = updateEventSeriesDto.propagateChanges !== false;
      
      if (propagateChanges) {
        // Implement logic to update future unmaterialized occurrences
        // This would typically involve finding all events with this seriesId
        // that are not materialized and updating them
        
        // TODO: Implement propagation logic for unmaterialized occurrences
      }
      
      return this.findBySlug(slug);
    } catch (error) {
      this.logger.error(
        `Error updating event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete an event series
   */
  @Trace('event-series.delete')
  async delete(slug: string, userId: number): Promise<void> {
    try {
      const eventSeries = await this.findBySlug(slug);
      
      // Ensure the user has permission to delete this series
      if (eventSeries.userId !== userId) {
        throw new BadRequestException('You do not have permission to delete this event series');
      }
      
      // Delete the event series
      // Note: Deleting the series should cascade to all events in the series
      // due to the CASCADE option in the foreign key
      await this.eventSeriesRepository.delete(eventSeries.id);
    } catch (error) {
      this.logger.error(
        `Error deleting event series: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}