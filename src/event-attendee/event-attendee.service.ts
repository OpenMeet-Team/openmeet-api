import { PaginationDto } from '../utils/dto/pagination.dto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Scope,
  forwardRef,
} from '@nestjs/common';
import { Repository, UpdateResult } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';
import { QueryEventAttendeeDto } from './dto/query-eventAttendee.dto';
import { paginate } from '../utils/generic-pagination';
import { UpdateEventAttendeeDto } from './dto/update-eventAttendee.dto';
import {
  EventAttendeePermission,
  EventAttendeeStatus,
} from '../core/constants/constant';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { EventRoleService } from '../event-role/event-role.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { In } from 'typeorm';
import { Trace } from '../utils/trace.decorator';
import { EventSourceType } from '../core/constants/source-type.constant';
import { BlueskyRsvpService } from '../bluesky/bluesky-rsvp.service';
import { UserService } from '../user/user.service';
import { EventAttendeeQueryService } from './event-attendee-query.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventAttendeeService {
  private readonly auditLogger = AuditLoggerService.getInstance();
  private readonly logger = new Logger(EventAttendeeService.name);

  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventRoleService: EventRoleService,
    @Inject(forwardRef(() => BlueskyRsvpService))
    private readonly blueskyRsvpService: BlueskyRsvpService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly eventAttendeeQueryService: EventAttendeeQueryService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.logger.log('EventAttendeeService Constructed');
  }

  @Trace('event-attendee.getTenantSpecificEventRepository')
  private async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  @Trace('event-attendee.create')
  async create(
    createEventAttendeeDto: CreateEventAttendeeDto,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    // Log creation attempt with key info for debugging
    this.logger.debug(
      `[create] Creating event attendee for event ${createEventAttendeeDto.event.slug || createEventAttendeeDto.event.id}, user ${createEventAttendeeDto.user.slug || createEventAttendeeDto.user.id}`,
    );

    try {
      const attendee = this.eventAttendeesRepository.create(
        createEventAttendeeDto,
      );

      try {
        const saved = await this.eventAttendeesRepository.save(attendee);

        this.logger.debug(
          `[create] Successfully created attendee record ID=${saved.id} for event ${createEventAttendeeDto.event.slug} and user ${createEventAttendeeDto.user.slug}`,
        );

        this.auditLogger.log('event attendee created', {
          saved,
        });

        // After creating the attendance record, sync to Bluesky if:
        // 1. Bluesky syncing is not specifically disabled
        // 2. The user has a connected Bluesky account
        // Either sync when the event is a Bluesky event OR when the user is a Bluesky user
        if (!createEventAttendeeDto.skipBlueskySync) {
          try {
            // Get the user's Bluesky preferences
            const user = await this.userService.findBySlug(
              createEventAttendeeDto.user.slug,
              this.request.tenantId,
            );

            // For Bluesky users, we check if the provider is 'bluesky' and use the socialId as DID
            if (user && user.provider === 'bluesky' && user.socialId) {
              // User registered through Bluesky, use the socialId as DID
              const blueskyDid = user.socialId;

              this.logger.debug('User is a Bluesky user, syncing RSVP', {
                userSlug: user.slug,
                did: blueskyDid,
              });

              // Map OpenMeet status to Bluesky status
              const statusMap = {
                [EventAttendeeStatus.Confirmed]: 'going',
                [EventAttendeeStatus.Maybe]: 'interested',
                [EventAttendeeStatus.Cancelled]: 'notgoing',
                [EventAttendeeStatus.Pending]: 'interested',
                [EventAttendeeStatus.Waitlist]: 'interested',
              };

              const blueskyStatus = statusMap[saved.status] || 'interested';

              // Create RSVP in Bluesky
              const result = await this.blueskyRsvpService.createRsvp(
                createEventAttendeeDto.event,
                blueskyStatus,
                blueskyDid,
                this.request.tenantId,
              );

              // Store the RSVP URI in the attendance record
              if (result.success) {
                this.logger.debug(
                  `Successfully created Bluesky RSVP: ${result.rsvpUri}`,
                );

                // Get the entity first
                const attendee = await this.eventAttendeesRepository.findOne({
                  where: { id: saved.id },
                });

                if (attendee) {
                  // Update the source fields
                  attendee.sourceId = result.rsvpUri;
                  attendee.sourceType = EventSourceType.BLUESKY;
                  attendee.lastSyncedAt = new Date();

                  // Save the updated entity
                  await this.eventAttendeesRepository.save(attendee);
                }
              }
            } else {
              this.logger.debug(
                `[create] Skipping Bluesky sync for user ${createEventAttendeeDto.user.slug} - not a Bluesky user`,
                {
                  userSlug: user?.slug,
                  provider: user?.provider,
                  hasSocialId: Boolean(user?.socialId),
                },
              );
            }
          } catch (error) {
            // Log but don't fail if Bluesky sync fails
            this.logger.error(
              `Failed to sync attendance to Bluesky: ${error.message}`,
              error.stack,
            );
          }
        } else {
          this.logger.debug(
            `[create] Skipping Bluesky sync for event ${createEventAttendeeDto.event.slug || createEventAttendeeDto.event.id} and user ${createEventAttendeeDto.user.slug || createEventAttendeeDto.user.id}`,
            {
              skipBlueskySync: createEventAttendeeDto.skipBlueskySync,
              eventSourceType: createEventAttendeeDto.event.sourceType,
              hasRkey: Boolean(createEventAttendeeDto.event.sourceData?.rkey),
            },
          );
        }

        // Emit event for activity feed
        const eventPayload = {
          eventId: saved.event.id,
          eventSlug: createEventAttendeeDto.event.slug,
          userId: saved.user.id,
          userSlug: createEventAttendeeDto.user.slug,
          status: saved.status,
          tenantId: this.request.tenantId,
        };
        this.logger.log(
          `📣 Emitting event.rsvp.added: ${JSON.stringify(eventPayload)}`,
        );
        this.eventEmitter.emit('event.rsvp.added', eventPayload);

        return saved;
      } catch (error) {
        // Pass through any errors from the inner try block
        throw error;
      }
    } catch (error) {
      // Handle duplicate key errors explicitly
      if (
        error.message.includes('duplicate key') ||
        error.message.includes('unique constraint')
      ) {
        // Log the error with detailed information
        this.logger.warn(
          `[create] Duplicate key error for event ${createEventAttendeeDto.event.slug || createEventAttendeeDto.event.id}, user ${createEventAttendeeDto.user.slug || createEventAttendeeDto.user.id}: ${error.message}`,
        );
      }

      // Rethrow the error with additional context
      throw new Error(
        'EventAttendeeService: Failed to save attendee: ' + error.message,
      );
    }
  }

  @Trace('event-attendee.findAll')
  async findAll(
    pagination: PaginationDto,
    query: QueryEventAttendeeDto,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { page, limit } = pagination;
    const { search, userId, role, status } = query;

    const eventAttendeeQuery = this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.user', 'user')
      .where('eventAttendee.user = :userId', { userId });

    if (search) {
      eventAttendeeQuery.andWhere(
        '(eventAttendee.rsvpStatus LIKE :search OR eventAttendee.eventId LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      eventAttendeeQuery.andWhere('eventAttendee.role = :role', { role });
    }

    if (status) {
      eventAttendeeQuery.andWhere('eventAttendee.status = :status', { status });
    }

    return paginate(eventAttendeeQuery, { page, limit });
  }

  @Trace('event-attendee.leaveEvent')
  async leaveEvent(
    userId: number,
    eventId: number,
  ): Promise<{ message: string }> {
    await this.getTenantSpecificEventRepository();

    const attendee = await this.eventAttendeesRepository.findOne({
      where: { user: { id: userId }, event: { id: eventId } }, // Use the correct object structure
    });

    if (!attendee) {
      throw new NotFoundException('User is not an attendee of this event');
    }

    try {
      await this.eventAttendeesRepository.remove(attendee);
    } catch (error) {
      throw new Error('Failed to remove attendee: ' + error.message);
    }

    return { message: 'User has successfully left the event' };
  }

  @Trace('event-attendee.showEventAttendees')
  async showEventAttendees(
    eventId: number,
    pagination: PaginationDto,
    status?: EventAttendeeStatus,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { limit, page } = pagination;
    const eventAttendee = await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.role', 'role')

      .leftJoin('eventAttendee.user', 'user')
      .leftJoin('user.photo', 'photo')
      .addSelect([
        'user.name',
        'user.slug',
        'user.provider',
        'user.socialId',
        'user.isShadowAccount',
        'photo.path',
      ])

      .where('eventAttendee.eventId = :eventId', { eventId });

    if (status) {
      eventAttendee.andWhere('eventAttendee.status = :status', { status });
    }

    return paginate(eventAttendee, { page, limit });
  }

  @Trace('event-attendee.findEventAttendeeByUserSlug')
  async findEventAttendeeByUserSlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<EventAttendeesEntity | null> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[findEventAttendeeByUserSlug] Finding attendance for event ${eventSlug}, user ${userSlug}`,
    );

    // Get the most recent attendance record with a single query
    const attendee = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.event', 'event')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .where('event.slug = :eventSlug', { eventSlug })
      .andWhere('user.slug = :userSlug', { userSlug })
      .orderBy('attendee.updatedAt', 'DESC')
      .getOne();

    // Log what we found
    if (attendee) {
      this.logger.debug(
        `[findEventAttendeeByUserSlug] Found attendance record with status '${attendee.status}' and ID ${attendee.id} for event ${eventSlug}, user ${userSlug}`,
      );
    } else {
      this.logger.debug(
        `[findEventAttendeeByUserSlug] No attendance record found in database for event ${eventSlug}, user ${userSlug}`,
      );
    }

    return attendee;
  }

  /**
   * @deprecated Use findEventAttendeeByUserSlug instead
   */
  @Trace('event-attendee.findEventAttendeeByUserId')
  async findEventAttendeeByUserId(
    eventId: number,
    userId: number,
  ): Promise<EventAttendeesEntity | null> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[findEventAttendeeByUserId] Finding attendance for event ID ${eventId}, user ID ${userId}`,
    );

    // Get the most recent attendance record with a single query
    const attendee = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('attendee.event', 'event') // Add relation to fully populate event object
      .where('attendee.event.id = :eventId', { eventId })
      .andWhere('attendee.user.id = :userId', { userId })
      .orderBy('attendee.updatedAt', 'DESC')
      .getOne();

    // Log what we found
    if (attendee) {
      this.logger.debug(
        `[findEventAttendeeByUserId] Found attendance record with status '${attendee.status}' and ID ${attendee.id}`,
      );
    } else {
      this.logger.debug(
        `[findEventAttendeeByUserId] No attendance record found in database`,
      );
    }

    return attendee;
  }

  /**
   * @deprecated Use findEventAttendeesByUserSlugBatch with event slugs and user slug instead of IDs
   */
  @Trace('event-attendee.findEventAttendeesByUserIdBatch')
  async findEventAttendeesByUserIdBatch(
    eventIds: number[],
    userId: number,
  ): Promise<Map<number, EventAttendeesEntity | null>> {
    if (!eventIds.length) {
      return new Map();
    }

    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[findEventAttendeesByUserIdBatch] Finding attendance for ${eventIds.length} events and user ${userId}`,
    );

    // Find all attendees for this user and the given events in a single query
    const attendees = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('attendee.event', 'event')
      .where('event.id IN (:...eventIds)', { eventIds })
      .andWhere('attendee.user.id = :userId', { userId })
      .orderBy('attendee.updatedAt', 'DESC')
      .getMany();

    // Create a map of eventId to attendee
    const result = new Map<number, EventAttendeesEntity | null>();

    // Initialize all events with null (no attendance)
    eventIds.forEach((id) => result.set(id, null));

    // Update with actual attendees where found
    attendees.forEach((attendee) => {
      result.set(attendee.event.id, attendee);
    });

    return result;
  }

  @Trace('event-attendee.findEventAttendeesByUserSlugBatch')
  async findEventAttendeesByUserSlugBatch(
    eventSlugs: string[],
    userSlug: string,
  ): Promise<Map<string, EventAttendeesEntity | null>> {
    if (!eventSlugs.length) {
      return new Map();
    }

    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[findEventAttendeesByUserSlugBatch] Finding attendance for ${eventSlugs.length} events and user ${userSlug}`,
    );

    // Find all attendees for this user and the given events in a single query
    const attendees = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('attendee.event', 'event')
      .where('event.slug IN (:...eventSlugs)', { eventSlugs })
      .andWhere('user.slug = :userSlug', { userSlug })
      .orderBy('attendee.updatedAt', 'DESC')
      .getMany();

    // Create a map of eventSlug to attendee
    const result = new Map<string, EventAttendeesEntity | null>();

    // Initialize all events with null (no attendance)
    eventSlugs.forEach((slug) => result.set(slug, null));

    // Update with actual attendees where found
    attendees.forEach((attendee) => {
      result.set(attendee.event.slug, attendee);
    });

    return result;
  }

  @Trace('event-attendee.updateEventAttendee')
  async updateEventAttendee(
    attendeeId: number,
    body: UpdateEventAttendeeDto,
  ): Promise<UpdateResult> {
    await this.getTenantSpecificEventRepository();

    await this.getAttendeeById(attendeeId);
    const attendeeRole = await this.eventRoleService.getRoleByName(body.role);

    return await this.eventAttendeesRepository.update(attendeeId, {
      status: body.status,
      role: { id: attendeeRole.id },
    });
  }

  @Trace('event-attendee.findEventAttendees')
  async findEventAttendees(eventId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.find({
      where: { event: { id: eventId } },
      relations: ['user'],
    });
  }

  @Trace('event-attendee.getEventAttendeePermissions')
  async getEventAttendeePermissions(id: number) {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.find({
      where: { id },
      relations: ['role', 'role.permissions'],
    });
  }

  @Trace('event-attendee.cancelEventAttendanceBySlug')
  async cancelEventAttendanceBySlug(
    eventSlug: string,
    userSlug: string,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[cancelEventAttendanceBySlug] Finding active attendance for event ${eventSlug} and user ${userSlug}`,
    );

    // First try to find an active attendance record (Confirmed or Pending)
    let attendee = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('attendee.event', 'event')
      .where('event.slug = :eventSlug', { eventSlug })
      .andWhere('user.slug = :userSlug', { userSlug })
      .andWhere('attendee.status IN (:...statuses)', {
        statuses: [
          EventAttendeeStatus.Confirmed,
          EventAttendeeStatus.Pending,
          EventAttendeeStatus.Waitlist,
        ],
      })
      .orderBy('attendee.createdAt', 'DESC')
      .getOne();

    // If no active record, look for any record including cancelled ones
    if (!attendee) {
      this.logger.debug(
        `[cancelEventAttendanceBySlug] No active attendance found, looking for any record including cancelled ones`,
      );

      attendee = await this.eventAttendeesRepository
        .createQueryBuilder('attendee')
        .leftJoinAndSelect('attendee.user', 'user')
        .leftJoinAndSelect('attendee.role', 'role')
        .leftJoinAndSelect('role.permissions', 'permissions')
        .leftJoinAndSelect('attendee.event', 'event')
        .where('event.slug = :eventSlug', { eventSlug })
        .andWhere('user.slug = :userSlug', { userSlug })
        .orderBy('attendee.createdAt', 'DESC')
        .getOne();
    }

    // If still no record, throw error
    if (!attendee) {
      throw new NotFoundException('No attendance record found for this user');
    }

    // If record is already cancelled, log but continue (idempotent cancel)
    if (attendee.status === EventAttendeeStatus.Cancelled) {
      this.logger.debug(
        `[cancelEventAttendanceBySlug] Attendance already cancelled, returning existing record with id: ${attendee.id}`,
      );
      return attendee;
    }

    // Log the current status before cancellation for debugging
    this.logger.debug(
      `[cancelEventAttendanceBySlug] Found attendee with status: ${attendee.status}, id: ${attendee.id}`,
    );

    // Update the status to cancelled
    attendee.status = EventAttendeeStatus.Cancelled;

    // Log the change we're about to make
    this.logger.debug(
      `[cancelEventAttendanceBySlug] Changing attendee status to ${attendee.status}`,
    );

    // Save the updated record
    const updatedAttendee = await this.eventAttendeesRepository.save(attendee);

    // Log the updated status after saving
    this.logger.debug(
      `[cancelEventAttendanceBySlug] Updated attendee status: ${updatedAttendee.status}, id: ${updatedAttendee.id}`,
    );

    // After cancelling, update Bluesky RSVP if:
    // 1. The attendee has a Bluesky sourceId or the event is from Bluesky
    // 2. The user has a connected Bluesky account
    if (
      (updatedAttendee.sourceId ||
        attendee.event.sourceType === EventSourceType.BLUESKY) &&
      attendee.event.sourceData?.rkey
    ) {
      try {
        // Get the user's Bluesky preferences using the slug
        const user = await this.userService.findBySlug(
          userSlug,
          this.request.tenantId,
        );

        // For Bluesky users, we check if the provider is 'bluesky' and use the socialId as DID
        if (user && user.provider === 'bluesky' && user.socialId) {
          // User registered through Bluesky, use the socialId as DID
          const blueskyDid = user.socialId;

          this.logger.debug(
            'User is a Bluesky user, syncing cancellation RSVP',
            { userSlug: user.slug, did: blueskyDid },
          );
          // Create a "notgoing" RSVP
          const result = await this.blueskyRsvpService.createRsvp(
            attendee.event,
            'notgoing',
            blueskyDid,
            this.request.tenantId,
          );

          if (result.success) {
            // Get the entity first
            const attendee = await this.eventAttendeesRepository.findOne({
              where: { id: updatedAttendee.id },
            });

            if (attendee) {
              // Update the source fields
              attendee.sourceId = result.rsvpUri;
              attendee.sourceType = EventSourceType.BLUESKY;
              attendee.lastSyncedAt = new Date();

              // Save the updated entity
              await this.eventAttendeesRepository.save(attendee);
            }

            this.logger.debug(
              `Updated Bluesky RSVP to notgoing: ${result.rsvpUri}`,
            );
          }
        } else {
          this.logger.debug(
            `Skipping Bluesky RSVP update - not a Bluesky user`,
            {
              userSlug: user?.slug,
              provider: user?.provider,
              hasSocialId: Boolean(user?.socialId),
            },
          );
        }
      } catch (error) {
        // Log but don't fail if Bluesky sync fails
        this.logger.error(
          `Failed to sync cancellation to Bluesky: ${error.message}`,
          error.stack,
        );
      }
    }

    return updatedAttendee;
  }

  /**
   * @deprecated Use cancelEventAttendanceBySlug with event and user slugs instead of IDs
   */
  @Trace('event-attendee.cancelEventAttendance')
  async cancelEventAttendance(
    eventId: number,
    userId: number,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[cancelEventAttendance] Finding active attendance for event ${eventId} and user ${userId}`,
    );

    // First try to find an active attendance record (Confirmed or Pending)
    let attendee = await this.eventAttendeesRepository.findOne({
      where: {
        event: { id: eventId },
        user: { id: userId },
        status: In([
          EventAttendeeStatus.Confirmed,
          EventAttendeeStatus.Pending,
          EventAttendeeStatus.Waitlist,
        ]),
      },
      relations: ['user', 'role', 'role.permissions', 'event'],
      order: { createdAt: 'DESC' },
    });

    // If no active record, look for any record including cancelled ones
    if (!attendee) {
      this.logger.debug(
        `[cancelEventAttendance] No active attendance found, looking for any record including cancelled ones`,
      );

      attendee = await this.eventAttendeesRepository.findOne({
        where: {
          event: { id: eventId },
          user: { id: userId },
        },
        relations: ['user', 'role', 'role.permissions', 'event'],
        order: { createdAt: 'DESC' },
      });
    }

    // If still no record, throw error
    if (!attendee) {
      throw new NotFoundException('No attendance record found for this user');
    }

    // If record is already cancelled, log but continue (idempotent cancel)
    if (attendee.status === EventAttendeeStatus.Cancelled) {
      this.logger.debug(
        `[cancelEventAttendance] Attendance already cancelled, returning existing record with id: ${attendee.id}`,
      );
      return attendee;
    }

    // Log the current status before cancellation for debugging
    this.logger.debug(
      `[cancelEventAttendance] Found attendee with status: ${attendee.status}, id: ${attendee.id}`,
    );

    // Update the status to cancelled
    attendee.status = EventAttendeeStatus.Cancelled;

    // Log the change we're about to make
    this.logger.debug(
      `[cancelEventAttendance] Changing attendee status to ${attendee.status}`,
    );

    // Save the updated record
    const updatedAttendee = await this.eventAttendeesRepository.save(attendee);

    // Log the updated status after saving
    this.logger.debug(
      `[cancelEventAttendance] Updated attendee status: ${updatedAttendee.status}, id: ${updatedAttendee.id}`,
    );

    // After cancelling, update Bluesky RSVP if needed, using the original method
    if (
      (updatedAttendee.sourceId ||
        attendee.event.sourceType === EventSourceType.BLUESKY) &&
      attendee.event.sourceData?.rkey
    ) {
      try {
        // Get the user's Bluesky preferences
        const user = await this.userService.findById(
          userId,
          this.request.tenantId,
        );

        // For Bluesky users, we check if the provider is 'bluesky' and use the socialId as DID
        if (user && user.provider === 'bluesky' && user.socialId) {
          // User registered through Bluesky, use the socialId as DID
          const blueskyDid = user.socialId;

          this.logger.debug(
            'User is a Bluesky user, syncing cancellation RSVP',
            { userSlug: user.slug, did: blueskyDid },
          );
          // Create a "notgoing" RSVP
          const result = await this.blueskyRsvpService.createRsvp(
            attendee.event,
            'notgoing',
            blueskyDid,
            this.request.tenantId,
          );

          if (result.success) {
            // Get the entity first
            const attendee = await this.eventAttendeesRepository.findOne({
              where: { id: updatedAttendee.id },
            });

            if (attendee) {
              // Update the source fields
              attendee.sourceId = result.rsvpUri;
              attendee.sourceType = EventSourceType.BLUESKY;
              attendee.lastSyncedAt = new Date();

              // Save the updated entity
              await this.eventAttendeesRepository.save(attendee);
            }

            this.logger.debug(
              `Updated Bluesky RSVP to notgoing: ${result.rsvpUri}`,
            );
          }
        } else {
          this.logger.debug(
            `Skipping Bluesky RSVP update - not a Bluesky user`,
            {
              userSlug: user?.slug,
              provider: user?.provider,
              hasSocialId: Boolean(user?.socialId),
            },
          );
        }
      } catch (error) {
        // Log but don't fail if Bluesky sync fails
        this.logger.error(
          `Failed to sync cancellation to Bluesky: ${error.message}`,
          error.stack,
        );
      }
    }

    return updatedAttendee;
  }

  @Trace('event-attendee.showConfirmedEventAttendeesByEventId')
  async showConfirmedEventAttendeesByEventId(
    eventId: number,
    limit: number = 0,
  ): Promise<EventAttendeesEntity[]> {
    return this.eventAttendeeQueryService.showConfirmedEventAttendeesByEventId(
      eventId,
      this.request.tenantId,
      limit,
    );
  }

  @Trace('event-attendee.showEventAttendeesCount')
  async showEventAttendeesCount(
    eventId: number,
    status?: EventAttendeeStatus,
  ): Promise<number> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.count({
      where: {
        event: { id: eventId },
        status: status || EventAttendeeStatus.Confirmed,
      },
    });
  }

  @Trace('event-attendee.deleteEventAttendees')
  async deleteEventAttendees(eventId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.delete({
      event: { id: eventId },
    });
  }

  @Trace('event-attendee.showConfirmedEventAttendeesCount')
  async showConfirmedEventAttendeesCount(eventId: number): Promise<number> {
    await this.getTenantSpecificEventRepository();

    // Use query builder with a 5-second cache to reduce database load
    return this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .where('attendee.event.id = :eventId', { eventId })
      .andWhere('attendee.status = :status', {
        status: EventAttendeeStatus.Confirmed,
      })
      .cache(5000) // Cache for 5 seconds
      .getCount();
  }

  @Trace('event-attendee.findEventIdsByUserId')
  async findEventIdsByUserId(userId: number): Promise<number[]> {
    await this.getTenantSpecificEventRepository();
    const attendees = await this.eventAttendeesRepository.find({
      where: { user: { id: userId } },
      select: ['event'],
    });
    return attendees.map((a) => a.id);
  }

  /**
   * Find event attendees by source identifier
   * @param sourceId The source identifier to search for
   * @param userSlug Optional user slug to filter by
   */
  @Trace('event-attendee.findBySourceId')
  async findBySourceId(
    sourceId: string,
    userSlug?: string,
  ): Promise<EventAttendeesEntity[]> {
    await this.getTenantSpecificEventRepository();

    // Create base query with source id operator
    const query = this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .leftJoinAndSelect('eventAttendee.user', 'user')
      .leftJoinAndSelect('eventAttendee.role', 'role')
      .where(`eventAttendee.sourceId = :sourceId`, { sourceId });

    // Add user slug filter if provided
    if (userSlug) {
      query.andWhere('user.slug = :userSlug', { userSlug });
    }

    return query.getMany();
  }

  /**
   * @deprecated Use findBySourceId instead
   */
  @Trace('event-attendee.findByMetadata')
  async findByMetadata(
    key: string,
    value: any,
    userSlug?: string,
  ): Promise<EventAttendeesEntity[]> {
    if (key === 'blueskyRsvpUri') {
      return this.findBySourceId(value, userSlug);
    }

    this.logger.warn(`Using deprecated findByMetadata with key ${key}`);
    await this.getTenantSpecificEventRepository();

    // Create base query with source fields if we can determine the field
    const query = this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .leftJoinAndSelect('eventAttendee.user', 'user');

    // Add source fields to query
    if (key === 'sourceId') {
      query.where(`eventAttendee.sourceId = :value`, { value });
    } else if (key === 'sourceType') {
      query.where(`eventAttendee.sourceType = :value`, { value });
    } else {
      // Fallback to check in sourceData
      query.where(`eventAttendee.sourceData->>'${key}' = :value`, { value });
    }

    // Add user slug filter if provided
    if (userSlug) {
      query.andWhere('user.slug = :userSlug', { userSlug });
    }

    return query.getMany();
  }

  /**
   * Find all attendance records for a specific user
   * @param userSlug The user slug to find attendees for
   */
  @Trace('event-attendee.findByUserSlug')
  async findByUserSlug(userSlug: string): Promise<EventAttendeesEntity[]> {
    await this.getTenantSpecificEventRepository();

    return this.eventAttendeesRepository.find({
      where: { user: { slug: userSlug } },
      relations: ['event'],
    });
  }

  @Trace('event-attendee.getMailServiceEventAttendeesByPermission')
  async getMailServiceEventAttendeesByPermission(
    eventId: number,
    permission: EventAttendeePermission,
  ): Promise<UserEntity[]> {
    await this.getTenantSpecificEventRepository();
    const eventAttendees = await this.eventAttendeesRepository.find({
      where: {
        event: { id: eventId },
        role: {
          permissions: {
            name: permission,
          },
        },
      },
      relations: ['user'],
      select: {
        user: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          email: true,
        },
      },
    });
    return eventAttendees.map((member) => member.user);
  }

  @Trace('event-attendee.getMailServiceEventAttendee')
  async getMailServiceEventAttendee(eventAttendeeId: number) {
    await this.getTenantSpecificEventRepository();
    const eventAttendee = await this.eventAttendeesRepository.findOne({
      where: { id: eventAttendeeId },
      relations: ['user', 'event', 'role', 'role.permissions'],
    });

    if (!eventAttendee) {
      throw new NotFoundException('Event attendee not found');
    }
    return eventAttendee;
  }

  @Trace('event-attendee.deleteEventAttendee')
  async deleteEventAttendee(attendeeId: number) {
    await this.getTenantSpecificEventRepository();
    const deleted = await this.eventAttendeesRepository.delete({
      id: attendeeId,
    });
    this.auditLogger.log('event attendee deleted', {
      deleted,
    });
    return deleted;
  }

  @Trace('event-attendee.getAttendeeById')
  async getAttendeeById(attendeeId: number) {
    await this.getTenantSpecificEventRepository();
    const attendee = await this.eventAttendeesRepository.findOne({
      where: { id: attendeeId },
    });

    if (!attendee) {
      throw new NotFoundException(`Attendee with ID ${attendeeId} not found`);
    }

    return attendee;
  }

  @Trace('event-attendee.showEventAttendee')
  async showEventAttendee(attendeeId: number) {
    await this.getTenantSpecificEventRepository();

    return await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.role', 'role')

      .leftJoin('eventAttendee.user', 'user')
      .leftJoin('user.photo', 'photo')
      .addSelect([
        'user.name',
        'user.slug',
        'user.provider',
        'user.socialId',
        'user.isShadowAccount',
        'photo.path',
      ])

      .where('eventAttendee.id = :attendeeId', { attendeeId })
      .getOne();
  }

  @Trace('event-attendee.findOne')
  async findOne(options: any): Promise<EventAttendeesEntity | null> {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeesRepository.findOne(options);
  }

  /**
   * Save an event attendee entity
   * @param attendee The event attendee entity to save
   * @returns The saved event attendee entity
   */
  @Trace('event-attendee.save')
  async save(attendee: EventAttendeesEntity): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeesRepository.save(attendee);
  }

  @Trace('event-attendee.reactivateEventAttendanceBySlug')
  async reactivateEventAttendanceBySlug(
    eventSlug: string,
    userSlug: string,
    newStatus: EventAttendeeStatus = EventAttendeeStatus.Confirmed,
    roleId?: number,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[reactivateEventAttendanceBySlug] Finding attendance for event ${eventSlug} and user ${userSlug}`,
    );

    // Find the attendance record (including cancelled ones)
    const attendee = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .leftJoinAndSelect('attendee.event', 'event')
      .where('event.slug = :eventSlug', { eventSlug })
      .andWhere('user.slug = :userSlug', { userSlug })
      .getOne();

    if (!attendee) {
      throw new NotFoundException('No attendance record found for this user');
    }

    // Update the status
    attendee.status = newStatus;

    // Update role if provided
    if (roleId) {
      attendee.role = { id: roleId } as any;
    }

    // Save the updated record
    const updatedAttendee = await this.eventAttendeesRepository.save(attendee);

    return updatedAttendee;
  }

  /**
   * @deprecated Use reactivateEventAttendanceBySlug with event and user slugs instead of IDs
   */
  @Trace('event-attendee.reactivateEventAttendance')
  async reactivateEventAttendance(
    eventId: number,
    userId: number,
    newStatus: EventAttendeeStatus = EventAttendeeStatus.Confirmed,
    roleId?: number,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[reactivateEventAttendance] Finding attendance for event ${eventId} and user ${userId}`,
    );

    // Find the attendance record (including cancelled ones)
    const attendee = await this.eventAttendeesRepository.findOne({
      where: {
        event: { id: eventId },
        user: { id: userId },
      },
      relations: ['user', 'role', 'role.permissions', 'event'],
    });

    if (!attendee) {
      throw new NotFoundException('No attendance record found for this user');
    }

    // Update the status
    attendee.status = newStatus;

    // Update role if provided
    if (roleId) {
      attendee.role = { id: roleId } as any;
    }

    // Save the updated record
    const updatedAttendee = await this.eventAttendeesRepository.save(attendee);

    return updatedAttendee;
  }

  /**
   * Check if a user is allowed to chat in an event room
   * Users with Confirmed, Cancelled, or Rejected status are allowed to chat
   * @param eventId - The event ID
   * @param userId - The user ID
   * @returns Promise<boolean> - True if user is allowed to chat
   */
  async isUserAllowedToChat(eventId: number, userId: number): Promise<boolean> {
    return this.eventAttendeeQueryService.isUserAllowedToChat(
      eventId,
      userId,
      this.request.tenantId,
    );
  }
}
