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

      // Get the template event slug
      const templateSlugToLink: string | undefined =
        createEventSeriesDto.templateEventSlug;

      if (!templateSlugToLink) {
        throw new BadRequestException('No templateEventSlug provided');
      }

      // Call the common helper method
      return this.createSeriesWithTemplateEvent(
        templateSlugToLink,
        createEventSeriesDto.recurrenceRule,
        userId,
        createEventSeriesDto.name,
        createEventSeriesDto.description,
        undefined,
        {
          imageId: createEventSeriesDto.imageId,
          groupId: createEventSeriesDto.groupId,
          matrixRoomId: createEventSeriesDto.matrixRoomId,
          sourceType: createEventSeriesDto.sourceType,
          sourceId: createEventSeriesDto.sourceId,
          sourceUrl: createEventSeriesDto.sourceUrl,
          sourceData: createEventSeriesDto.sourceData,
          generateOccurrences: generateFutureEvents,
          slug: createEventSeriesDto.slug,
        },
        tenantId,
      );
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

    // Verify the event exists before attempting to create series
    const originalEvent =
      await this.eventQueryService.findEventBySlug(eventSlug);
    if (!originalEvent) {
      this.logger.error(
        `Cannot create series: Event with slug ${eventSlug} not found`,
      );
      throw new NotFoundException(`Event with slug ${eventSlug} not found`);
    }

    this.logger.debug(
      `Found original event ${eventSlug} (ID: ${originalEvent.id}) to convert to series`,
    );

    // Create the series from the existing event
    const series = await this.createFromExistingEvent(
      eventSlug,
      createData.recurrenceRule,
      userId,
      createData.name,
      createData.description,
      createData.timeZone,
      { generateOccurrences: generateFutureEvents },
      tenantId,
    );

    // Verify the original event was properly linked to the series
    const updatedEvent =
      await this.eventQueryService.findEventBySlug(eventSlug);
    if (!updatedEvent) {
      this.logger.error(
        `Original event ${eventSlug} disappeared during series creation`,
      );
      throw new Error(
        `Original event ${eventSlug} could not be found after series creation`,
      );
    }

    if (!updatedEvent.seriesSlug || updatedEvent.seriesSlug !== series.slug) {
      this.logger.error(
        `Original event ${eventSlug} (ID: ${updatedEvent.id}) was not properly linked to series ${series.slug}. Current seriesSlug: ${updatedEvent.seriesSlug || 'null'}`,
      );

      // Force update the event to link it to the series
      try {
        const dataSource =
          await this.tenantConnectionService.getTenantConnection(
            tenantId || this.request?.tenantId,
          );
        const eventRepo = dataSource.getRepository(EventEntity);

        // Update the event directly
        await eventRepo.update(
          { id: updatedEvent.id },
          {
            seriesSlug: series.slug,
            isRecurring: true,
          },
        );

        this.logger.debug(
          `Applied emergency fix to link event ${eventSlug} (ID: ${updatedEvent.id}) to series ${series.slug}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to apply emergency fix: ${err.message}`,
          err.stack,
        );
      }
    } else {
      this.logger.debug(
        `Event ${eventSlug} successfully linked to series ${series.slug}`,
      );
    }

    return series;
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
    try {
      await this.initializeRepository(tenantId);

      // Validate the recurrence rule
      this.validateRecurrenceRule(recurrenceRule);

      // Call the common helper method
      return this.createSeriesWithTemplateEvent(
        eventSlug,
        recurrenceRule,
        userId,
        name,
        description,
        timeZone,
        options,
        tenantId,
      );
    } catch (error) {
      this.logger.error(
        `Error creating series from event: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Common helper method that handles the creation of a series with a template event
   * Extracts common functionality from create() and createFromExistingEvent()
   */
  @Trace('event-series.createSeriesWithTemplateEvent')
  private async createSeriesWithTemplateEvent(
    templateEventSlug: string,
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
    // Use the template event first to find details
    const templateEvent =
      await this.eventQueryService.findEventBySlug(templateEventSlug);
    if (!templateEvent) {
      throw new NotFoundException(
        `Event with slug ${templateEventSlug} not found`,
      );
    }

    // IMPORTANT: Check if the template event is already associated with another series
    // If so, return that series instead of trying to create a new one
    if (templateEvent.seriesSlug) {
      this.logger.debug(
        `Template event ${templateEventSlug} is already part of series ${templateEvent.seriesSlug}`,
      );
      try {
        const existingSeries = await this.findBySlug(
          templateEvent.seriesSlug,
          tenantId,
        );

        // Log the discovery to help with debugging
        this.logger.debug(
          `Found existing series: ${JSON.stringify({
            id: existingSeries.id,
            slug: existingSeries.slug,
            templateEventSlug: existingSeries.templateEventSlug,
          })}`,
        );

        return existingSeries;
      } catch (err) {
        // If the series can't be found (which shouldn't happen), log it and continue with creation
        this.logger.warn(
          `Event ${templateEventSlug} references series ${templateEvent.seriesSlug}, but that series couldn't be found: ${err.message}`,
        );
        // Fall through to create a new series and fix the inconsistency
      }
    }

    // Create the series
    const seriesOptions = options || {};
    const seriesSlug = seriesOptions.slug || `${templateEvent.slug}-series`;

    this.logger.debug(
      `Creating series with slug ${seriesSlug} from event ${templateEventSlug}`,
    );

    // Generate a human-readable description of the recurrence pattern
    const recurrenceDescription =
      this.generateRecurrenceDescription(recurrenceRule);

    // Get effective tenant ID
    const effectiveTenantId = tenantId || this.request?.tenantId;
    if (!effectiveTenantId) {
      throw new Error('No tenant ID available for transaction');
    }

    // Get connection for transaction
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);

    // Execute everything in a single transaction to ensure atomicity
    const series = await dataSource.transaction(
      async (transactionalEntityManager) => {
        this.logger.debug(
          `Starting transaction for series creation from event ${templateEventSlug}`,
        );

        // Get repositories within transaction
        const eventRepo = transactionalEntityManager.getRepository(EventEntity);
        const seriesRepo =
          transactionalEntityManager.getRepository(EventSeriesEntity);

        // Verify the template event exists within the transaction
        let eventInTransaction = await eventRepo.findOne({
          where: { slug: templateEventSlug },
          relations: ['image', 'group'],
        });

        if (!eventInTransaction) {
          throw new NotFoundException(
            `Template event with slug ${templateEventSlug} not found in transaction`,
          );
        }

        // If for any reason the series slug is already set on the event and it doesn't match the one we
        // are about to create, log a warning
        if (
          eventInTransaction.seriesSlug &&
          eventInTransaction.seriesSlug !== seriesSlug
        ) {
          this.logger.warn(
            `Event ${eventInTransaction.slug} already has a series slug ${
              eventInTransaction.seriesSlug
            } that is different from the one being created ${seriesSlug}.`,
          );
        }

        // Promote the entity to a Series Template instance on the transactional manager
        eventInTransaction = await eventRepo.findOne({
          where: { slug: templateEventSlug },
        });

        // Make sure we still have the event after re-fetching
        if (!eventInTransaction) {
          throw new NotFoundException(
            `Template event with slug ${templateEventSlug} not found after re-fetching`,
          );
        }

        // Store the original slug for later reference (so we can find it again)
        // eventInTransaction.templateEventSlug = templateEventSlug;

        // Set seriesSlug directly to establish the relationship
        // (isRecurring is computed automatically from this)
        eventInTransaction.seriesSlug = seriesSlug;

        // Create a complete entity including the user relation
        const eventSeriesData = {
          name: name || templateEvent.name,
          description: description || templateEvent.description || '',
          slug: seriesSlug,
          recurrenceRule,
          recurrenceDescription,
          user: { id: userId } as any,
          group: seriesOptions.groupId
            ? ({ id: seriesOptions.groupId } as any)
            : templateEvent.group
              ? { id: templateEvent.group.id }
              : null,
          image: seriesOptions.imageId
            ? ({ id: seriesOptions.imageId } as any)
            : templateEvent.image
              ? { id: templateEvent.image.id }
              : undefined,
          sourceType: seriesOptions.sourceType || templateEvent.sourceType,
          sourceId: seriesOptions.sourceId || templateEvent.sourceId,
          sourceUrl: seriesOptions.sourceUrl || templateEvent.sourceUrl,
          sourceData: seriesOptions.sourceData || templateEvent.sourceData,
          matrixRoomId: seriesOptions.matrixRoomId,
          templateEventSlug: templateEventSlug,
          timeZone: timeZone || 'UTC',
        };

        // Create and save the entity
        const eventSeries = seriesRepo.create(eventSeriesData);
        const savedSeries = await seriesRepo.save(eventSeries);

        // Refresh the series to make sure we have the most up-to-date entity
        const refreshedSeries = await seriesRepo.findOne({
          where: { id: savedSeries.id },
        });

        if (!refreshedSeries) {
          throw new Error(
            `Failed to find series with ID ${savedSeries.id} after creating it`,
          );
        }

        // CRITICAL FIX: If the event in transaction already has a seriesSlug that's different from
        // the one we're creating, we need to be careful about how we proceed
        if (
          eventInTransaction.seriesSlug &&
          eventInTransaction.seriesSlug !== refreshedSeries.slug
        ) {
          this.logger.warn(
            `Event ${templateEventSlug} already has seriesSlug ${eventInTransaction.seriesSlug}, ` +
              `but we're about to change it to ${refreshedSeries.slug}. This could create inconsistencies.`,
          );

          // Check if this is an intended re-association (advanced use case)
          // For now, log the warning but proceed with the update
        }

        // Update the template event to link it to the series
        this.logger.debug(
          `Updating template event ${templateEventSlug} to set seriesSlug to ${refreshedSeries.slug}`,
        );

        if (!eventInTransaction) {
          this.logger.error(
            `eventInTransaction is null when trying to update with seriesSlug`,
          );
          throw new Error(
            'Failed to find event in transaction for linking to series',
          );
        }

        if (!refreshedSeries) {
          this.logger.error(
            `refreshedSeries is null when trying to link to event`,
          );
          throw new Error('Series was not properly created');
        }

        // Set the series association properties
        eventInTransaction.seriesSlug = refreshedSeries.slug;

        // Log the update operation for debugging
        this.logger.debug(
          `About to save event ${eventInTransaction.id} (${templateEventSlug}) with seriesSlug ${refreshedSeries.slug}`,
          {
            eventBeforeSave: {
              id: eventInTransaction.id,
              slug: eventInTransaction.slug,
              seriesSlug: eventInTransaction.seriesSlug,
            },
          },
        );

        try {
          await eventRepo.save(eventInTransaction);

          // Now verify the event was updated correctly by fetching it again
          const updatedEvent = await eventRepo.findOne({
            where: { id: eventInTransaction.id },
          });

          if (!updatedEvent) {
            throw new Error(
              `Failed to find event with ID ${eventInTransaction.id} after updating it`,
            );
          }

          this.logger.debug(
            `Verification after save: Event ${eventInTransaction.id} (${templateEventSlug}) seriesSlug=${updatedEvent.seriesSlug}`,
            {
              eventAfterSave: {
                id: updatedEvent.id,
                slug: updatedEvent.slug,
                seriesSlug: updatedEvent.seriesSlug,
              },
            },
          );

          if (updatedEvent.seriesSlug !== refreshedSeries.slug) {
            this.logger.error(
              `[SERIES_SLUG_LOST] Event seriesSlug was not updated correctly in transaction! Expected: ${refreshedSeries.slug}, Got: ${updatedEvent.seriesSlug || 'null'}`,
            );
          } else {
            this.logger.debug(
              `Successfully verified event ${templateEventSlug} has seriesSlug ${updatedEvent.seriesSlug}`,
            );
          }
        } catch (saveError) {
          this.logger.error(
            `[CRITICAL] Error saving event with seriesSlug link: ${saveError.message}`,
            {
              stack: saveError.stack,
              eventInTransaction: {
                id: eventInTransaction.id,
                slug: eventInTransaction.slug,
              },
              series: {
                id: refreshedSeries.id,
                slug: refreshedSeries.slug,
              },
            },
          );
          throw saveError;
        }

        // Generate future occurrences if requested
        if (seriesOptions.generateOccurrences) {
          this.logger.debug(
            `Generating future occurrences for series ${refreshedSeries.slug}`,
          );
          await this.generateFutureOccurrencesInTransaction(
            eventInTransaction,
            refreshedSeries,
            recurrenceRule,
            userId,
            transactionalEntityManager,
          );
        }

        return refreshedSeries;
      },
    );

    // After transaction completes, verify the seriesSlug was properly set on the template event
    const templateEventAfterSeries =
      await this.eventQueryService.findEventBySlug(templateEventSlug);

    this.logger.debug('Template event after series', {
      templateEventAfterSeries,
    });

    // Simple verification without retries or fallback mechanisms
    if (!templateEventAfterSeries) {
      this.logger.error(
        `[SERIES_SLUG_LOST] Could not find template event ${templateEventSlug} after series creation`,
      );
    } else if (templateEventAfterSeries.seriesSlug !== series.slug) {
      this.logger.error(
        `[SERIES_SLUG_LOST] SeriesSlug mismatch after transaction! Expected: ${series.slug}, Got: ${templateEventAfterSeries.seriesSlug || 'null'}`,
      );
      // This is considered a bug that needs to be fixed in the code, not via a retry mechanism
    } else {
      this.logger.debug(
        `SeriesSlug correctly set on template event after transaction: ${templateEventAfterSeries.seriesSlug}`,
      );
    }

    return series;
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
                  timeZone: templateEvent.timeZone || series.timeZone || 'UTC',
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

  @Trace('event-series.findBySlug')
  async findBySlug(
    slug: string,
    tenantId?: string,
  ): Promise<EventSeriesEntity> {
    try {
      // Validate slug parameter
      this.validateSlug(slug);

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
      if (!series.user || series.user.id !== userId) {
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
      if (!series.user || series.user.id !== userId) {
        throw new UnauthorizedException(
          'You do not have permission to delete this series',
        );
      }

      if (deleteEvents) {
        // Get all events in the series
        const [events] =
          await this.eventQueryService.findEventsBySeriesSlug(slug);

        // Track deletion failures to ensure data consistency
        const deletionErrors: Array<{ slug: string; error: Error }> = [];

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
            deletionErrors.push({
              slug: event.slug,
              error: eventDeleteError,
            });
          }
        }

        // If any events failed to delete, throw an error to prevent series deletion
        if (deletionErrors.length > 0) {
          const failedSlugs = deletionErrors.map((e) => e.slug).join(', ');
          throw new Error(
            `Failed to delete ${deletionErrors.length} event(s) from series: ${failedSlugs}. Series deletion aborted to maintain data consistency.`,
          );
        }
      } else {
        // Remove series association from events
        const [events] =
          await this.eventQueryService.findEventsBySeriesSlug(slug);
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

  /**
   * Version of generateFutureOccurrences that works within an existing transaction
   * to avoid creating a new transaction.
   */
  @Trace('event-series.generateFutureOccurrencesInTransaction')
  private async generateFutureOccurrencesInTransaction(
    templateEvent: EventEntity,
    series: EventSeriesEntity,
    recurrenceRule: any,
    userId: number,
    transactionalEntityManager: any,
  ): Promise<void> {
    this.logger.debug('Generating future occurrences within transaction');
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

    // Get the event repository from the transaction
    const eventRepository =
      transactionalEntityManager.getRepository(EventEntity);

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
          // Skip the template event's date
          if (
            occurrenceDate.getTime() ===
            new Date(templateEvent.startDate).getTime()
          ) {
            this.logger.debug('Skipping template event date', {
              date: occurrenceDate.toISOString(),
              templateEventSlug: templateEvent.slug,
              templateEventId: templateEvent.id,
            });
            return;
          }

          // Check if occurrence already exists by comparing dates
          const existingOccurrences = await eventRepository.find({
            where: {
              seriesSlug: series.slug,
            },
          });

          // Check if there's already an event at this exact date in the series
          const existingEventOnDate = existingOccurrences.find(
            (e) => new Date(e.startDate).getTime() === occurrenceDate.getTime(),
          );

          if (existingEventOnDate) {
            this.logger.debug('Occurrence already exists, skipping creation', {
              date: occurrenceDate.toISOString(),
              slug: existingEventOnDate.slug,
              id: existingEventOnDate.id,
            });
            return;
          }

          // Create a new occurrence using the template event as a base
          this.logger.debug('Creating occurrence', {
            date: occurrenceDate.toISOString(),
          });

          try {
            // Create a new event based on the template
            const newOccurrence = new EventEntity();

            // Copy properties from the template event
            Object.assign(newOccurrence, {
              name: templateEvent.name,
              description: templateEvent.description,
              type: templateEvent.type,
              location: templateEvent.location,
              locationOnline: templateEvent.locationOnline,
              maxAttendees: templateEvent.maxAttendees,
              visibility: templateEvent.visibility,
              status: templateEvent.status,
              lat: templateEvent.lat,
              lon: templateEvent.lon,
              startDate: occurrenceDate,
              endDate: templateEvent.endDate
                ? new Date(
                    occurrenceDate.getTime() +
                      (templateEvent.endDate.getTime() -
                        templateEvent.startDate.getTime()),
                  )
                : null,
              seriesSlug: series.slug,
              series: series, // Set the relationship explicitly
              requireApproval: templateEvent.requireApproval,
              approvalQuestion: templateEvent.approvalQuestion,
              requireGroupMembership: templateEvent.requireGroupMembership,
              allowWaitlist: templateEvent.allowWaitlist,
              user: { id: userId },
              matrixRoomId: templateEvent.matrixRoomId,
              group: templateEvent.group,
              image: templateEvent.image,
            });

            // Generate ULID and slug
            newOccurrence.generateUlid();
            newOccurrence.generateSlug();

            // Save the new occurrence
            await eventRepository.save(newOccurrence);

            this.logger.debug('Occurrence created successfully', {
              slug: newOccurrence.slug,
              date: occurrenceDate.toISOString(),
              seriesSlug: newOccurrence.seriesSlug,
            });
          } catch (error) {
            this.logger.error(
              `Error creating occurrence: ${error.message}`,
              error.stack,
            );
            throw error;
          }
        }),
      );
    }
  }

  /**
   * Create a series occurrence
   * @deprecated Use EventSeriesOccurrenceService.getOrCreateOccurrence instead
   */
  @Trace('event-series.createSeriesOccurrence')
  async createSeriesOccurrence(
    eventData: CreateEventDto,
    userId: number,
    seriesSlug: string,
    occurrenceDate: Date,
  ): Promise<EventEntity> {
    this.logger.warn(
      'createSeriesOccurrence is deprecated. Use EventSeriesOccurrenceService.getOrCreateOccurrence instead',
    );
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
    const { event } = await this.eventManagementService.create(
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
      if (
        !event.user ||
        !series.user ||
        event.user.id !== userId ||
        series.user.id !== userId
      ) {
        throw new BadRequestException(
          'You do not have permission to perform this action',
        );
      }

      // Associate the event with the series
      event.seriesSlug = series.slug;

      // Save the updated event
      const { event: updatedEvent } = await this.eventManagementService.update(
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
