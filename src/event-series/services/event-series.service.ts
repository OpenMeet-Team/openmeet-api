import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
  Logger,
  UnauthorizedException,
  Scope,
} from '@nestjs/common';
import { EventSeriesEntity } from '../infrastructure/persistence/relational/entities/event-series.entity';
import { CreateEventSeriesDto } from '../dto/create-event-series.dto';
import { UpdateEventSeriesDto } from '../dto/update-event-series.dto';
import { RecurrencePatternService } from './recurrence-pattern.service';
import { EventManagementService } from '../../event/services/event-management.service';
import { Trace } from '../../utils/trace.decorator';
import { EventEntity } from '../../event/infrastructure/persistence/relational/entities/event.entity';
import { EventQueryService } from '../../event/services/event-query.service';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CreateSeriesFromEventDto } from '../dto/create-series-from-event.dto';
import { Repository } from 'typeorm';
import { CreateEventDto } from '../../event/dto/create-event.dto';

@Injectable({ scope: Scope.REQUEST })
export class EventSeriesService {
  private readonly logger = new Logger(EventSeriesService.name);
  private eventSeriesRepository: Repository<EventSeriesEntity>;

  constructor(
    private readonly recurrencePatternService: RecurrencePatternService,
    @Inject(forwardRef(() => EventManagementService))
    private readonly eventManagementService: EventManagementService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    // Initialize repository lazily when methods are called
  }

  @Trace('event-series.initializeRepository')
  private async initializeRepository(tenantId?: string) {
    try {
      // Check if repository is already initialized
      if (this.eventSeriesRepository) {
        return;
      }

      const effectiveTenantId = tenantId || this.request?.tenantId;
      if (!effectiveTenantId) {
        throw new Error('Tenant ID is required');
      }

      const dataSource =
        await this.tenantConnectionService.getTenantConnection(
          effectiveTenantId,
        );
      this.eventSeriesRepository = dataSource.getRepository(EventSeriesEntity);
    } catch (error) {
      this.logger.error(
        `Failed to initialize repository: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Create a new event series
   */
  @Trace('event-series.create')
  async create(
    createEventSeriesDto: CreateEventSeriesDto,
    userId: number,
    generateFutureEvents: boolean = false,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    try {
      await this.initializeRepository(tenantId);

      // Validate the recurrence rule
      this.validateRecurrenceRule(createEventSeriesDto.recurrenceRule);

      // Generate a human-readable description of the recurrence pattern
      const recurrenceDescription = this.generateRecurrenceDescription(
        createEventSeriesDto.recurrenceRule,
      );

      // Get the template event slug
      const templateSlugToLink: string | undefined =
        createEventSeriesDto.templateEventSlug;

      if (!templateSlugToLink) {
        throw new BadRequestException('No templateEventSlug provided');
      }

      // Verify the template event exists
      const templateEvent =
        await this.eventQueryService.findEventBySlug(templateSlugToLink);
      if (!templateEvent) {
        throw new NotFoundException(
          `Template event with slug ${templateSlugToLink} not found`,
        );
      }

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
        timeZone: (templateEvent as any).timeZone || 'UTC',
      };

      // Create and save the entity
      const eventSeries = this.eventSeriesRepository.create(eventSeriesData);
      const savedSeries = await this.eventSeriesRepository.save(eventSeries);

      // Link the template event to the series
      try {
        this.logger.debug(
          `Linking template event ${templateSlugToLink} to series ${savedSeries.slug}`,
        );

        // Fetch the template event
        const eventToLink = await this.eventQueryService.findEventBySlug(templateSlugToLink);
        if (!eventToLink) {
          throw new NotFoundException(
            `Template event ${templateSlugToLink} not found`,
          );
        }

        // Get the event repository
        const tenantConnection = await this.tenantConnectionService.getTenantConnection(
          tenantId || this.request?.tenantId,
        );
        const eventRepository = tenantConnection.getRepository(EventEntity);

        // Update the template event to link it to the series
        eventToLink.seriesSlug = savedSeries.slug;
        eventToLink.series = savedSeries;
        await eventRepository.save(eventToLink);

        // Also update via the service to ensure proper handling
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
      } catch (error) {
        // Log the error but don't fail the whole operation
        this.logger.error(
          `Error linking template event to series: ${error.message}`,
          error.stack,
        );
      }

      // Generate future occurrences if requested
      if (generateFutureEvents) {
        await this.generateFutureOccurrences(
          templateEvent,
          savedSeries,
          savedSeries.recurrenceRule,
          userId,
          tenantId,
        );
      } else {
        this.logger.debug(
          'Skipping immediate generation of future occurrences. Will be handled asynchronously.',
        );
        // Here we would emit an event to generate the occurrences asynchronously later
        // For example: this.eventEmitter.emit('series.created', { seriesId: savedSeries.id, userId });
      }

      // Return the full entity with relations
      const foundSeries = await this.findById(savedSeries.id, tenantId);
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
   * Find an event series by ID with relations loaded
   */
  @Trace('event-series.findById')
  async findById(
    id: number,
    tenantId?: string,
  ): Promise<EventSeriesEntity | undefined> {
    await this.initializeRepository(tenantId);

    const result = await this.eventSeriesRepository.findOne({
      where: { id },
      relations: ['user', 'group', 'image'],
    });

    return result || undefined;
  }

  /**
   * Helper method to create a series from a DTO object coming from controller
   * This simplifies the controller code by moving processing logic to the service
   */
  @Trace('event-series.createSeriesFromEventDto')
  async createSeriesFromEventDto(
    eventSlug: string,
    createData: CreateSeriesFromEventDto,
    userId: number,
    generateFutureEvents: boolean = false,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    this.logger.debug('Creating event series from DTO object', {
      eventSlug,
      userId,
      dto: createData,
      generateFutureEvents,
      tenantId,
    });

    return this.createFromExistingEvent(
      eventSlug,
      createData.recurrenceRule,
      userId,
      createData.name,
      createData.description,
      createData.timeZone,
      { generateOccurrences: generateFutureEvents },
      tenantId,
    );
  }

  /**
   * Create a new event series from an existing event
   * @deprecated Please use the create() method with templateEventSlug instead
   */
  @Trace('event-series.createFromExistingEvent')
  async createFromExistingEvent(
    eventSlug: string,
    recurrenceRule: any,
    userId: number,
    name?: string,
    description?: string,
    timeZone?: string,
    options?: {
      imageId?: number;
      groupId?: number;
      matrixRoomId?: string;
      sourceType?: string;
      sourceId?: string;
      sourceUrl?: string;
      sourceData?: Record<string, unknown>;
      generateOccurrences?: boolean;
      slug?: string;
    },
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    try {
      // Use the tenant ID from the request if available, or the provided one
      const effectiveTenantId = tenantId || this.request?.tenantId;
      await this.initializeRepository(effectiveTenantId);

      this.logger.debug('Starting createFromExistingEvent', {
        eventSlug,
        userId,
        recurrenceRule,
        name,
        description,
        timeZone,
        options,
        tenantId: effectiveTenantId,
      });

      // Validate the recurrence rule
      this.validateRecurrenceRule(recurrenceRule);

      // Find the existing event
      this.logger.debug(`Finding event by slug: ${eventSlug}`);
      const event = await this.eventQueryService.findEventBySlug(eventSlug);

      if (!event) {
        this.logger.debug(`Event ${eventSlug} NOT FOUND by eventQueryService`);
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }
      this.logger.debug(`Found event ${eventSlug} with ID ${event.id}`);

      // Check if the event is already part of a series
      if (event.seriesSlug) {
        this.logger.error(
          `Event ${eventSlug} is already part of series ${event.seriesSlug}`,
        );
        throw new BadRequestException(
          `Event ${eventSlug} is already part of a series`,
        );
      }
      this.logger.debug(`Event ${eventSlug} is not part of a series yet.`);

      // Create a new series entity
      this.logger.debug('Creating new series entity');
      const series = new EventSeriesEntity();
      series.name = name || event.name;
      series.description = description || event.description;
      series.recurrenceRule = recurrenceRule;
      series.user = { id: userId } as any;
      series.recurrenceDescription =
        this.generateRecurrenceDescription(recurrenceRule);

      // Set timezone - the property might not exist directly on EventEntity but it's passed in parameters
      series.timeZone = timeZone || (event as any).timeZone || 'UTC';

      // Set the template event slug before saving
      this.logger.debug('Setting template event slug');
      series.templateEventSlug = event.slug;

      // Apply optional fields if provided
      if (options) {
        if (options.slug) series.slug = options.slug;
        if (options.imageId) series.image = { id: options.imageId } as any;
        if (options.groupId) series.group = { id: options.groupId } as any;
        if (options.matrixRoomId) series.matrixRoomId = options.matrixRoomId;
        if (options.sourceType) series.sourceType = options.sourceType;
        if (options.sourceId) series.sourceId = options.sourceId;
        if (options.sourceUrl) series.sourceUrl = options.sourceUrl;
        if (options.sourceData) series.sourceData = options.sourceData;
      }

      // Save the series with all properties set
      this.logger.debug('Saving new series');
      const savedSeries = await this.save(series, effectiveTenantId);
      this.logger.debug(
        `Series saved with ID ${savedSeries.id} and slug ${savedSeries.slug}`,
      );

      // Update the existing event to be part of the series - this is critical
      this.logger.debug(
        `Attempting to link event ${eventSlug} to series ${savedSeries.slug}`,
      );

      // Link the original event to the new series
      this.logger.debug(`Re-fetching event ${eventSlug} before linking`);
      const eventToLink =
        await this.eventQueryService.findEventBySlug(eventSlug);
      if (!eventToLink) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      this.logger.debug(
        `Event ${eventSlug} ready for linking. Current seriesSlug: ${eventToLink.seriesSlug}`,
      );

      // Use EventManagementService to properly update the event with the series slug
      try {
        // Get a direct reference to the event repository
        const tenantConnection = await this.tenantConnectionService.getTenantConnection(
          effectiveTenantId,
        );
        const eventRepository = tenantConnection.getRepository(EventEntity);

        // Update the event directly to set both seriesSlug and series relationship
        eventToLink.seriesSlug = savedSeries.slug;
        eventToLink.series = savedSeries;
        await eventRepository.save(eventToLink);

        // Also update via the EventManagementService to ensure proper handling
        await this.eventManagementService.update(
          eventSlug,
          { seriesSlug: savedSeries.slug },
          userId,
        );

        this.logger.log(
          `Successfully linked event ${eventSlug} (ID: ${eventToLink.id}) to series ${savedSeries.slug} (ID: ${savedSeries.id})`,
        );
        
        // Verify the link was successful by re-fetching the event
        const verifiedEvent = await this.eventQueryService.findEventBySlug(eventSlug);
        if (!verifiedEvent || verifiedEvent.seriesSlug !== savedSeries.slug) {
          this.logger.warn(
            `⚠️ Verification failed: Event ${eventSlug} does not have correct seriesSlug. Expected: ${savedSeries.slug}, Actual: ${verifiedEvent?.seriesSlug}`,
          );
          
          // Force update the event again with the correct seriesSlug
          this.logger.debug(
            `Attempting to re-link event ${eventSlug} to series ${savedSeries.slug}`,
          );
          await this.eventManagementService.update(
            eventSlug,
            {
              seriesSlug: savedSeries.slug,
              // Include the event's other properties to make sure nothing gets lost
              name: verifiedEvent?.name,
              description: verifiedEvent?.description,
              type: verifiedEvent?.type,
              location: verifiedEvent?.location,
              locationOnline: verifiedEvent?.locationOnline,
            },
            userId,
          );
          
          // Final verification
          const finalVerification = await this.eventQueryService.findEventBySlug(eventSlug);
          this.logger.debug(
            `After re-linking: Event ${eventSlug} seriesSlug = ${finalVerification?.seriesSlug}`,
          );
        }
      } catch (updateError) {
        this.logger.error(
          `Error linking event ${eventSlug} to series: ${updateError.message}`,
          updateError.stack,
        );
        throw new Error(
          `Failed to link event to series: ${updateError.message}`,
        );
      }

      // Generate future occurrences based on the recurrence rule - only if explicitly requested
      const shouldGenerateOccurrences = options?.generateOccurrences === true; // Default to false

      if (shouldGenerateOccurrences) {
        await this.generateFutureOccurrences(
          event,
          savedSeries,
          recurrenceRule,
          userId,
          effectiveTenantId,
        );
      } else {
        this.logger.debug(
          'Skipping immediate generation of future occurrences. Will be handled asynchronously.',
        );
        // Here we would emit an event to handle it asynchronously
        // For example: this.eventEmitter.emit('series.created', { seriesId: savedSeries.id, userId });
      }

      // Return the complete entity after updates
      this.logger.debug('Finding complete series entity after updates');
      const updatedSeries = await this.findById(
        savedSeries.id,
        effectiveTenantId,
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
   * Save an event series entity
   */
  @Trace('event-series.save')
  async save(
    eventSeries: Partial<EventSeriesEntity>,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    await this.initializeRepository(tenantId);
    return this.eventSeriesRepository.save(eventSeries);
  }

  /**
   * Helper method to generate future occurrences for a series
   * Extracted to improve code organization
   */
  private async generateFutureOccurrences(
    templateEvent: EventEntity,
    series: EventSeriesEntity,
    recurrenceRule: any,
    userId: number,
    tenantId?: string,
  ): Promise<void> {
    this.logger.debug('Generating future occurrences');
    const maxOccurrences = 5;
    const recurrencePattern = this.recurrencePatternService
      .generateOccurrences(templateEvent.startDate, recurrenceRule, {
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
        tenantId,
      });

      await Promise.all(
        batch.map(async (occurrenceDate) => {
          // Check if occurrence already exists
          const existingOccurrence =
            await this.eventQueryService.findEventByDateAndSeries(
              occurrenceDate,
              series.slug,
            );

          if (existingOccurrence) {
            this.logger.debug('Occurrence already exists, skipping creation', {
              date: occurrenceDate.toISOString(),
              slug: existingOccurrence.slug,
            });
            return;
          }

          // Create a new occurrence with a timeout
          try {
            this.logger.debug('Creating occurrence', {
              date: occurrenceDate.toISOString(),
              tenantId,
            });
            await Promise.race([
              this.eventManagementService.createSeriesOccurrence(
                {
                  name: templateEvent.name,
                  description: templateEvent.description,
                  startDate: occurrenceDate,
                  endDate: templateEvent.endDate
                    ? new Date(
                        occurrenceDate.getTime() +
                          (templateEvent.endDate.getTime() -
                            templateEvent.startDate.getTime()),
                      )
                    : undefined,
                  type: templateEvent.type,
                  location: templateEvent.location,
                  locationOnline: templateEvent.locationOnline,
                  maxAttendees: templateEvent.maxAttendees,
                  requireApproval: templateEvent.requireApproval,
                  approvalQuestion: templateEvent.approvalQuestion,
                  allowWaitlist: templateEvent.allowWaitlist,
                  categories: templateEvent.categories.map((cat) => cat.id),
                  seriesSlug: series.slug,
                },
                userId,
                series.slug,
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
  }

  /**
   * Find an event series by slug
   */
  @Trace('event-series.findBySlug')
  async findBySlug(
    slug: string,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    try {
      await this.initializeRepository(tenantId);

      const series = await this.eventSeriesRepository.findOne({
        where: { slug },
        relations: ['user', 'group', 'image'],
      });

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
  async findAll(
    options?: {
      page: number;
      limit: number;
    },
    tenantId?: string,
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      await this.initializeRepository(tenantId);

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const skip = (page - 1) * limit;

      // Use the repository to find all series with pagination
      const [data, total] = await this.eventSeriesRepository.findAndCount({
        relations: ['user', 'group', 'image'],
        skip,
        take: limit,
        order: { createdAt: 'DESC' },
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
      sourceType?: string;
    },
    tenantId?: string,
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      // Initialize repository with provided tenant ID if available
      await this.initializeRepository(tenantId);

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const skip = (page - 1) * limit;

      const query: any = {
        relations: ['user', 'group', 'image'],
        skip,
        take: limit,
        order: { createdAt: 'DESC' },
      };

      // Build where clause based on filters
      const whereClause: any = {};

      // If userId is provided, filter by user
      if (userId !== null) {
        whereClause.user = { id: userId };
      }

      // If sourceType is provided, filter by sourceType
      if (options?.sourceType) {
        whereClause.sourceType = options.sourceType;
      }

      // Only add where clause if we have filters
      if (Object.keys(whereClause).length > 0) {
        query.where = whereClause;
      }

      const [data, total] =
        await this.eventSeriesRepository.findAndCount(query);

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
    tenantId?: string,
  ): Promise<{ data: EventSeriesEntity[]; total: number }> {
    try {
      await this.initializeRepository(tenantId);

      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const skip = (page - 1) * limit;

      const [data, total] = await this.eventSeriesRepository.findAndCount({
        where: { group: { id: groupId } },
        relations: ['user', 'group', 'image'],
        skip,
        take: limit,
        order: { createdAt: 'DESC' },
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
   * Update an event series
   */
  @Trace('event-series.update')
  async update(
    slug: string,
    updateEventSeriesDto: UpdateEventSeriesDto,
    userId: number,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    try {
      // Find the series by slug
      const series = await this.findBySlug(slug, tenantId);

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
      const reFetchedSeries = await this.findById(updatedSeries.id, tenantId);

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
   * Delete an event series
   */
  @Trace('event-series.delete')
  async delete(
    slug: string,
    userId: number,
    deleteEvents: boolean = false,
    tenantId?: string,
  ): Promise<void> {
    try {
      // Find the series by slug
      const series = await this.findBySlug(slug, tenantId);

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
      const series = await this.findBySlug(seriesSlug);
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
