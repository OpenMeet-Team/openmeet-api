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
import { generateShortCode } from '../../utils/short-code';

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
   * Create a series from an existing event
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
    await this.initializeRepository(tenantId);

    try {
      // Validate the recurrence rule before proceeding
      this.validateRecurrenceRule(recurrenceRule);

      // Get the event to use as a template
      const event = await this.eventQueryService.findEventBySlug(eventSlug);
      this.logger.debug(`[PRE-OPERATION] Original event state:`, {
        id: event?.id,
        slug: event?.slug,
        seriesSlug: event?.seriesSlug,
      });
      
      if (!event) {
        throw new NotFoundException(`Event with slug ${eventSlug} not found`);
      }

      // Check if the event is already part of a series
      if (event.seriesSlug) {
        throw new BadRequestException(
          `Event ${eventSlug} is already part of a series`,
        );
      }

      // Use event data for the series if not provided
      const seriesName = name || `${event.name} Series`;
      const seriesDescription = description || event.description;
      const seriesTimeZone = timeZone || (event as any).timeZone || 'UTC';

      // Create the series entity
      const series = new EventSeriesEntity();

      // Generate a unique slug for the series
      const baseSlug = options?.slug ? options.slug : `${event.slug}-series`;
      series.slug = baseSlug + '-' + generateShortCode().toLowerCase();

      series.name = seriesName;
      series.description = seriesDescription;
      series.recurrenceRule = recurrenceRule;
      series.timeZone = seriesTimeZone;
      series.templateEventSlug = event.slug;
      series.user = { id: userId } as any;

      // Add optional fields if provided
      if (options?.groupId) {
        series.group = { id: options.groupId } as any;
      } else if (event.group) {
        series.group = { id: event.group.id } as any;
      }

      if (options?.imageId) {
        series.image = { id: options.imageId } as any;
      } else if (event.image) {
        series.image = { id: event.image.id } as any;
      }

      if (options?.matrixRoomId) {
        series.matrixRoomId = options.matrixRoomId;
      } else if (event.matrixRoomId) {
        series.matrixRoomId = event.matrixRoomId;
      }

      // Add source data if provided
      series.sourceType = options?.sourceType || event.sourceType;
      series.sourceId = options?.sourceId || event.sourceId;
      series.sourceUrl = options?.sourceUrl || event.sourceUrl;
      series.sourceData = options?.sourceData || event.sourceData;

      // Generate a human-readable description of the recurrence pattern
      series.recurrenceDescription =
        this.generateRecurrenceDescription(recurrenceRule);

      // Save the series
      this.logger.debug(`Creating new series with data:`, {
        slug: series.slug,
        name: series.name,
        templateEventSlug: series.templateEventSlug
      });
      
      const savedSeries = await this.eventSeriesRepository.save(series);
      this.logger.log(
        `Created series ${savedSeries.slug} from event ${eventSlug}`,
      );

      // Update the template event to link it to the series with a transaction
      try {
        // Get effective tenant ID
        const effectiveTenantId = tenantId || this.request?.tenantId;
        if (!effectiveTenantId) {
          throw new Error('No tenant ID available for transaction');
        }
        
        this.logger.debug(`[LINKING] Attempting to link event to series using transaction`, {
          eventSlug,
          seriesSlug: savedSeries.slug,
          effectiveTenantId
        });
        
        // Get connection and start transaction
        const dataSource = await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
        
        await dataSource.transaction(async (transactionalEntityManager) => {
          // Debug current connection state
          this.logger.debug(`[TRANSACTION] Transaction started for linking event to series`);
          
          // Get repository within transaction
          const eventRepo = transactionalEntityManager.getRepository(EventEntity);
          
          // Re-fetch event inside transaction to ensure we have fresh data
          const freshEvent = await eventRepo.findOne({
            where: { slug: eventSlug },
          });
          
          if (!freshEvent) {
            throw new NotFoundException(`Event ${eventSlug} not found in transaction`);
          }
          
          this.logger.debug(`[TRANSACTION] Event found within transaction`, {
            id: freshEvent.id,
            slug: freshEvent.slug,
            currentSeriesSlug: freshEvent.seriesSlug
          });
          
          // Update the event with the series slug
          freshEvent.seriesSlug = savedSeries.slug;
          
          // Save event with updated series relationship
          const result = await eventRepo.save(freshEvent);
          
          this.logger.debug(`[TRANSACTION] Event updated within transaction`, {
            id: result.id,
            slug: result.slug,
            updatedSeriesSlug: result.seriesSlug
          });
        });
        
        this.logger.log(`Transaction completed successfully for linking event ${eventSlug} to series ${savedSeries.slug}`);
        
        // Wait a moment to allow any pending database operations to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Verify the link was established by fetching the event again
        const verificationEvent = await this.eventQueryService.findEventBySlug(eventSlug);
        
        this.logger.debug(`[VERIFICATION] Event state after linking:`, {
          eventId: verificationEvent?.id,
          eventSlug,
          expectedSeriesSlug: savedSeries.slug,
          actualSeriesSlug: verificationEvent?.seriesSlug || 'null'
        });
        
        if (!verificationEvent || verificationEvent.seriesSlug !== savedSeries.slug) {
          this.logger.warn(`[VERIFICATION FAILED] Event ${eventSlug} does not have the expected seriesSlug`, {
            expected: savedSeries.slug,
            actual: verificationEvent?.seriesSlug || 'null'
          });
          
          // Emergency direct update as last resort
          this.logger.log(`[EMERGENCY] Attempting direct database update as last resort`);
          
          try {
            const connection = await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
            
            // Directly update the database with SQL
            await connection.query(
              `UPDATE events SET "seriesSlug" = $1 WHERE slug = $2`,
              [savedSeries.slug, eventSlug]
            );
            
            this.logger.log(`[EMERGENCY] Direct database update completed for event ${eventSlug}`);
            
            // Final verification
            const finalCheck = await this.eventQueryService.findEventBySlug(eventSlug);
            this.logger.debug(`[FINAL CHECK] Event state after direct update:`, {
              seriesSlug: finalCheck?.seriesSlug
            });
          } catch (directUpdateError) {
            this.logger.error(`[EMERGENCY] Direct update failed:`, {
              error: directUpdateError.message
            });
          }
        } else {
          this.logger.log(`[VERIFICATION SUCCESS] Event ${eventSlug} is correctly linked to series ${savedSeries.slug}`);
        }
        
        // Schedule a delayed verification to detect if something is changing the seriesSlug after our update
        setTimeout(async () => {
          try {
            const delayedCheck = await this.eventQueryService.findEventBySlug(eventSlug);
            this.logger.debug(`[DELAYED CHECK - 5s] Event state after 5 seconds:`, {
              eventId: delayedCheck?.id,
              eventSlug: delayedCheck?.slug,
              seriesSlug: delayedCheck?.seriesSlug || 'null',
              expectedSeriesSlug: savedSeries.slug,
              isStillLinked: delayedCheck?.seriesSlug === savedSeries.slug
            });
            
            if (!delayedCheck || delayedCheck.seriesSlug !== savedSeries.slug) {
              this.logger.warn(`[DELAYED CHECK WARNING] After 5 seconds, event ${eventSlug} is no longer linked to series ${savedSeries.slug}`, {
                expected: savedSeries.slug,
                actual: delayedCheck?.seriesSlug || 'null'
              });
              
              // Log current active request info for debugging
              this.logger.debug(`[DELAYED CHECK] Current request info:`, {
                hasRequest: !!this.request,
                requestId: this.request?.id,
                requestPath: this.request?.path,
                requestMethod: this.request?.method,
                requestTenant: this.request?.tenantId
              });
            }
          } catch (error) {
            this.logger.error(`[DELAYED CHECK] Error checking event state after delay:`, {
              error: error.message
            });
          }
        }, 5000);
      } catch (error) {
        this.logger.error(`[ERROR] Failed to link template event to series:`, {
          error: error.message,
          stack: error.stack
        });
        throw error;
      }

      // Generate future occurrences if requested
      const shouldGenerateOccurrences =
        options?.generateOccurrences !== undefined
          ? options.generateOccurrences
          : false;

      if (shouldGenerateOccurrences) {
        await this.generateFutureOccurrences(
          event,
          savedSeries,
          recurrenceRule,
          userId,
          tenantId,
        );
      }

      return savedSeries;
    } catch (error) {
      this.logger.error(
        `Error creating series from event: ${error.message}`,
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
