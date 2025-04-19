import {
  Injectable,
  Scope,
  Inject,
  Logger,
  UnprocessableEntityException,
  NotFoundException,
  HttpStatus,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { CategoryService } from '../../category/category.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FilesS3PresignedService } from '../../file/infrastructure/uploader/s3-presigned/file.service';
import { EventRoleService } from '../../event-role/event-role.service';
import { UserService } from '../../user/user.service';
import { EventMailService } from '../../event-mail/event-mail.service';
import { AuditLoggerService } from '../../logger/audit-logger.provider';
import { BlueskyService } from '../../bluesky/bluesky.service';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import {
  EventStatus,
  EventVisibility,
  EventAttendeeRole,
  EventAttendeeStatus,
  EventType,
} from '../../core/constants/constant';
import { EventSourceType } from '../../core/constants/source-type.constant';
import { CategoryEntity } from '../../category/infrastructure/persistence/relational/entities/categories.entity';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { CreateEventAttendeeDto } from '../../event-attendee/dto/create-eventAttendee.dto';
import { UpdateEventAttendeeDto } from '../../event-attendee/dto/update-eventAttendee.dto';
import { EventSeriesService } from '../../event-series/services/event-series.service';
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';
import { UserEntity } from '../../user/infrastructure/persistence/relational/entities/user.entity';
import { Not, IsNull } from 'typeorm';
import { RecurrenceFrequency } from '../../event-series/interfaces/recurrence.interface';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';

@Injectable({ scope: Scope.REQUEST })
export class EventManagementService {
  private readonly auditLogger = AuditLoggerService.getInstance();
  private readonly logger = new Logger(EventManagementService.name);
  private readonly tracer = trace.getTracer('event-management-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventEmitter: EventEmitter2,
    private readonly fileService: FilesS3PresignedService,
    private readonly eventRoleService: EventRoleService,
    private readonly userService: UserService,
    private readonly eventMailService: EventMailService,
    @Inject(forwardRef(() => BlueskyService))
    private readonly blueskyService: BlueskyService,
    @Inject(forwardRef(() => 'DiscussionService'))
    private readonly discussionService: any, // Using any here to avoid circular dependency issues
    @Inject(forwardRef(() => EventSeriesService))
    private readonly eventSeriesService: EventSeriesService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-management.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  @Trace('event-management.create')
  async create(
    createEventDto: CreateEventDto,
    userId: number,
    _options: Record<string, unknown> = {},
  ): Promise<EventEntity> {
    this.logger.debug('Creating event with dto:', createEventDto);

    await this.initializeRepository();

    // Handle series lookup if seriesSlug is provided
    let seriesId: number | undefined;
    if (createEventDto.seriesSlug) {
      const series = await this.eventSeriesService.findBySlug(
        createEventDto.seriesSlug,
      );
      if (!series) {
        throw new NotFoundException(
          `Event series with slug ${createEventDto.seriesSlug} not found`,
        );
      }
      seriesId = series.id;
    }

    // Handle categories
    let categories: CategoryEntity[] = [];
    try {
      categories = await this.categoryService.findByIds(
        createEventDto.categories,
      );
    } catch (error) {
      throw new Error(`Error finding categories: ${error.message}`);
    }

    // Handle location
    let locationPoint;
    if (createEventDto.lat && createEventDto.lon) {
      const { lat, lon } = createEventDto;
      if (isNaN(lat) || isNaN(lon)) {
        throw new Error('Invalid latitude or longitude');
      }
      locationPoint = {
        type: 'Point',
        coordinates: [lon, lat],
      };
    }

    // Set default values and prepare base event data
    const eventData = {
      name: createEventDto.name,
      description: createEventDto.description,
      type: createEventDto.type as EventType,
      status: createEventDto.status || EventStatus.Published,
      visibility: createEventDto.visibility || EventVisibility.Public,
      startDate: createEventDto.startDate,
      endDate: createEventDto.endDate,
      locationOnline: createEventDto.locationOnline,
      maxAttendees: createEventDto.maxAttendees,
      requireApproval: createEventDto.requireApproval,
      approvalQuestion: createEventDto.approvalQuestion,
      requireGroupMembership: createEventDto.requireGroupMembership,
      allowWaitlist: createEventDto.allowWaitlist,
      location: createEventDto.location,
      lat: createEventDto.lat,
      lon: createEventDto.lon,
      locationPoint,
      user: { id: userId } as UserEntity,
      group: createEventDto.group
        ? { id: Number(createEventDto.group.id) }
        : null,
      image: createEventDto.image,
      categories,
      seriesId,
      seriesSlug: createEventDto.seriesSlug,

      // Recurrence fields
      isRecurring: !!createEventDto.recurrenceRule,
      timeZone: createEventDto.timeZone || 'UTC',
      recurrenceRule: {
        ...createEventDto.recurrenceRule,
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
      },
      recurrenceExceptions: createEventDto.recurrenceExceptions || [],

      // Additional RFC 5545/7986 properties
      securityClass: createEventDto.securityClass,
      priority: createEventDto.priority,
      blocksTime: createEventDto.blocksTime ?? true,
      isAllDay: createEventDto.isAllDay,
      resources: createEventDto.resources,
      color: createEventDto.color,
      conferenceData: createEventDto.conferenceData,
    };

    let createdEvent;

    // If this is a Bluesky event and it's being published, create it in Bluesky first
    if (
      createEventDto.sourceType === 'bluesky' &&
      eventData.status === EventStatus.Published
    ) {
      this.logger.debug('Attempting to create Bluesky event');
      try {
        // Create the event entity
        const event = this.eventRepository.create(
          eventData as Partial<EventEntity>,
        );
        this.logger.debug(
          `[CREATE Pre-Save] Event location: ${event?.location || 'undefined'}`,
        );

        // Generate ULID and slug before Bluesky creation
        event.generateUlid();
        event.generateSlug();

        // Create in Bluesky first to get the rkey
        const { rkey } = await this.blueskyService.createEventRecord(
          event,
          createEventDto.sourceId ?? '',
          createEventDto.sourceData?.handle ?? '',
          this.request.tenantId,
        );

        this.logger.debug('Successfully created Bluesky event');

        // Store Bluesky-specific data in source fields
        event.sourceType = EventSourceType.BLUESKY;
        event.sourceId = createEventDto.sourceId ?? '';
        event.sourceUrl = `https://bsky.app/profile/${createEventDto.sourceData?.handle}/post/${rkey}`;
        event.sourceData = {
          rkey,
          handle: createEventDto.sourceData?.handle,
        };
        event.lastSyncedAt = new Date();

        // Save the event with Bluesky metadata
        createdEvent = await this.eventRepository.save(event);
      } catch (error) {
        this.logger.error('Failed to create event in Bluesky:', {
          error: error.message,
          stack: error.stack,
        });
        throw new UnprocessableEntityException(
          'Failed to create event in Bluesky. Please try again.',
        );
      }
    } else {
      // For non-Bluesky events, just save directly to database
      const event = this.eventRepository.create(
        eventData as Partial<EventEntity>,
      );
      this.logger.debug(
        `[CREATE Pre-Save] Event location: ${event?.location || 'undefined'}`,
      );

      // Explicitly log seriesSlug before saving
      if (createEventDto.seriesSlug) {
        this.logger.debug(
          `[CREATE Pre-Save] Event seriesSlug: ${event.seriesSlug}`,
        );
      }

      createdEvent = await this.eventRepository.save(event);

      // Verify seriesSlug was preserved after saving
      if (createEventDto.seriesSlug && !createdEvent.seriesSlug) {
        this.logger.warn(
          `SeriesSlug lost during save! Restoring seriesSlug: ${createEventDto.seriesSlug}`,
        );
        // Restore the seriesSlug if it was lost
        createdEvent.seriesSlug = createEventDto.seriesSlug;
        createdEvent = await this.eventRepository.save(createdEvent);
      }
    }

    this.logger.debug(
      '[CREATE Post-Save] Event location:',
      createdEvent?.location || 'undefined',
    );
    // Also log seriesSlug status after save
    this.logger.debug(
      '[CREATE Post-Save] Event seriesSlug:',
      createdEvent?.seriesSlug || 'null',
    );
    this.logger.debug('Saved event in database:', {
      id: createdEvent.id,
      sourceType: createdEvent.sourceType,
      seriesSlug: createdEvent.seriesSlug,
    });

    // Add host as first attendee
    const hostRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Host,
    );

    const user = await this.userService.getUserById(userId);

    await this.eventAttendeeService.create({
      role: hostRole,
      status: EventAttendeeStatus.Confirmed,
      user,
      event: createdEvent,
    });

    this.auditLogger.log('event created', {
      createdEvent,
      source: createEventDto.sourceType,
    });

    // Add tenantId to the event object for event listeners
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      this.logger.error('No tenant ID available when emitting event.created');
    }

    // Clone event and add tenantId
    const eventWithTenant = {
      ...createdEvent,
      tenantId: tenantId,
    };

    this.logger.log(`Emitting event.created with tenantId: ${tenantId}`);
    this.logger.log(
      `Event data: ${JSON.stringify({
        id: createdEvent.id,
        name: createdEvent.name,
        slug: createdEvent.slug,
        tenantId: tenantId,
      })}`,
    );

    this.eventEmitter.emit('event.created', eventWithTenant);

    // Note: Recurrence is now handled by EventSeries, not through EventEntity directly

    return createdEvent;
  }

  @Trace('event-management.update')
  async update(
    slug: string,
    updateEventDto: UpdateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    await this.initializeRepository();

    this.logger.debug(`Starting update for event ${slug} by user ${userId}`);
    this.logger.debug(
      `UpdateEventDto contains: ${JSON.stringify(updateEventDto, null, 2)}`,
    );

    const event = await this.eventRepository.findOneOrFail({
      where: { slug },
    });

    this.logger.debug(
      `Found event ${slug} (ID: ${event.id}) with current seriesSlug: ${event.seriesSlug || 'null'}`,
    );

    // Store the original seriesSlug for validation after update
    const originalSeriesSlug = event.seriesSlug;

    // Create a base update object without categories
    const mappedDto: any = {
      ...updateEventDto,
      type: updateEventDto.type as EventType,
      user: { id: userId },
      group: updateEventDto.group ? { id: Number(updateEventDto.group) } : null,
    };

    // Explicit check for seriesSlug updates - add debug logging
    if (updateEventDto.seriesSlug !== undefined) {
      this.logger.debug(
        `Updating event ${slug} with seriesSlug: ${updateEventDto.seriesSlug}`,
      );
      // Ensure seriesSlug is explicitly set in mappedDto
      mappedDto.seriesSlug = updateEventDto.seriesSlug;
    } else if (event.seriesSlug) {
      // Explicitly preserve the existing seriesSlug if it's not being intentionally updated
      // This prevents unintentional disconnection from series
      this.logger.debug(
        `Preserving existing seriesSlug: ${event.seriesSlug} for event ${slug}`,
      );
      mappedDto.seriesSlug = event.seriesSlug;
    }

    // Handle categories separately
    if (updateEventDto.categories?.length) {
      const categories = await this.categoryService.findByIds(
        updateEventDto.categories,
      );
      mappedDto.categories = categories;
    }

    // Handle image
    if (updateEventDto.image?.id === 0) {
      if (updateEventDto.image) {
        await this.fileService.delete(updateEventDto.image.id);
        mappedDto.image = undefined;
      }
    } else if (updateEventDto.image?.id) {
      const fileObject = await this.fileService.findById(
        updateEventDto.image.id,
      );

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }

      mappedDto.image = fileObject;
    }

    this.auditLogger.log('event updated', {
      context: {
        event,
        mappedDto,
      },
    });

    // Check if we need to update recurrence properties
    if (updateEventDto.recurrenceRule) {
      // If this is a new recurrence being added to a non-recurring event
      if (!event.seriesSlug) {
        // Check if the event is already being processed for series creation
        const isProcessing = await this.eventRepository.findOne({
          where: {
            id: event.id,
            seriesSlug: Not(IsNull()),
          },
        });

        if (isProcessing) {
          // If the event is already being processed, wait a bit and try again
          await new Promise((resolve) => setTimeout(resolve, 100));
          return this.update(slug, updateEventDto, userId);
        }

        // Check if event already has a series slug to prevent loops
        if (event.seriesSlug) {
          this.logger.log(
            `Event ${slug} already has a series, skipping series creation`,
          );
          const updatedEvent = this.eventRepository.merge(event, mappedDto);
          await this.eventRepository.save(updatedEvent);
          return updatedEvent;
        }

        // Create a new series from this event
        const series = await this.eventSeriesService.createFromExistingEvent(
          slug,
          updateEventDto.recurrenceRule,
          userId,
        );

        // Update the original event to be the first occurrence of the series
        const updatedEvent = this.eventRepository.merge(event, {
          seriesSlug: series.slug,
          // Keep the original event name and other properties
          name: event.name,
          description: event.description,
          type: event.type,
          location: event.location,
          locationOnline: event.locationOnline,
          maxAttendees: event.maxAttendees,
          requireApproval: event.requireApproval,
          approvalQuestion: event.approvalQuestion,
          allowWaitlist: event.allowWaitlist,
          categories: event.categories,
        });
        await this.eventRepository.save(updatedEvent);

        // Return the updated event
        return updatedEvent;
      }

      // If the event is already part of a series, just update the recurrence rule
      mappedDto.timeZone = updateEventDto.timeZone || 'UTC';
      mappedDto.recurrenceRule = {
        ...updateEventDto.recurrenceRule,
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
      };
    } else if (updateEventDto.recurrenceRule === null) {
      // If recurrenceRule is explicitly set to null, disable recurring status
      mappedDto.isRecurring = false;
      mappedDto.recurrenceRule = null;
    }

    // Before saving, make sure seriesSlug is explicitly set in the event object
    // if it should be preserved
    const expectedSeriesSlug =
      mappedDto.seriesSlug !== undefined
        ? mappedDto.seriesSlug
        : originalSeriesSlug;

    const updatedEvent = this.eventRepository.merge(event, mappedDto);

    // Double-check that seriesSlug is still set correctly before saving
    if (expectedSeriesSlug && updatedEvent.seriesSlug !== expectedSeriesSlug) {
      this.logger.warn(
        `SeriesSlug was unexpectedly changed during merge! Restoring to ${expectedSeriesSlug}`,
      );
      updatedEvent.seriesSlug = expectedSeriesSlug;
    }

    this.logger.debug(
      `[UPDATE Pre-Save] Event location: ${updatedEvent.location}`,
    );
    // Add debug for seriesSlug pre-save
    this.logger.debug(
      `[UPDATE Pre-Save] Event ${updatedEvent.id} (${updatedEvent.slug}) seriesSlug: ${updatedEvent.seriesSlug}`,
    );

    const savedEvent = await this.eventRepository.save(updatedEvent);

    // Add debug for seriesSlug post-save
    this.logger.debug(
      `[UPDATE Post-Save] Event ${savedEvent.id} (${savedEvent.slug}) seriesSlug: ${savedEvent.seriesSlug}`,
    );

    // Additional validation: check if seriesSlug was unexpectedly lost during save
    // and restore it if necessary
    if (expectedSeriesSlug && !savedEvent.seriesSlug) {
      this.logger.warn(
        `SeriesSlug lost during save operation! Restoring seriesSlug: ${expectedSeriesSlug}`,
      );
      // Directly update the seriesSlug field and save again
      savedEvent.seriesSlug = expectedSeriesSlug;
      await this.eventRepository.save(savedEvent);

      this.logger.debug(
        `[UPDATE Post-Fix] Event ${savedEvent.id} (${savedEvent.slug}) seriesSlug: ${savedEvent.seriesSlug}`,
      );
    }

    // If user has Bluesky credentials and event is published, update on Bluesky
    if (
      updateEventDto.sourceType === 'bluesky' &&
      updatedEvent.status === EventStatus.Published
    ) {
      try {
        await this.blueskyService.createEventRecord(
          updatedEvent,
          updateEventDto.sourceId || '',
          updateEventDto.sourceData?.handle || '',
          this.request.tenantId,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update event on Bluesky: ${error.message}`,
        );
      }
    }

    return savedEvent;
  }

  @Trace('event-management.remove')
  async remove(slug: string): Promise<void> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['series'],
    });
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    const eventCopy = { ...event };

    // Check if we have a valid authenticated user
    if (!this.request.user?.id) {
      throw new UnprocessableEntityException(
        'User must be authenticated to delete an event',
      );
    }

    this.logger.debug('Starting event removal:', {
      eventId: event.id,
      name: event.name,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      userBlueskyConnected:
        !!this.request.user?.preferences?.bluesky?.connected,
      requestUser: this.request.user,
    });

    // Get latest user data with preferences to check Bluesky connection state
    const currentUser = await this.userService.findByIdWithPreferences(
      this.request.user.id,
      this.request.tenantId,
    );

    if (!currentUser) {
      throw new UnprocessableEntityException(
        'Failed to retrieve current user data',
      );
    }

    this.logger.debug('Current user data:', {
      id: currentUser?.id,
      socialId: currentUser?.socialId,
      blueskyPreferences: currentUser?.preferences?.bluesky,
    });

    // If the event is a Bluesky event and the user is connected to Bluesky, attempt to delete it there
    if (
      event.sourceType === EventSourceType.BLUESKY && // check if event came from Bluesky
      currentUser?.preferences?.bluesky?.connected && // confirm user is connected to Bluesky
      currentUser?.socialId && // ensure we have user's DID
      event.sourceId && // ensure we have event creator's DID
      event.sourceData?.rkey // ensure we have the Bluesky record key
    ) {
      this.logger.debug('Attempting Bluesky deletion with:', {
        eventName: event.name,
        eventSlug: event.slug,
        eventSourceId: event.sourceId, // creator's DID
        eventRkey: event.sourceData.rkey,
        userDid: currentUser.socialId,
        tenantId: this.request.tenantId,
      });

      try {
        // Verify we have all required data for Bluesky deletion
        if (!event.sourceData?.rkey) {
          throw new Error('Missing Bluesky record key (rkey)');
        }

        // Use the current user's DID for deletion
        await this.blueskyService.deleteEventRecord(
          event,
          currentUser.socialId, // Use current user's DID
          this.request.tenantId,
        );

        this.logger.debug('Successfully deleted Bluesky event record:', {
          eventName: event.name,
          eventRkey: event.sourceData.rkey,
          userDid: currentUser.socialId,
        });
      } catch (error) {
        // Handle any other errors in the outer try block
        this.logger.error('Unexpected error during Bluesky event deletion:', {
          error: error.message,
          stack: error.stack,
          eventId: event.id,
          eventSlug: event.slug,
        });
        // Continue with local deletion
        this.logger.warn(
          'Proceeding with local event deletion despite unexpected error',
        );
      }
    }

    // Get a database connection for transaction
    const dataSource = await this.tenantConnectionService.getTenantConnection(
      this.request.tenantId,
    );

    // Use a transaction to ensure atomicity
    await dataSource
      .transaction(async (transactionalEntityManager) => {
        this.logger.log(`Starting transaction for event deletion: ${event.id}`);

        // Step 1: Cleanup chat rooms first to prevent foreign key constraint errors
        try {
          // First attempt to clean up via discussionService if available
          if (
            this.discussionService &&
            typeof this.discussionService.cleanupEventChatRooms === 'function'
          ) {
            this.logger.log(
              `Cleaning up chat rooms for event ${event.id} via discussionService`,
            );
            await this.discussionService.cleanupEventChatRooms(
              event.id,
              this.request.tenantId,
            );
            this.logger.log(
              `Successfully cleaned up chat rooms for event ${event.id}`,
            );
          } else {
            // Direct cleanup as fallback if discussionService is not available
            this.logger.warn(
              `discussionService not available, using direct SQL queries for chatroom cleanup`,
            );

            // Check if there are any chat rooms to clean up first
            const chatRooms = await transactionalEntityManager.query(
              'SELECT COUNT(*) as count FROM "chatRooms" WHERE "eventId" = $1',
              [event.id],
            );

            const roomCount = parseInt(chatRooms[0]?.count || '0', 10);

            if (roomCount > 0) {
              this.logger.log(
                `Found ${roomCount} chat rooms to clean up for event ${event.id}`,
              );

              // Delete chat room members first due to foreign key constraints
              await transactionalEntityManager.query(
                'DELETE FROM "userChatRooms" WHERE "chatRoomId" IN (SELECT id FROM "chatRooms" WHERE "eventId" = $1)',
                [event.id],
              );

              // Then delete the chat rooms themselves
              await transactionalEntityManager.query(
                'DELETE FROM "chatRooms" WHERE "eventId" = $1',
                [event.id],
              );

              this.logger.log(
                `Successfully cleaned up chat rooms for event ${event.id} via direct queries`,
              );
            } else {
              this.logger.log(
                `No chat rooms found for event ${event.id}, skipping cleanup`,
              );
            }
          }
        } catch (chatCleanupError) {
          this.logger.error(
            `Error cleaning up chat rooms for event ${event.id}: ${chatCleanupError.message}`,
            chatCleanupError.stack,
          );
          // Rethrow to trigger transaction rollback
          throw new Error(
            `Failed to clean up chat rooms: ${chatCleanupError.message}`,
          );
        }

        // Step 2: Clear Matrix room ID reference
        if (event.matrixRoomId) {
          event.matrixRoomId = '';
          await transactionalEntityManager.save(EventEntity, event);
          this.logger.log(`Cleared Matrix room ID for event ${event.id}`);
        }

        // Step 3: Delete related event attendees
        try {
          const eventAttendeeRepo =
            transactionalEntityManager.getRepository(EventAttendeesEntity);
          await eventAttendeeRepo.delete({ event: { id: event.id } });
          this.logger.log(`Deleted attendees for event ${event.id}`);
        } catch (attendeeError) {
          this.logger.error(
            `Error deleting event attendees: ${attendeeError.message}`,
            attendeeError.stack,
          );
          // Rethrow to trigger transaction rollback
          throw new Error(
            `Failed to delete event attendees: ${attendeeError.message}`,
          );
        }

        // Step 4: Handle series exceptions if needed
        if (event.seriesSlug) {
          try {
            this.logger.log(
              `Adding deleted event date to series exceptions: ${event.id}`,
            );

            // Find the series by slug
            let series: EventSeriesEntity | null = null;

            if (event.series) {
              series = event.series;
            } else if (event.seriesSlug) {
              series = await transactionalEntityManager.findOne(
                EventSeriesEntity,
                {
                  where: { slug: event.seriesSlug },
                },
              );
            }

            if (series && event.startDate) {
              // Get the event's date string
              const exceptionDate = new Date(event.startDate).toISOString();

              // Ensure the series has an exceptions array
              if (!series.recurrenceExceptions) {
                series.recurrenceExceptions = [];
              }

              // Add the date to the exceptions if not already there
              if (!series.recurrenceExceptions.includes(exceptionDate)) {
                series.recurrenceExceptions.push(exceptionDate);

                // Save the series with the transaction manager
                await transactionalEntityManager.save(
                  EventSeriesEntity,
                  series,
                );

                this.logger.log(
                  `Added ${exceptionDate} to exceptions for series ${series.id}`,
                );
              }
            }
          } catch (seriesError) {
            this.logger.error(
              `Error updating series exceptions: ${seriesError.message}`,
              seriesError.stack,
            );
            // Continue with event deletion despite error in series update
          }
        }

        // Step 5: Finally, delete the event itself
        try {
          await transactionalEntityManager.remove(EventEntity, event);
          this.logger.log(`Successfully deleted event ${event.id}`);
        } catch (deleteError) {
          this.logger.error(
            `Error deleting event: ${deleteError.message}`,
            deleteError.stack,
          );
          // Rethrow to trigger transaction rollback
          throw new Error(`Failed to delete event: ${deleteError.message}`);
        }
      })
      .then(() => {
        // Transaction succeeded - emit events and log
        this.eventEmitter.emit('event.deleted', eventCopy);
        this.auditLogger.log('event deleted', { event: eventCopy });
        this.logger.log(
          `Successfully completed deletion of event ${eventCopy.id}`,
        );
      })
      .catch((transactionError) => {
        // Transaction failed - log and rethrow
        this.logger.error(
          `Transaction failed for event deletion: ${transactionError.message}`,
          transactionError.stack,
        );
        throw new UnprocessableEntityException(
          `Failed to delete event: ${transactionError.message}`,
        );
      });
  }

  /**
   * Create a new occurrence of a recurring event series
   */
  @Trace('event-management.createSeriesOccurrence')
  async createSeriesOccurrence(
    eventData: CreateEventDto,
    userId: number,
    seriesSlug: string,
    occurrenceDate: Date,
  ): Promise<EventEntity> {
    await this.initializeRepository();

    // Check if the series exists
    const series = await this.eventSeriesService.findBySlug(seriesSlug);

    if (!series) {
      throw new NotFoundException(
        `Event series with slug ${seriesSlug} not found`,
      );
    }

    // Create the event with series relationship
    const event = await this.create(
      {
        ...eventData,
        startDate: occurrenceDate,
        seriesSlug,
      },
      userId,
      {}, // No options needed since materialized property is computed, not stored
    );

    // Reload the event to get the updated fields
    const updatedEvent = await this.eventRepository.findOne({
      where: { id: event.id },
      relations: ['user', 'group', 'categories', 'image'],
    });

    if (!updatedEvent) {
      throw new NotFoundException(
        `Event with ID ${event.id} not found after update`,
      );
    }

    return updatedEvent;
  }

  /**
   * @deprecated Use createSeriesOccurrence with slug instead
   */
  @Trace('event-management.createSeriesOccurrenceBySlug')
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
   * Update an event occurrence that is part of a series
   * This method uses the event's slug, which is the correct approach for user-facing code
   */
  @Trace('event-management.updateSeriesOccurrence')
  async updateSeriesOccurrence(
    slug: string,
    updateEventDto: UpdateEventDto,
    userId: number,
    markAsModified: boolean = true,
  ): Promise<EventEntity> {
    try {
      await this.initializeRepository();

      // Use the EventQueryService to find events by slug
      const event = await this.eventRepository.findOne({ where: { slug } });

      if (!event) {
        this.logger.error(`Event with slug ${slug} not found`);
        throw new NotFoundException('Event not found');
      }

      // Check if user has permission to update the event
      if (event.user?.id !== userId) {
        // If the user is not the owner, check if they have admin rights
        const user = await this.userService.findById(userId);
        if (!user || !user.role || user.role.name !== 'admin') {
          throw new UnprocessableEntityException(
            'User is not authorized to modify this event',
          );
        }
      }

      // Update the event with the new data
      const updatedEvent = await this.update(slug, updateEventDto, userId);

      // If this is a series occurrence and need to mark as modified, we already have the needed data
      if (event.seriesSlug && markAsModified) {
        // No need to set materialized flag since it's computed, not stored

        // Reload the event with the updated fields
        const reloadedEvent = await this.eventRepository.findOne({
          where: { id: event.id },
          relations: ['user', 'group', 'categories', 'image'],
        });

        if (!reloadedEvent) {
          throw new NotFoundException(
            `Event with ID ${event.id} not found after update`,
          );
        }

        // Log audit
        this.auditLogger.log(
          'Series occurrence modified',
          {
            context: {
              eventId: event.id,
              seriesSlug: event.seriesSlug,
              userId,
            },
          },
          userId,
        );

        return reloadedEvent;
      }

      return updatedEvent;
    } catch (error) {
      this.logger.error(
        `Error updating series occurrence: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Find all events (occurrences) that belong to a series by ID
   * @internal This method is primarily for internal use - prefer findEventsBySeriesSlug for user-facing code
   */
  @Trace('event-management.findEventsBySeriesId')
  async findEventsBySeriesId(
    seriesId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventEntity[], number]> {
    try {
      await this.initializeRepository();

      const page = options?.page || 1;
      const limit = options?.limit || 10;

      this.logger.debug(
        `Finding events for series ID ${seriesId}, page ${page}, limit ${limit}`,
      );

      // Get the series to find its slug since we need to query by slug, not ID
      const dataSource = await this.tenantConnectionService.getTenantConnection(
        this.request.tenantId,
      );
      const seriesRepository = dataSource.getRepository(EventSeriesEntity);
      const series = await seriesRepository.findOne({
        where: { id: seriesId },
      });

      if (!series) {
        this.logger.warn(`Series with ID ${seriesId} not found`);
        return [[], 0];
      }

      this.logger.debug(
        `Found series with slug ${series.slug}, using it to query events`,
      );

      // Query using seriesSlug field in the events table
      const queryBuilder = this.eventRepository
        .createQueryBuilder('event')
        .where('event.seriesSlug = :seriesSlug', { seriesSlug: series.slug })
        .leftJoinAndSelect('event.user', 'user')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.image', 'image')
        .orderBy('event.startDate', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      try {
        const [events, total] = await queryBuilder.getManyAndCount();
        this.logger.debug(
          `Found ${events.length} events for series ID ${seriesId} with slug ${series.slug}`,
        );
        return [events, total];
      } catch (queryError) {
        this.logger.error(`Database query error: ${queryError.message}`);
        return [[], 0];
      }
    } catch (error) {
      this.logger.error(
        `Error finding events by seriesId: ${error.message}`,
        error.stack,
      );
      return [[], 0];
    }
  }

  /**
   * Find all events (occurrences) that belong to a series by the series slug
   * This is the preferred method for user-facing code
   */
  @Trace('event-management.findEventsBySeriesSlug')
  async findEventsBySeriesSlug(
    seriesSlug: string,
    options?: { page: number; limit: number },
    tenantId?: string,
  ): Promise<[EventEntity[], number]> {
    try {
      this.logger.debug(`Finding events for series slug ${seriesSlug}`);

      // Get the series by slug using the EventSeriesService
      const series = await this.eventSeriesService.findBySlug(
        seriesSlug,
        tenantId,
      );

      if (!series) {
        this.logger.warn(`Series with slug ${seriesSlug} not found`);
        return [[], 0];
      }

      // Get the ID and directly query by ID
      const seriesId = series.id;
      this.logger.debug(
        `Series ${seriesSlug} has ID ${seriesId}, querying events`,
      );

      return this.findEventsBySeriesId(seriesId, options);
    } catch (error) {
      this.logger.error(
        `Error finding events by series slug: ${error.message}`,
        error.stack,
      );
      return [[], 0]; // Return empty results instead of throwing to prevent hanging
    }
  }

  @Trace('event-management.deleteEventsByGroup')
  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.initializeRepository();

    // First find all events for this group
    const events = await this.eventRepository.find({
      where: { group: { id: groupId } },
      select: ['id', 'slug'],
      relations: ['series'],
    });

    // Delete each event individually to ensure proper cleanup of related entities
    for (const event of events) {
      try {
        // Clean up chat rooms for this event (this handles the foreign key dependencies)
        try {
          if (
            this.discussionService &&
            typeof this.discussionService.cleanupEventChatRooms === 'function'
          ) {
            this.logger.log(`Cleaning up chat rooms for event ${event.id}`);
            await this.discussionService.cleanupEventChatRooms(
              event.id,
              this.request.tenantId,
            );
            this.logger.log(
              `Successfully cleaned up chat rooms for event ${event.id}`,
            );
          } else {
            this.logger.warn(
              `discussionService.cleanupEventChatRooms is not available. This might cause FK constraint violations.`,
            );

            // Add this as a proper todo for the engineering team
            this.logger.error(
              `TODO: Implement proper chat room cleanup in the event management service that doesn't rely on discussionService`,
            );
          }
        } catch (chatCleanupError) {
          this.logger.error(
            `Error cleaning up chat rooms for event ${event.id}: ${chatCleanupError.message}`,
            chatCleanupError.stack,
          );
          // Continue with deletion despite the error
        }

        // Make sure to clear Matrix room ID from event to avoid stale references
        if (event.matrixRoomId) {
          event.matrixRoomId = '';
          await this.eventRepository.save(event);
        }

        // Clean up occurrences if this is a recurring event
        if (event.series) {
          try {
            // Find all events that belong to this series except the current one
            const [events] = await this.findEventsBySeriesId(event.series.id);
            const occurrencesToDelete = events.filter(
              (occurrence) => occurrence.id !== event.id,
            );

            // Delete each occurrence
            let deletedCount = 0;
            for (const occurrence of occurrencesToDelete) {
              await this.eventRepository.remove(occurrence);
              deletedCount++;
            }

            this.logger.log(
              `Deleted ${deletedCount} occurrences of event ${event.slug} (ID: ${event.id})`,
            );
          } catch (error) {
            this.logger.error(
              `Error cleaning up occurrences for event ${event.id}: ${error.message}`,
              error.stack,
            );
          }
        }

        // Now that chat rooms are deleted, we can delete the event itself
        await this.eventRepository.delete(event.id);
        this.logger.log(
          `Deleted event ${event.slug} (ID: ${event.id}) from group ${groupId}`,
        );
      } catch (error) {
        this.logger.error(
          `Error deleting event ${event.id} from group ${groupId}: ${error.message}`,
        );
        // Continue with other events
      }
    }

    this.auditLogger.log('events deleted by group', {
      groupId,
      eventCount: events.length,
    });
  }

  @Trace('event-management.attendEvent')
  async attendEvent(
    slug: string,
    userId: number,
    createEventAttendeeDto: CreateEventAttendeeDto,
  ) {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    const user = await this.userService.getUserById(userId);
    const eventAttendee =
      await this.eventAttendeeService.findEventAttendeeByUserId(
        event.id,
        user.id,
      );

    if (
      eventAttendee &&
      eventAttendee.status !== EventAttendeeStatus.Cancelled
    ) {
      return eventAttendee;
    }

    const participantRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Participant,
    );

    // Create the attendee with appropriate status based on event settings
    let attendeeStatus = EventAttendeeStatus.Confirmed;
    if (event.allowWaitlist) {
      const count = await this.eventAttendeeService.showEventAttendeesCount(
        event.id,
      );
      if (count >= event.maxAttendees) {
        attendeeStatus = EventAttendeeStatus.Waitlist;
      }
    }
    if (event.requireApproval) {
      attendeeStatus = EventAttendeeStatus.Pending;
    }

    // Create the attendee
    const attendee = await this.eventAttendeeService.create({
      ...createEventAttendeeDto,
      event,
      user,
      status: attendeeStatus,
      role: participantRole,
    });

    await this.eventMailService.sendMailAttendeeGuestJoined(attendee);

    // Emit event for other parts of the system
    this.eventEmitter.emit('event.attendee.added', {
      eventId: event.id,
      userId: user.id,
      status: attendeeStatus,
      tenantId: this.request.tenantId,
      eventSlug: event.slug,
      userSlug: user.slug,
    });

    return attendee;
  }

  @Trace('event-management.cancelAttendingEvent')
  async cancelAttendingEvent(slug: string, userId: number) {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    return await this.eventAttendeeService.cancelEventAttendance(
      event.id,
      userId,
    );
  }

  @Trace('event-management.updateEventAttendee')
  async updateEventAttendee(
    slug: string,
    attendeeId: number,
    updateEventAttendeeDto: UpdateEventAttendeeDto,
  ) {
    await this.initializeRepository();

    await this.eventRepository.findOneOrFail({ where: { slug } });

    await this.eventAttendeeService.updateEventAttendee(
      attendeeId,
      updateEventAttendeeDto,
    );

    await this.eventMailService.sendMailAttendeeStatusChanged(attendeeId);

    return await this.eventAttendeeService.showEventAttendee(attendeeId);
  }

  async delete(id: number): Promise<void> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['series'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    // If this is part of a series, handle series deletion
    if (event.series) {
      // Get the current user id for proper series deletion
      const userId = this.request?.user?.id;
      await this.eventSeriesService.delete(event.series.slug, userId);
    }

    // Delete event attendees
    await this.eventAttendeeService.deleteEventAttendees(id);

    // Delete the event
    await this.eventRepository.delete(id);
  }

  // Note: Recurrence management is now handled by EventSeries functionality
  // The following methods are kept for backward compatibility but delegate to EventSeriesService

  async createRecurringEvent(
    createEventDto: CreateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    // First create the template event
    const templateEvent = await this.create(createEventDto, userId);

    // Create a series with the template event's slug
    const series = await this.eventSeriesService.create(
      {
        name: createEventDto.name,
        description: createEventDto.description,
        recurrenceRule: createEventDto.recurrenceRule || {
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
        },
        templateEventSlug: templateEvent.slug,
        groupId: createEventDto.group?.id,
        imageId: createEventDto.image?.id,
        sourceType: createEventDto.sourceType
          ? String(createEventDto.sourceType)
          : undefined,
        sourceId: createEventDto.sourceId
          ? String(createEventDto.sourceId)
          : undefined,
        sourceUrl: createEventDto.sourceUrl
          ? String(createEventDto.sourceUrl)
          : undefined,
        sourceData: createEventDto.sourceData || undefined,
        // Matrix room ID isn't in the CreateEventDto, so omit it
      },
      userId,
    );

    // Return the template event from the series
    return series.templateEvent;
  }

  async updateRecurringEvent(
    id: number,
    updateEventDto: UpdateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['series'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    if (!event.series) {
      throw new BadRequestException(
        `Event with ID ${id} is not part of a series`,
      );
    }

    // Convert the UpdateEventDto to UpdateEventSeriesDto
    const updateEventSeriesDto = {
      name: updateEventDto.name,
      description: updateEventDto.description,
      recurrenceRule: updateEventDto.recurrenceRule,
      location: updateEventDto.location,
      locationOnline: updateEventDto.locationOnline,
      maxAttendees: updateEventDto.maxAttendees,
      requireApproval: updateEventDto.requireApproval,
      approvalQuestion: updateEventDto.approvalQuestion,
      allowWaitlist: updateEventDto.allowWaitlist,
      categories: updateEventDto.categories,
      groupId: updateEventDto.group?.id,
      imageId: updateEventDto.image?.id,
      sourceType: updateEventDto.sourceType
        ? String(updateEventDto.sourceType)
        : undefined,
      sourceId: updateEventDto.sourceId
        ? String(updateEventDto.sourceId)
        : undefined,
      sourceUrl: updateEventDto.sourceUrl
        ? String(updateEventDto.sourceUrl)
        : undefined,
      sourceData: updateEventDto.sourceData || undefined,
      // Matrix room ID isn't in the UpdateEventDto, so omit it
    };

    // Update the series instead of the recurring event
    const updatedSeries = await this.eventSeriesService.update(
      event.series.slug,
      updateEventSeriesDto,
      userId,
    );

    // Return the updated template event
    return updatedSeries.templateEvent;
  }

  async deleteRecurringEvent(id: number, userId: number): Promise<void> {
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['series'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    if (!event.series) {
      throw new BadRequestException(
        `Event with ID ${id} is not part of a series`,
      );
    }

    // Delete the series instead of the recurring event
    await this.eventSeriesService.delete(event.series.slug, userId);
  }
}
