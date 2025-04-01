import {
  Injectable,
  Scope,
  Inject,
  Logger,
  UnprocessableEntityException,
  NotFoundException,
  HttpStatus,
  forwardRef,
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
import { EventOccurrenceService } from './occurrences/event-occurrence.service';
import { OccurrenceOptions } from '../../recurrence/interfaces/recurrence.interface';
// Import EventSeries types
import { EventSeriesEntity } from '../../event-series/infrastructure/persistence/relational/entities/event-series.entity';

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
    private readonly blueskyService: BlueskyService,
    private readonly eventOccurrenceService: EventOccurrenceService,
    @Inject(forwardRef(() => 'DiscussionService'))
    private readonly discussionService: any, // Using any here to avoid circular dependency issues
    @Inject(forwardRef(() => 'EventSeriesService'))
    private readonly eventSeriesService: any, // Using any here to avoid circular dependency issues
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
  ): Promise<EventEntity> {
    this.logger.debug('Creating event with dto:', createEventDto);

    await this.initializeRepository();

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
      user: { id: userId },
      group: createEventDto.group
        ? { id: Number(createEventDto.group.id) }
        : null,
      image: createEventDto.image,
      categories,

      // Recurrence fields
      isRecurring: !!createEventDto.recurrenceRule,
      timeZone: createEventDto.timeZone || 'UTC',
      recurrenceRule: createEventDto.recurrenceRule,
      recurrenceExceptions: createEventDto.recurrenceExceptions || [],
      recurrenceUntil:
        createEventDto.recurrenceUntil || createEventDto.recurrenceRule?.until,
      recurrenceCount:
        createEventDto.recurrenceCount || createEventDto.recurrenceRule?.count,

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
      createdEvent = await this.eventRepository.save(event);
    }

    this.logger.debug('Saved event in database:', {
      id: createdEvent.id,
      sourceType: createdEvent.sourceType,
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

    // Generate occurrences if this is a recurring event
    if (createdEvent.isRecurring && createdEvent.recurrenceRule) {
      try {
        this.logger.log(
          `Generating occurrences for recurring event: ${createdEvent.id}`,
        );

        // Set occurrence generation options
        const occurrenceOptions: OccurrenceOptions = {
          timeZone: createdEvent.timeZone || 'UTC',
          count: createdEvent.recurrenceCount,
          until: createdEvent.recurrenceUntil,
          exdates: createdEvent.recurrenceExceptions,
        };

        // Generate occurrences asynchronously
        void this.eventOccurrenceService
          .generateOccurrences(createdEvent, occurrenceOptions)
          .then((occurrences) => {
            this.logger.log(
              `Generated ${occurrences.length} occurrences for event ${createdEvent.id}`,
            );
          })
          .catch((error) => {
            this.logger.error(
              `Error generating occurrences: ${error.message}`,
              error.stack,
            );
          });
      } catch (error) {
        this.logger.error(
          `Error generating occurrences for event ${createdEvent.id}: ${error.message}`,
          error.stack,
        );
        // Don't block the event creation if occurrence generation fails
      }
    }

    return createdEvent;
  }

  @Trace('event-management.update')
  async update(
    slug: string,
    updateEventDto: UpdateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOneOrFail({
      where: { slug },
    });

    // Create a base update object without categories
    const mappedDto: any = {
      ...updateEventDto,
      type: updateEventDto.type as EventType,
      user: { id: userId },
      group: updateEventDto.group ? { id: Number(updateEventDto.group) } : null,
    };

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
      event,
      mappedDto,
    });

    // Check if we need to update recurrence properties
    if (updateEventDto.recurrenceRule) {
      mappedDto.isRecurring = true;
      mappedDto.timeZone = updateEventDto.timeZone || 'UTC';
      mappedDto.recurrenceUntil =
        updateEventDto.recurrenceUntil || updateEventDto.recurrenceRule?.until;
      mappedDto.recurrenceCount =
        updateEventDto.recurrenceCount || updateEventDto.recurrenceRule?.count;
    } else if (updateEventDto.recurrenceRule === null) {
      // If recurrenceRule is explicitly set to null, disable recurring status
      mappedDto.isRecurring = false;
      mappedDto.recurrenceRule = null;
    }

    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    const savedEvent = await this.eventRepository.save(updatedEvent);

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

    // Handle recurring event updates if needed
    if (savedEvent.isRecurring && savedEvent.recurrenceRule) {
      // If recurrence pattern changed, regenerate occurrences
      const recurrenceChanged =
        event.recurrenceRule?.freq !== savedEvent.recurrenceRule?.freq ||
        event.recurrenceRule?.interval !==
          savedEvent.recurrenceRule?.interval ||
        event.recurrenceRule?.count !== savedEvent.recurrenceRule?.count ||
        event.recurrenceRule?.until !== savedEvent.recurrenceRule?.until;

      if (recurrenceChanged) {
        try {
          this.logger.log(
            `Updating occurrences for recurring event: ${savedEvent.id}`,
          );

          // First delete all existing occurrences
          await this.eventOccurrenceService.deleteAllOccurrences(savedEvent.id);

          // Then generate new occurrences
          const occurrenceOptions: OccurrenceOptions = {
            timeZone: savedEvent.timeZone || 'UTC',
            count: savedEvent.recurrenceCount,
            until: savedEvent.recurrenceUntil,
            exdates: savedEvent.recurrenceExceptions,
          };

          // Generate occurrences asynchronously
          void this.eventOccurrenceService
            .generateOccurrences(savedEvent, occurrenceOptions)
            .then((occurrences) => {
              this.logger.log(
                `Regenerated ${occurrences.length} occurrences for event ${savedEvent.id}`,
              );
            })
            .catch((error) => {
              this.logger.error(
                `Error regenerating occurrences: ${error.message}`,
                error.stack,
              );
            });
        } catch (error) {
          this.logger.error(
            `Error regenerating occurrences for event ${savedEvent.id}: ${error.message}`,
            error.stack,
          );
        }
      }
    }

    return savedEvent;
  }

  @Trace('event-management.remove')
  async remove(slug: string): Promise<void> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({ where: { slug } });
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

    // IMPORTANT: Clean up chat rooms directly BEFORE emitting event or deleting
    try {
      this.logger.log(`Directly cleaning up chat rooms for event ${event.id}`);
      await this.discussionService.cleanupEventChatRooms(
        event.id,
        this.request.tenantId,
      );
      this.logger.log(
        `Successfully cleaned up chat rooms for event ${event.id}`,
      );

      // Make sure to clear Matrix room ID from event to avoid stale references
      if (event.matrixRoomId) {
        event.matrixRoomId = '';
        await this.eventRepository.save(event);
      }
    } catch (error) {
      this.logger.error(
        `Error cleaning up chat rooms for event ${event.id}: ${error.message}`,
        error.stack,
      );
      // Continue with deletion despite error - we'll still emit the event for other listeners
    }

    // Emit the event with skipChatCleanup flag since we already did it
    this.eventEmitter.emit('event.before_delete', {
      eventId: event.id,
      eventSlug: event.slug,
      eventName: event.name,
      tenantId: this.request?.tenantId,
      skipChatCleanup: true, // Flag to indicate cleanup has already been done
    });

    // Delete related event attendees
    await this.eventAttendeeService.deleteEventAttendees(event.id);

    // Clean up occurrences if this is a recurring event
    if (event.isRecurring) {
      try {
        this.logger.log(
          `Cleaning up occurrences for recurring event ${event.id}`,
        );
        const deletedCount =
          await this.eventOccurrenceService.deleteAllOccurrences(event.id);
        this.logger.log(
          `Deleted ${deletedCount} occurrences of event ${event.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Error cleaning up occurrences for event ${event.id}: ${error.message}`,
          error.stack,
        );
        // Continue with event deletion despite error
      }
    }

    // Now delete the event from our database
    await this.eventRepository.remove(event);
    this.eventEmitter.emit('event.deleted', eventCopy);
    this.auditLogger.log('event deleted', { event });
  }

  /**
   * Create an event as part of a series using series ID
   * @internal This method is primarily for internal use - prefer createSeriesOccurrenceBySlug for user-facing code
   */
  @Trace('event-management.createSeriesOccurrence')
  async createSeriesOccurrence(
    createEventDto: CreateEventDto,
    userId: number,
    seriesId: number,
    isModified: boolean = false,
    materializedDate?: Date
  ): Promise<EventEntity> {
    try {
      await this.initializeRepository();

      // Mark this event as part of a series
      const event = await this.create(createEventDto, userId);
      
      // Update the event to link it to the series
      // Using specific fields that exist in the entity
      await this.eventRepository.update(event.id, {
        seriesId,
        materialized: true,
        originalOccurrenceDate: materializedDate || new Date(),
      });

      // Reload the event with the updated fields
      const updatedEvent = await this.eventRepository.findOne({
        where: { id: event.id },
        relations: ['user', 'group', 'categories', 'image'],
      });
      
      if (!updatedEvent) {
        throw new NotFoundException(`Event with ID ${event.id} not found after update`);
      }

      // Log audit
      this.auditLogger.log(
        'Series occurrence created',
        {
          context: {
            eventId: event.id,
            seriesId,
            isModified,
            userId,
          },
        },
        userId,
      );

      return updatedEvent;
    } catch (error) {
      this.logger.error(`Error creating series occurrence: ${error.message}`, error.stack);
      throw error;
    }
  }
  
  /**
   * Create an event as part of a series using the series slug
   * This is the preferred method for user-facing code
   */
  @Trace('event-management.createSeriesOccurrenceBySlug')
  async createSeriesOccurrenceBySlug(
    createEventDto: CreateEventDto,
    userId: number,
    seriesSlug: string,
    isModified: boolean = false,
    materializedDate?: Date
  ): Promise<EventEntity> {
    try {
      // Get the series by slug using the EventSeriesService
      const series = await this.eventSeriesService.findBySlug(seriesSlug);
      
      if (!series) {
        throw new NotFoundException(`Event series with slug ${seriesSlug} not found`);
      }
      
      // Then create the occurrence using the series ID
      return this.createSeriesOccurrence(
        createEventDto,
        userId,
        series.id,
        isModified,
        materializedDate
      );
    } catch (error) {
      this.logger.error(`Error creating series occurrence by slug: ${error.message}`, error.stack);
      throw error;
    }
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
    markAsModified: boolean = true
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
          throw new UnprocessableEntityException('User is not authorized to modify this event');
        }
      }

      // Update the event with the new data
      const updatedEvent = await this.update(slug, updateEventDto, userId);

      // If this is a series occurrence and we need to mark it as modified, update materialized field
      if (event.seriesId && markAsModified) {
        // We'll use the materialized flag to indicate this occurrence is modified
        await this.eventRepository.update(event.id, {
          materialized: true,
        });

        // Reload the event with the updated fields
        const reloadedEvent = await this.eventRepository.findOne({
          where: { id: event.id },
          relations: ['user', 'group', 'categories', 'image'],
        });
        
        if (!reloadedEvent) {
          throw new NotFoundException(`Event with ID ${event.id} not found after update`);
        }
        
        // Log audit
        this.auditLogger.log(
          'Series occurrence modified',
          {
            context: {
              eventId: event.id,
              seriesId: event.seriesId,
              userId,
            },
          },
          userId,
        );

        return reloadedEvent;
      }

      return updatedEvent;
    } catch (error) {
      this.logger.error(`Error updating series occurrence: ${error.message}`, error.stack);
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
    options?: { page: number; limit: number }
  ): Promise<[EventEntity[], number]> {
    try {
      await this.initializeRepository();
      
      const page = options?.page || 1;
      const limit = options?.limit || 10;
      const skip = (page - 1) * limit;
      
      const [events, total] = await this.eventRepository.findAndCount({
        where: { seriesId },
        skip,
        take: limit,
        order: { startDate: 'ASC' },
        relations: ['user', 'group', 'categories', 'image'],
      });
      
      return [events, total];
    } catch (error) {
      this.logger.error(`Error finding events by seriesId: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find all events (occurrences) that belong to a series by the series slug
   * This is the preferred method for user-facing code
   */
  @Trace('event-management.findEventsBySeriesSlug')
  async findEventsBySeriesSlug(
    seriesSlug: string,
    options?: { page: number; limit: number }
  ): Promise<[EventEntity[], number]> {
    try {
      // Get the series by slug using the EventSeriesService
      const series = await this.eventSeriesService.findBySlug(seriesSlug);
      
      if (!series) {
        throw new NotFoundException(`Series with slug ${seriesSlug} not found`);
      }
      
      // Now find all events that belong to this series
      return this.findEventsBySeriesId(series.id, options);
    } catch (error) {
      this.logger.error(`Error finding events by series slug: ${error.message}`, error.stack);
      throw error;
    }
  }

  @Trace('event-management.deleteEventsByGroup')
  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.initializeRepository();

    // First find all events for this group
    const events = await this.eventRepository.find({
      where: { group: { id: groupId } },
      select: ['id', 'slug', 'isRecurring'],
    });

    // Delete each event individually to ensure proper cleanup of related entities
    for (const event of events) {
      try {
        // Clean up chat rooms for this event (this handles the foreign key dependencies)
        // If discussionService is available (injected), use it to clean up chat rooms
        if (this.discussionService) {
          await this.discussionService.cleanupEventChatRooms(event.id);
          this.logger.log(
            `Cleaned up chat rooms for event ${event.slug} (ID: ${event.id})`,
          );
        }

        // Clean up occurrences if this is a recurring event
        if (event.isRecurring) {
          try {
            const deletedCount =
              await this.eventOccurrenceService.deleteAllOccurrences(event.id);
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

  /**
   * Create or update an exception occurrence for a recurring event
   * This allows modifying a single occurrence without affecting the series
   *
   * @param slug - The slug of the parent recurring event
   * @param occurrenceDate - The date of the occurrence to modify
   * @param updateEventDto - The modifications to apply to this occurrence
   * @returns The modified occurrence event
   */
  @Trace('event-management.createExceptionOccurrence')
  async createExceptionOccurrence(
    slug: string,
    occurrenceDate: Date,
    updateEventDto: UpdateEventDto,
  ): Promise<EventEntity> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { slug, isRecurring: true },
    });

    if (!parentEvent) {
      throw new UnprocessableEntityException(
        'Parent event not found or not recurring',
      );
    }

    try {
      // Create exception occurrence with modifications
      const exceptionEvent =
        await this.eventOccurrenceService.createExceptionOccurrence(
          parentEvent.id,
          occurrenceDate,
          updateEventDto as Partial<EventEntity>,
        );

      this.logger.log(
        `Created exception occurrence of event ${parentEvent.id} for date ${occurrenceDate}`,
      );

      // Emit event for listeners
      this.eventEmitter.emit('event.occurrence.modified', {
        parentEventId: parentEvent.id,
        occurrenceId: exceptionEvent.id,
        originalDate: occurrenceDate,
        tenantId: this.request.tenantId,
      });

      return exceptionEvent;
    } catch (error) {
      this.logger.error(
        `Error creating exception occurrence: ${error.message}`,
        error.stack,
      );
      throw new UnprocessableEntityException(
        `Failed to create exception occurrence: ${error.message}`,
      );
    }
  }

  /**
   * Exclude a specific occurrence from a recurring event series
   *
   * @param slug - The slug of the parent recurring event
   * @param occurrenceDate - The date of the occurrence to exclude
   * @returns Success status
   */
  @Trace('event-management.excludeOccurrence')
  async excludeOccurrence(
    slug: string,
    occurrenceDate: Date,
  ): Promise<boolean> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { slug, isRecurring: true },
    });

    if (!parentEvent) {
      throw new UnprocessableEntityException(
        'Parent event not found or not recurring',
      );
    }

    try {
      // Exclude the occurrence
      const result = await this.eventOccurrenceService.excludeOccurrence(
        parentEvent.id,
        occurrenceDate,
      );

      if (result) {
        this.logger.log(
          `Excluded occurrence of event ${parentEvent.id} for date ${occurrenceDate}`,
        );

        // Emit event for listeners
        this.eventEmitter.emit('event.occurrence.excluded', {
          parentEventId: parentEvent.id,
          occurrenceDate: occurrenceDate,
          tenantId: this.request.tenantId,
        });
      } else {
        this.logger.warn(
          `Failed to exclude occurrence of event ${parentEvent.id} for date ${occurrenceDate}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error excluding occurrence: ${error.message}`,
        error.stack,
      );
      throw new UnprocessableEntityException(
        `Failed to exclude occurrence: ${error.message}`,
      );
    }
  }

  /**
   * Include a previously excluded occurrence in a recurring event series
   *
   * @param slug - The slug of the parent recurring event
   * @param occurrenceDate - The date of the occurrence to include
   * @returns Success status
   */
  @Trace('event-management.includeOccurrence')
  async includeOccurrence(
    slug: string,
    occurrenceDate: Date,
  ): Promise<boolean> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { slug, isRecurring: true },
    });

    if (!parentEvent) {
      throw new UnprocessableEntityException(
        'Parent event not found or not recurring',
      );
    }

    try {
      // Include the occurrence
      const result = await this.eventOccurrenceService.includeOccurrence(
        parentEvent.id,
        occurrenceDate,
      );

      if (result) {
        this.logger.log(
          `Included occurrence of event ${parentEvent.id} for date ${occurrenceDate}`,
        );

        // Emit event for listeners
        this.eventEmitter.emit('event.occurrence.included', {
          parentEventId: parentEvent.id,
          occurrenceDate: occurrenceDate,
          tenantId: this.request.tenantId,
        });
      } else {
        this.logger.warn(
          `Failed to include occurrence of event ${parentEvent.id} for date ${occurrenceDate}`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Error including occurrence: ${error.message}`,
        error.stack,
      );
      throw new UnprocessableEntityException(
        `Failed to include occurrence: ${error.message}`,
      );
    }
  }

  /**
   * Get occurrences of a recurring event within a date range
   *
   * @param slug - The slug of the parent recurring event
   * @param startDate - Start of the date range
   * @param endDate - End of the date range
   * @param includeExceptions - Whether to include exception occurrences
   * @returns Array of occurrence events within the specified range
   */
  @Trace('event-management.getOccurrencesInRange')
  async getOccurrencesInRange(
    slug: string,
    startDate: Date,
    endDate: Date,
    includeExceptions: boolean = true,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    // Find the parent event
    const parentEvent = await this.eventRepository.findOne({
      where: { slug, isRecurring: true },
    });

    if (!parentEvent) {
      throw new UnprocessableEntityException(
        'Parent event not found or not recurring',
      );
    }

    try {
      // Get occurrences in range
      return await this.eventOccurrenceService.getOccurrencesInRange(
        parentEvent.id,
        startDate,
        endDate,
        includeExceptions,
      );
    } catch (error) {
      this.logger.error(
        `Error getting occurrences in range: ${error.message}`,
        error.stack,
      );
      throw new UnprocessableEntityException(
        `Failed to get occurrences in range: ${error.message}`,
      );
    }
  }
}
