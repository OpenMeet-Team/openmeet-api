import {
  Injectable,
  Scope,
  Inject,
  Logger,
  UnprocessableEntityException,
  HttpStatus,
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

    this.eventEmitter.emit('event.created', createdEvent);
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

    // Delete related event attendees first
    await this.eventAttendeeService.deleteEventAttendees(event.id);

    // Now delete the event from our database
    await this.eventRepository.remove(event);
    this.eventEmitter.emit('event.deleted', eventCopy);
    this.auditLogger.log('event deleted', { event });
  }

  @Trace('event-management.deleteEventsByGroup')
  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.initializeRepository();
    await this.eventRepository.delete({ group: { id: groupId } });
    this.auditLogger.log('events deleted by group', {
      groupId,
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
}
