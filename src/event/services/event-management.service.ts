import {
  Injectable,
  Scope,
  Inject,
  Logger,
  UnprocessableEntityException,
  NotFoundException,
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
import { BlueskyIdService } from '../../bluesky/bluesky-id.service';
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
import { RecurrenceFrequency } from '../../event-series/interfaces/recurrence.interface';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { GroupEntity } from '../../group/infrastructure/persistence/relational/entities/group.entity';
import { GroupMemberService } from '../../group-member/group-member.service';
import { GroupRole } from '../../core/constants/constant';
import { assert } from 'console';
import { EventQueryService } from '../services/event-query.service';
import { BLUESKY_COLLECTIONS } from '../../bluesky/BlueskyTypes';
import { GroupMemberService } from '../../group-member/group-member.service';
import { GroupRole } from '../../core/constants/constant';

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
    @Inject(forwardRef(() => EventAttendeeService))
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly eventEmitter: EventEmitter2,
    private readonly fileService: FilesS3PresignedService,
    private readonly eventRoleService: EventRoleService,
    private readonly userService: UserService,
    private readonly eventMailService: EventMailService,
    @Inject(forwardRef(() => BlueskyService))
    private readonly blueskyService: BlueskyService,
    @Inject(forwardRef(() => BlueskyIdService))
    private readonly blueskyIdService: BlueskyIdService,
    @Inject(forwardRef(() => 'DiscussionService'))
    private readonly discussionService: any, // Using any here to avoid circular dependency issues
    @Inject(forwardRef(() => EventSeriesService))
    private readonly eventSeriesService: EventSeriesService,
    @Inject(forwardRef(() => EventQueryService))
    private readonly eventQueryService: EventQueryService,
    @Inject(forwardRef(() => GroupMemberService))
    private readonly groupMemberService: GroupMemberService,
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

  /**
   * Creates a new event
   */
  @Trace('event-management.create')
  async create(
    createEventDto: CreateEventDto,
    userId: number,
    _options: Record<string, unknown> = {},
  ): Promise<EventEntity> {
    this.logger.debug(
      `Creating event with dto: ${JSON.stringify(createEventDto)}`,
    );

    await this.initializeRepository();

    // Store the original seriesSlug for verification
    const originalSeriesSlug = createEventDto.seriesSlug;
    if (originalSeriesSlug) {
      this.logger.debug(
        `Original seriesSlug for creation: ${originalSeriesSlug}`,
      );
    }

    // Handle series lookup if seriesSlug is provided
    if (originalSeriesSlug) {
      const series =
        await this.eventSeriesService.findBySlug(originalSeriesSlug);
      if (!series) {
        throw new NotFoundException(
          `Event series with slug ${originalSeriesSlug} not found`,
        );
      }
      this.logger.debug(`Found series with ID: ${series.id}`);
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

    // Process group data to handle all possible input formats safely
    let groupData: { id: number } | null = null;

    if (createEventDto.group) {
      // Handle different types of input for group
      if (
        typeof createEventDto.group === 'object' &&
        createEventDto.group !== null
      ) {
        // Case 1: group is an object with an id property (normal case)
        if (
          createEventDto.group.id !== undefined &&
          createEventDto.group.id !== null
        ) {
          const groupId = Number(createEventDto.group.id);
          // Only use the ID if it's a valid number
          if (!isNaN(groupId)) {
            groupData = { id: groupId };
            this.logger.debug(`Processed group.id from object: ${groupId}`);
          } else {
            this.logger.warn(
              `Invalid group.id value: ${String(createEventDto.group.id)}, using null instead`,
            );
          }
        }
      } else if (typeof createEventDto.group === 'number') {
        // Case 2: group is a direct number (e.g., group: 2)
        const groupId = createEventDto.group;
        if (!isNaN(groupId)) {
          groupData = { id: groupId };
          this.logger.debug(`Processed direct number group: ${groupId}`);
        }
      } else if (typeof createEventDto.group === 'string') {
        // Case 3: group is a string (this is where the error was happening)
        // Skip processing for "NaN" and "null" strings
        if (createEventDto.group !== 'NaN' && createEventDto.group !== 'null') {
          const groupId = Number(createEventDto.group);
          if (!isNaN(groupId)) {
            groupData = { id: groupId };
            this.logger.debug(`Processed string group to number: ${groupId}`);
          } else {
            this.logger.warn(
              `String group value "${createEventDto.group}" couldn't be converted to number, using null`,
            );
          }
        } else {
          this.logger.warn(
            `Received invalid string value for group: "${createEventDto.group}", using null instead`,
          );
        }
      } else {
        this.logger.warn(
          `Unknown group type: ${typeof createEventDto.group}, using null`,
        );
      }
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
      group: groupData, // Use our safely processed group data
      image: createEventDto.image,
      categories,
      series: originalSeriesSlug
        ? ({ slug: originalSeriesSlug } as EventSeriesEntity)
        : undefined,

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

    // Get user to check for Bluesky connectivity
    const user = await this.userService.getUserById(userId);

    // If sourceType isn't specified but user has a connected Bluesky account,
    // automatically set the source properties for Bluesky
    if (
      !createEventDto.sourceType &&
      user?.provider === 'bluesky' &&
      user?.socialId &&
      user?.preferences?.bluesky?.connected &&
      eventData.status === EventStatus.Published
    ) {
      this.logger.debug(
        `User ${userId} has a connected Bluesky account. Setting source properties.`,
      );
      createEventDto.sourceType = EventSourceType.BLUESKY;
      createEventDto.sourceId = user.socialId;
      createEventDto.sourceData = {
        handle: user.preferences?.bluesky?.handle,
      };
      this.logger.debug(
        `Set source properties for Bluesky: sourceId=${createEventDto.sourceId}, handle=${createEventDto.sourceData.handle}`,
      );
    }

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

        try {
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

          // Use BlueskyIdService to create a proper AT Protocol URI
          const did = createEventDto.sourceId ?? '';
          const collection = BLUESKY_COLLECTIONS.EVENT;
          event.sourceId = this.blueskyIdService.createUri(
            did,
            collection,
            rkey,
          );

          // Removed sourceUrl as it doesn't point to a real page
          event.sourceUrl = null;

          // Store components in metadata for reference
          event.sourceData = {
            rkey,
            handle: createEventDto.sourceData?.handle,
            did,
            collection,
          };
          event.lastSyncedAt = new Date();
        } catch (blueskyError) {
          // If the user specifically requested a Bluesky event, fail with detailed error
          if (
            createEventDto.sourceType === EventSourceType.BLUESKY ||
            createEventDto.sourceId
          ) {
            this.logger.error('Failed to create event in Bluesky:', {
              error: blueskyError.message,
              stack: blueskyError.stack,
            });
            throw new UnprocessableEntityException(
              'Failed to create event in Bluesky. Please try again or check your Bluesky connection.',
            );
          }

          // Otherwise, just log the error and continue creating the event without Bluesky integration
          this.logger.warn(
            'Failed to create event in Bluesky, continuing without Bluesky integration:',
            {
              error: blueskyError.message,
              stack: blueskyError.stack,
            },
          );

          // Clear Bluesky-specific fields so we don't have dangling references
          event.sourceType = null;
          event.sourceId = null;
          event.sourceUrl = null;
          event.sourceData = null;
        }

        // Save the event with or without Bluesky metadata
        createdEvent = await this.eventRepository.save(event);

        // Verify seriesSlug was preserved but do not attempt to restore it
        if (
          originalSeriesSlug &&
          createdEvent.seriesSlug !== originalSeriesSlug
        ) {
          this.logger.warn(
            `[SERIES_SLUG_LOST] During Bluesky event creation. Expected: ${originalSeriesSlug}, Got: ${createdEvent.seriesSlug || 'null'}`,
          );
        }
      } catch (error) {
        this.logger.error('Failed during event creation process:', {
          error: error.message,
          stack: error.stack,
        });
        throw error; // Re-throw to propagate the exception
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
      if (originalSeriesSlug) {
        this.logger.debug(`Pre-Save Event seriesSlug: ${event.seriesSlug}`);
      }

      createdEvent = await this.eventRepository.save(event);

      // Verify seriesSlug was preserved after saving but do not attempt to restore it
      if (
        originalSeriesSlug &&
        createdEvent.seriesSlug !== originalSeriesSlug
      ) {
        this.logger.warn(
          `[SERIES_SLUG_LOST] During regular event creation. Expected: ${originalSeriesSlug}, Got: ${createdEvent.seriesSlug || 'null'}`,
        );
      } else if (originalSeriesSlug) {
        this.logger.debug(
          `SeriesSlug correctly preserved during creation: ${createdEvent.seriesSlug}`,
        );
      }
    }

    // Emit event creation event
    this.eventEmitter.emit('event.created', {
      eventId: createdEvent.id,
      slug: createdEvent.slug,
      userId,
      tenantId: this.request.tenantId,
    });

    // Add host as first attendee
    const hostRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Host,
    );

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

    // Return event by slug to ensure we have all relations
    const event = await this.eventRepository.findOne({
      where: { slug: createdEvent.slug },
    });

    // Verify seriesSlug one final time after retrieving the complete event
    if (
      originalSeriesSlug &&
      event &&
      event.seriesSlug !== originalSeriesSlug
    ) {
      this.logger.error(
        `[SERIES_SLUG_LOST] Final check after retrieval. Expected: ${originalSeriesSlug}, Got: ${event.seriesSlug || 'null'}`,
      );
    }

    return event || createdEvent; // Fallback to createdEvent if findOne returns null
  }

  /**
   * Updates an event by its slug
   * @param slug The slug of the event to update
   * @param updateEventDto The data to update the event with
   * @param userId The ID of the user performing the update
   * @param The userId parameter is deprecated and will be removed in a future version
   */
  @Trace('event-management.update')
  async update(
    slug: string,
    updateEventDto: UpdateEventDto,
    userId?: number, // deprecated
  ): Promise<EventEntity> {
    await this.initializeRepository();

    // Log deprecation warning when userId is explicitly provided
    if (userId !== undefined) {
      this.logger.warn(
        `DEPRECATED: userId parameter in update method is deprecated and will be removed in a future version`,
      );
    }

    // Find existing event and verify ownership
    const event = await this.eventRepository.findOne({
      where: { slug },
    });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // Special case: Converting a non-recurring event to a recurring event by adding a recurrence rule
    if (updateEventDto.recurrenceRule && !event.seriesSlug) {
      this.logger.debug(
        `Detected conversion to recurring event for ${slug} with recurrenceRule: ${JSON.stringify(updateEventDto.recurrenceRule)}`,
      );

      try {
        this.logger.debug(
          `Starting process to convert event ${slug} (ID: ${event.id}) to recurring event`,
        );

        // First apply any other updates to the event
        const basicUpdates = { ...updateEventDto };
        delete basicUpdates.recurrenceRule; // Remove recurrenceRule to handle it separately
        delete basicUpdates.timeZone; // Remove timeZone as it doesn't exist in EventEntity

        if (Object.keys(basicUpdates).length > 0) {
          this.logger.debug(
            `Applying basic updates to event ${slug} before making it recurring`,
            { basicUpdates },
          );

          // Update basic event properties directly without recursive call to update
          await this.eventRepository.update({ slug }, basicUpdates as any);

          // Reload the event with the updated properties
          const updatedEvent = await this.eventRepository.findOne({
            where: { slug },
          });
          if (!updatedEvent) {
            throw new Error(`Failed to find event ${slug} after basic updates`);
          }

          this.logger.debug(
            `Event ${slug} successfully updated with basic properties before adding recurrence`,
            {
              eventAfterBasicUpdates: {
                id: updatedEvent.id,
                slug: updatedEvent.slug,
                name: updatedEvent.name,
              },
            },
          );
        }

        this.logger.debug(
          `Creating series from event ${slug} with recurrence rule`,
          {
            recurrenceRule: updateEventDto.recurrenceRule,
            userId: userId || this.request.user?.id,
          },
        );

        // Then delegate to EventSeriesService to create a series from this event
        // IMPORTANT: This is the critical path where we convert the existing event to recurring
        const series = await this.eventSeriesService.createFromExistingEvent(
          slug,
          updateEventDto.recurrenceRule,
          userId || this.request.user?.id,
          undefined, // Use event name (already updated if needed)
          undefined, // Use event description (already updated if needed)
          updateEventDto.timeZone || 'UTC',
          { generateOccurrences: false },
        );

        this.logger.debug(
          `Successfully created series ${series.slug} from event ${slug}`,
          {
            seriesDetails: {
              id: series.id,
              slug: series.slug,
              templateEventSlug: series.templateEventSlug,
            },
          },
        );

        // Get the updated event to return
        const convertedEvent = await this.eventRepository.findOne({
          where: { slug },
          relations: ['user', 'group', 'categories', 'image'],
        });

        if (!convertedEvent) {
          throw new Error(
            `Failed to find event ${slug} after conversion to recurring`,
          );
        }

        return convertedEvent;
      } catch (error) {
        this.logger.error(
          `Error converting event ${slug} to recurring event: ${error.message}`,
          {
            stack: error.stack,
            eventId: event.id,
            eventSlug: slug,
            recurrenceRule: updateEventDto.recurrenceRule,
          },
        );
        throw error;
      }
    }

    // Update basic event information
    const updatedEventData: Partial<EventEntity> = {
      name: updateEventDto.name,
      description: updateEventDto.description,
      type: updateEventDto.type as EventType,
      startDate: updateEventDto.startDate,
      endDate: updateEventDto.endDate,
      locationOnline: updateEventDto.locationOnline,
      maxAttendees: updateEventDto.maxAttendees,
      requireApproval: updateEventDto.requireApproval,
      approvalQuestion: updateEventDto.approvalQuestion,
      requireGroupMembership: updateEventDto.requireGroupMembership,
      allowWaitlist: updateEventDto.allowWaitlist,
      location: updateEventDto.location,
      lat: updateEventDto.lat,
      lon: updateEventDto.lon,
      conferenceData: updateEventDto.conferenceData,
      status: updateEventDto.status as EventStatus,
      visibility: updateEventDto.visibility as EventVisibility,
      image: updateEventDto.image,
      group: updateEventDto.group as GroupEntity,
      color: updateEventDto.color,
      resources: updateEventDto.resources,
      blocksTime: updateEventDto.blocksTime,
      isAllDay: updateEventDto.isAllDay,
      timeZone: updateEventDto.timeZone || 'UTC',
    };

    // Handle sourceType and sourceId
    if (updateEventDto.sourceType) {
      // Cast the sourceType to the correct enum type
      updatedEventData.sourceType =
        updateEventDto.sourceType as EventSourceType;

      // If sourceId is provided and is a DID (not a full URI)
      if (updateEventDto.sourceId) {
        if (
          updateEventDto.sourceId.startsWith('did:') &&
          !updateEventDto.sourceId.startsWith('at://')
        ) {
          this.logger.debug(
            'Source ID is a DID, converting to full URI if possible',
          );

          // Try to create a full URI if we have all the components
          if (event.sourceData?.rkey) {
            const did = updateEventDto.sourceId;
            const collection = 'community.lexicon.calendar.event';
            // Ensure rkey is properly typed as a string
            const rkey = String(event.sourceData.rkey);

            try {
              updatedEventData.sourceId = this.blueskyIdService.createUri(
                did,
                collection,
                rkey,
              );
              this.logger.debug(
                `Converted DID to full URI: ${updatedEventData.sourceId}`,
              );

              // Update sourceData to include all components
              updatedEventData.sourceData = {
                ...event.sourceData,
                did,
                collection,
              };
            } catch (error) {
              this.logger.warn(
                `Could not convert DID to full URI: ${error.message}`,
                {
                  did,
                  rkey,
                  source: 'update',
                },
              );
              // Keep the original sourceId
              updatedEventData.sourceId = updateEventDto.sourceId;
            }
          } else {
            // Just use the DID as is
            updatedEventData.sourceId = updateEventDto.sourceId;
          }
        } else {
          // Keep the sourceId as is (might already be a URI)
          updatedEventData.sourceId = updateEventDto.sourceId;
        }
      }

      // Handle sourceData and sourceUrl
      if (updateEventDto.sourceData) {
        updatedEventData.sourceData = updateEventDto.sourceData;
      }

      if (updateEventDto.sourceUrl) {
        updatedEventData.sourceUrl = updateEventDto.sourceUrl;
      }
    }

    // Handle location point update
    if (updateEventDto.lat && updateEventDto.lon) {
      const { lat, lon } = updateEventDto;
      if (isNaN(lat) || isNaN(lon)) {
        throw new Error('Invalid latitude or longitude');
      }
      // Use type assertion to handle TypeScript error
      (updatedEventData as any).locationPoint = {
        type: 'Point',
        coordinates: [lon, lat],
      };
    }

    // Handle series association changes
    if (updateEventDto.seriesSlug !== undefined) {
      // If the seriesSlug is being changed or set
      if (updateEventDto.seriesSlug) {
        const series = await this.eventSeriesService.findBySlug(
          updateEventDto.seriesSlug,
        );
        if (!series) {
          throw new NotFoundException(
            `Event series with slug ${updateEventDto.seriesSlug} not found`,
          );
        }
        // Set the series relationship, not the individual fields
        updatedEventData.series = series;

        this.logger.debug(
          `Explicitly updating series relationship to: ${updateEventDto.seriesSlug}`,
        );
      } else {
        // If series is being explicitly cleared
        // For consistency with our approach elsewhere, use null instead of undefined
        // Use type assertion to handle TypeScript constraints
        (updatedEventData as any).series = null;
        // Don't set seriesSlug directly, let TypeORM handle it through the relation
        this.logger.debug(`Explicitly clearing series relationship`);
      }
    }

    // Update categories if provided
    if (updateEventDto.categories) {
      try {
        updatedEventData.categories = await this.categoryService.findByIds(
          updateEventDto.categories,
        );
      } catch (error) {
        throw new Error(`Error finding categories: ${error.message}`);
      }
    }

    // Log the updated event data
    this.logger.debug('Updating event with data:', {
      ...updatedEventData,
      seriesSlug: updatedEventData.seriesSlug || 'null',
      isRecurring: updatedEventData.isRecurring,
    });

    // Save the updated event - Use Object.assign instead of update method
    const eventToSave = Object.assign(event, updatedEventData);
    const updatedEvent = await this.eventRepository.save(eventToSave);

    assert(slug === updatedEvent.slug, 'Slug should be preserved');
    assert(
      updatedEvent.updatedAt > event.updatedAt,
      'UpdatedAt should be greater than original updatedAt',
    );
    assert(
      updatedEvent.createdAt === event.createdAt,
      'CreatedAt should be the same',
    );

    // If it's a Bluesky event, try to update it there too, but don't fail if Bluesky is unavailable
    if (
      event.sourceType === EventSourceType.BLUESKY &&
      event.sourceData?.rkey
    ) {
      try {
        // If the sourceId is a DID (not a full URI), parse components from sourceData
        let did = '';
        let handle = '';
        const collection = 'community.lexicon.calendar.event';
        // Ensure rkey is properly typed as a string
        const rkey = String(event.sourceData?.rkey || '');

        // Try to extract DID from sourceId if it's a full URI
        if (event.sourceId && event.sourceId.startsWith('at://')) {
          try {
            const parsedUri = this.blueskyIdService.parseUri(event.sourceId);
            did = parsedUri.did;
          } catch (parseError) {
            this.logger.warn(
              `Failed to parse URI from sourceId: ${event.sourceId}`,
              {
                error: parseError.message,
              },
            );
          }
        }

        // If we couldn't get DID from sourceId, use the one from sourceData
        if (!did) {
          did = String(event.sourceData?.did || '');
        }

        // Use handle from sourceData
        handle = String(event.sourceData?.handle || '');

        this.logger.debug('Preparing to update Bluesky event record:', {
          eventId: event.id,
          did,
          handle,
          rkey,
          collection,
        });

        // Update the record in Bluesky
        await this.blueskyService.createEventRecord(
          updatedEvent,
          did,
          handle,
          this.request.tenantId,
        );

        // Update the sourceId with proper AT Protocol URI
        updatedEvent.sourceId = this.blueskyIdService.createUri(
          did,
          collection,
          rkey,
        );

        // Remove sourceUrl as it doesn't point to a real page
        updatedEvent.sourceUrl = null;

        // Ensure sourceData has all the components
        updatedEvent.sourceData = {
          ...updatedEvent.sourceData,
          did,
          rkey,
          handle,
          collection,
        };

        // Update the lastSyncedAt timestamp
        updatedEvent.lastSyncedAt = new Date();

        // Save the updated event with Bluesky metadata
        await this.eventRepository.save(updatedEvent);

        this.logger.debug(
          'Successfully updated Bluesky event record and local metadata',
          {
            eventId: event.id,
            sourceId: updatedEvent.sourceId,
          },
        );
      } catch (error) {
        this.logger.error('Failed to update event in Bluesky', {
          error: error.message,
          stack: error.stack,
          eventData: {
            id: event.id,
            sourceId: event.sourceId,
            sourceType: event.sourceType,
            sourceData: event.sourceData,
          },
        });
        // Continue execution - we don't want to fail the update due to Bluesky issues
      }
    }

    return updatedEvent;
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

    this.logger.debug('[remove] event', {
      eventId: event.id,
      name: event.name,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      userBlueskyConnected:
        !!this.request.user?.preferences?.bluesky?.connected,
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

    // Check if the discussionService exists and has the cleanupEventChatRooms method
    if (
      !this.discussionService ||
      typeof this.discussionService.cleanupEventChatRooms !== 'function'
    ) {
      throw new UnprocessableEntityException(
        'Discussion service required for event deletion is not available. Event deletion cannot proceed safely.',
      );
    }

    // Before starting the transaction, clean up chat rooms through the discussion service
    try {
      this.logger.log(
        `Starting chat room cleanup for event ${event.id} via discussionService`,
      );

      // Call the service layer method to clean up chat rooms
      await this.discussionService.cleanupEventChatRooms(
        event.id,
        this.request.tenantId,
      );

      this.logger.log(
        `Successfully cleaned up chat rooms for event ${event.id}`,
      );
    } catch (chatCleanupError) {
      this.logger.error(
        `Error cleaning up chat rooms for event ${event.id}: ${chatCleanupError.message}`,
        chatCleanupError.stack,
      );
      throw new UnprocessableEntityException(
        `Failed to clean up chat rooms: ${chatCleanupError.message}`,
      );
    }

    // Use a transaction for the rest of the event deletion
    await dataSource
      .transaction(async (transactionalEntityManager) => {
        this.logger.log(`Starting transaction for event deletion: ${event.id}`);

        // Step 1: Clear Matrix room ID reference
        if (event.matrixRoomId) {
          event.matrixRoomId = '';
          await transactionalEntityManager.save(EventEntity, event);
          this.logger.log(`Cleared Matrix room ID for event ${event.id}`);
        }

        // Step 2: Delete related event attendees
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

        // Step 3: Handle series exceptions if needed
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

        // Step 4: Finally, delete the event itself
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
    this.logger.warn(
      'createSeriesOccurrence is deprecated. Use EventSeriesOccurrenceService.getOrCreateOccurrence instead',
    );
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
   * Find all events (occurrences) that belong to a series by the series slug
   * This is the preferred method for user-facing code
   * @deprecated Use EventQueryService.findEventsBySeriesSlug instead
   */
  @Trace('event-management.findEventsBySeriesSlug')
  async findEventsBySeriesSlug(
    seriesSlug: string,
    options?: { page: number; limit: number },
    _tenantId?: string,
    _skipSeriesVerification?: boolean,
  ): Promise<[EventEntity[], number]> {
    this.logger.warn(
      'This method is deprecated. Use EventQueryService.findEventsBySeriesSlug instead',
    );
    return this.eventQueryService.findEventsBySeriesSlug(seriesSlug, options);
  }

  /**
   * Find all events (occurrences) that belong to a series by ID
   * @internal This method is primarily for internal use - prefer findEventsBySeriesSlug for user-facing code
   * @deprecated Use EventQueryService.findEventsBySeriesId instead
   */
  @Trace('event-management.findEventsBySeriesId')
  async findEventsBySeriesId(
    seriesId: number,
    options?: { page: number; limit: number },
  ): Promise<[EventEntity[], number]> {
    this.logger.warn(
      'This method is deprecated. Use EventQueryService.findEventsBySeriesId instead',
    );
    return this.eventQueryService.findEventsBySeriesId(seriesId, options);
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
            const [events] = await this.findEventsBySeriesSlug(
              event.series.slug,
            );
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

    this.logger.debug(
      `[attendEvent] Processing attendance for event ${slug} and user ${userId}`,
    );

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group'],
    });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // Check if event requires group membership and validate user membership
    if (event.requireGroupMembership && event.group) {
      const groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );
      if (!groupMember) {
        throw new BadRequestException(
          'You must be a member of this group to attend this event',
        );
      }
      if (groupMember.groupRole?.name === GroupRole.Guest) {
        throw new BadRequestException(
          'Guests are not allowed to attend this event. Please contact a group admin to change your role.',
        );
      }
    }

    const user = await this.userService.getUserById(userId);

    // Check if event requires group membership and validate user membership
    if (event.requireGroupMembership && event.group) {
      this.logger.debug(
        `[attendEvent] Event requires group membership, checking user ${userId} membership in group ${event.group.id}`,
      );

      const groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );

      if (!groupMember) {
        this.logger.debug(
          `[attendEvent] User ${userId} is not a member of group ${event.group.id}, denying event attendance`,
        );
        throw new BadRequestException(
          'You must be a member of this group to attend this event',
        );
      }

      // Check if user is a guest (which should not be allowed for group-restricted events)
      if (groupMember.groupRole?.name === GroupRole.Guest) {
        this.logger.debug(
          `[attendEvent] User ${userId} is a guest in group ${event.group.id}, denying event attendance`,
        );
        throw new BadRequestException(
          'Guests are not allowed to attend this event. Please contact a group admin to change your role.',
        );
      }

      this.logger.debug(
        `[attendEvent] User ${userId} is a valid member (${groupMember.groupRole?.name}) of group ${event.group.id}`,
      );
    }

    // First check the cache state for debugging
    this.logger.debug(
      `[attendEvent] Checking for existing attendance record with detailed cache logging`,
    );
    const eventAttendee =
      await this.eventAttendeeService.findEventAttendeeByUserId(
        event.id,
        user.id,
      );

    // Log existing attendance status if any
    if (eventAttendee) {
      this.logger.debug(
        `[attendEvent] Found existing attendance record with status ${eventAttendee.status}, id=${eventAttendee.id}`,
      );
    } else {
      this.logger.debug(
        `[attendEvent] No existing attendance record found in initial check`,
      );
    }

    const participantRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Participant,
    );

    // Calculate the appropriate status based on event settings
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

    this.logger.debug(`[attendEvent] Calculated status: ${attendeeStatus}`);

    // If the attendee already exists and is not cancelled, return it
    if (
      eventAttendee &&
      eventAttendee.status !== EventAttendeeStatus.Cancelled
    ) {
      this.logger.debug(
        `[attendEvent] Using existing active attendance record`,
      );
      return eventAttendee;
    }

    let attendee;

    try {
      // If attendee exists but has cancelled status, use the reactivation method
      if (
        eventAttendee &&
        eventAttendee.status === EventAttendeeStatus.Cancelled
      ) {
        this.logger.debug(
          `[attendEvent] Reactivating cancelled attendee: ${eventAttendee.id} for event ${event.slug}`,
        );

        // Use the slug-based method to reactivate
        attendee =
          await this.eventAttendeeService.reactivateEventAttendanceBySlug(
            event.slug,
            user.slug,
            attendeeStatus,
            participantRole.id,
          );

        // Update source fields if needed
        if (
          createEventAttendeeDto.sourceId ||
          createEventAttendeeDto.sourceType ||
          createEventAttendeeDto.sourceUrl ||
          createEventAttendeeDto.sourceData
        ) {
          if (createEventAttendeeDto.sourceId)
            attendee.sourceId = createEventAttendeeDto.sourceId;
          if (createEventAttendeeDto.sourceType)
            attendee.sourceType = createEventAttendeeDto.sourceType;
          if (createEventAttendeeDto.sourceUrl)
            attendee.sourceUrl = createEventAttendeeDto.sourceUrl;
          if (createEventAttendeeDto.sourceData)
            attendee.sourceData = createEventAttendeeDto.sourceData;

          // Save the updated source fields
          attendee = await this.eventAttendeeService.save(attendee);
        }

        this.logger.debug(
          `[attendEvent] Reactivated attendee record to status ${attendee.status}`,
        );
      } else {
        // Create new attendee record if none exists
        this.logger.debug(
          `[attendEvent] Creating new attendance record with status ${attendeeStatus}`,
        );

        // Start with the DTO values to preserve any source fields
        const attendeeData = {
          ...createEventAttendeeDto,
          // Override with the values we need to set
          event,
          user,
          status: attendeeStatus,
          role: participantRole,
        };

        try {
          attendee = await this.eventAttendeeService.create(attendeeData);
          this.logger.debug(
            `[attendEvent] Created new attendee record with ID ${attendee.id}`,
          );
        } catch (error) {
          // Check if the error is due to a unique constraint violation (record already exists)
          if (
            error.message.includes('duplicate key') ||
            error.message.includes('unique constraint')
          ) {
            this.logger.warn(
              `[attendEvent] Duplicate record detected for event ${event.id}, user ${user.id}: ${error.message}`,
            );

            // Log the cache state
            this.logger.debug(
              `[attendEvent] CRITICAL ERROR STATE: Race condition detected - logging cache state before retry`,
            );

            // First try: Attempt to fetch with cache state logging
            const cachedAttendeeInfo =
              await this.eventAttendeeService.findEventAttendeeByUserId(
                event.id,
                user.id,
              );

            this.logger.debug(
              `[attendEvent] After error - first attempt to fetch record: ${cachedAttendeeInfo ? `Found ID=${cachedAttendeeInfo.id}` : 'Not found'}`,
            );

            if (cachedAttendeeInfo) {
              this.logger.debug(
                `[attendEvent] Found existing record using regular lookup. Using record with status ${cachedAttendeeInfo.status}, id=${cachedAttendeeInfo.id}`,
              );
              return cachedAttendeeInfo;
            }

            // Second try: Attempt to fetch existing record with cache bypass
            this.logger.debug(
              `[attendEvent] Retrying lookup with cache bypass for event ${event.id}, user ${user.id}`,
            );

            const existingAttendee =
              await this.eventAttendeeService.findEventAttendeeByUserId(
                event.id,
                user.id,
              );

            if (existingAttendee) {
              this.logger.debug(
                `[attendEvent] Found existing record after bypass. Using record with status ${existingAttendee.status}, id=${existingAttendee.id}`,
              );
              return existingAttendee;
            } else {
              // Last ditch effort - try direct query with findOne
              this.logger.warn(
                `[attendEvent] Still could not find record after bypass. Trying direct query with findOne.`,
              );

              // Try one more time with fewer relations
              const simpleAttendee = await this.eventAttendeeService.findOne({
                where: {
                  event: { id: event.id },
                  user: { id: user.id },
                },
              });

              if (simpleAttendee) {
                this.logger.debug(
                  `[attendEvent] Found record without relations. ID: ${simpleAttendee.id}, Status: ${simpleAttendee.status}`,
                );
                return simpleAttendee;
              }

              // This should be rare - we couldn't create due to duplicate but can't find the existing record
              this.logger.error(
                `[attendEvent] CRITICAL DATA CONSISTENCY ERROR: Record exists (due to duplicate key error) but cannot be found with any method`,
                {
                  eventId: event.id,
                  userId: user.id,
                  errorMessage: error.message,
                  requestId: this.request.id || 'unknown',
                },
              );

              throw new Error(
                `Could not create attendance record due to duplicate, but could not find existing record after multiple attempts: ${error.message}`,
              );
            }
          } else {
            // Re-throw other errors
            throw error;
          }
        }
      }

      // Add logging to debug the structure of the attendee object before sending mail
      this.logger.debug(
        `[attendEvent] Sending mail for attendee: ${attendee.id}, with event: ${attendee.event?.id || 'undefined'}`,
      );

      try {
        await this.eventMailService.sendMailAttendeeGuestJoined(attendee);
      } catch (error) {
        this.logger.error(
          `[attendEvent] Error sending mail for attendee ${attendee.id}: ${error.message}`,
          error.stack,
        );
        // Continue execution - don't let mail errors affect the overall operation
      }

      // Emit event for other parts of the system
      this.eventEmitter.emit('event.attendee.added', {
        eventId: event.id,
        userId: user.id,
        status: attendeeStatus,
        tenantId: this.request.tenantId,
        eventSlug: event.slug,
        userSlug: user.slug,
      });

      // Ensure we're returning a fully populated attendee object
      // This ensures the frontend has all the data it needs without requiring additional API calls
      if (!attendee.role || !attendee.role.permissions) {
        this.logger.debug(
          `[attendEvent] Loading complete attendee record with role and permissions`,
        );
        attendee = await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          user.id,
        );
      }

      return attendee;
    } catch (error) {
      this.logger.error(
        `[attendEvent] Error during event attendance processing: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  @Trace('event-management.cancelAttendingEvent')
  async cancelAttendingEvent(slug: string, userId: number) {
    await this.initializeRepository();

    this.logger.debug(
      `[cancelAttendingEvent] Processing cancellation for event ${slug} and user ${userId}`,
    );

    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // Get the user to obtain their slug
    const user = await this.userService.getUserById(
      userId,
      this.request.tenantId,
    );
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Log before calling cancel attendance
    this.logger.debug(
      `[cancelAttendingEvent] Calling cancelEventAttendanceBySlug for event ${slug}, userSlug ${user.slug}`,
    );

    const attendee =
      await this.eventAttendeeService.cancelEventAttendanceBySlug(
        slug,
        user.slug,
      );

    this.logger.debug(
      `[cancelAttendingEvent] Attendance cancelled, new status: ${attendee.status}, id: ${attendee.id}`,
    );

    // Verify the attendee has correct status
    if (attendee.status !== EventAttendeeStatus.Cancelled) {
      this.logger.warn(
        `[cancelAttendingEvent] Unexpected status after cancellation: ${attendee.status}. Expected: ${EventAttendeeStatus.Cancelled}`,
      );
    }

    // Emit event for other parts of the system
    this.eventEmitter.emit('event.attendee.cancelled', {
      eventId: event.id,
      userId,
      tenantId: this.request.tenantId,
      eventSlug: event.slug,
      userSlug: user.slug,
    });

    return attendee;
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
