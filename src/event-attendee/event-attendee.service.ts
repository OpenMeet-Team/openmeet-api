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

    try {
      const attendee = this.eventAttendeesRepository.create(
        createEventAttendeeDto,
      );

      const saved = await this.eventAttendeesRepository.save(attendee);
      this.auditLogger.log('event attendee created', {
        saved,
      });

      // After creating the attendance record, sync to Bluesky if:
      // 1. The event has a Bluesky source
      // 2. The user has a connected Bluesky account
      // 3. Bluesky syncing is not specifically disabled
      if (
        !createEventAttendeeDto.skipBlueskySync && 
        createEventAttendeeDto.event.sourceType === EventSourceType.BLUESKY &&
        createEventAttendeeDto.event.sourceData?.rkey
      ) {
        try {
          // Get the user's Bluesky preferences
          const user = await this.userService.findById(
            createEventAttendeeDto.user.id,
            this.request.tenantId,
          );
          
          if (user?.preferences?.bluesky?.connected && user?.preferences?.bluesky?.did) {
            this.logger.debug('User has connected Bluesky account, syncing RSVP');

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
              user.preferences.bluesky.did,
              this.request.tenantId
            );
            
            // Store the RSVP URI in the attendance record's metadata
            if (result.success) {
              this.logger.debug(`Successfully created Bluesky RSVP: ${result.rsvpUri}`);
              
              // Get the entity first
              const attendee = await this.eventAttendeesRepository.findOne({
                where: { id: saved.id }
              });
              
              if (attendee) {
                // Update the metadata
                attendee.metadata = {
                  ...(attendee.metadata || {}),
                  blueskyRsvpUri: result.rsvpUri,
                };
                
                // Save the updated entity
                await this.eventAttendeesRepository.save(attendee);
              }
            }
          }
        } catch (error) {
          // Log but don't fail if Bluesky sync fails
          this.logger.error(`Failed to sync attendance to Bluesky: ${error.message}`, error.stack);
        }
      }
      
      return saved;
    } catch (error) {
      // Handle database save errors
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
      .addSelect(['user.name', 'user.slug', 'photo.path'])

      .where('eventAttendee.eventId = :eventId', { eventId });

    if (status) {
      eventAttendee.andWhere('eventAttendee.status = :status', { status });
    }

    return paginate(eventAttendee, { page, limit });
  }

  @Trace('event-attendee.findEventAttendeeByUserId')
  async findEventAttendeeByUserId(
    eventId: number,
    userId: number,
  ): Promise<EventAttendeesEntity | null> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[findEventAttendeeByUserId] Finding most recent attendance for event ${eventId} and user ${userId}`,
    );

    const attendee = await this.eventAttendeesRepository
      .createQueryBuilder('attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permissions')
      .where('attendee.event.id = :eventId', { eventId })
      .andWhere('attendee.user.id = :userId', { userId })
      .orderBy('attendee.updatedAt', 'DESC')
      .getOne();

    return attendee;
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

  @Trace('event-attendee.cancelEventAttendance')
  async cancelEventAttendance(
    eventId: number,
    userId: number,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(
      `[cancelEventAttendance] Finding active attendance for event ${eventId} and user ${userId}`,
    );

    // Find the most recent active attendance record
    const attendee = await this.eventAttendeesRepository.findOne({
      where: {
        event: { id: eventId },
        user: { id: userId },
        status: In([
          EventAttendeeStatus.Confirmed,
          EventAttendeeStatus.Pending,
        ]),
      },
      relations: ['user', 'role', 'role.permissions', 'event'],
      order: { createdAt: 'DESC' },
    });

    if (!attendee) {
      throw new NotFoundException('Active attendance record not found');
    }

    this.logger.debug(
      `[cancelEventAttendance] Found attendee: ${JSON.stringify(attendee)}`,
    );

    // Update the status to cancelled
    attendee.status = EventAttendeeStatus.Cancelled;
    const updatedAttendee = await this.eventAttendeesRepository.save(attendee);

    this.logger.debug(
      `[cancelEventAttendance] Updated attendee status: ${updatedAttendee.status}`,
    );

    // After cancelling, update Bluesky RSVP if:
    // 1. The attendee has a Bluesky RSVP URI in metadata or the event is from Bluesky
    // 2. The user has a connected Bluesky account
    if (
      (updatedAttendee.metadata?.blueskyRsvpUri || attendee.event.sourceType === EventSourceType.BLUESKY) &&
      attendee.event.sourceData?.rkey
    ) {
      try {
        // Get the user's Bluesky preferences
        const user = await this.userService.findById(
          userId,
          this.request.tenantId,
        );
        
        if (user?.preferences?.bluesky?.connected && user?.preferences?.bluesky?.did) {
          // Create a "notgoing" RSVP
          const result = await this.blueskyRsvpService.createRsvp(
            attendee.event,
            'notgoing',
            user.preferences.bluesky.did,
            this.request.tenantId
          );
          
          if (result.success) {
            // Get the entity first
            const attendee = await this.eventAttendeesRepository.findOne({
              where: { id: updatedAttendee.id }
            });
            
            if (attendee) {
              // Update the metadata
              attendee.metadata = {
                ...(attendee.metadata || {}),
                blueskyRsvpUri: result.rsvpUri,
              };
              
              // Save the updated entity
              await this.eventAttendeesRepository.save(attendee);
            }
            
            this.logger.debug(`Updated Bluesky RSVP to notgoing: ${result.rsvpUri}`);
          }
        }
      } catch (error) {
        // Log but don't fail if Bluesky sync fails
        this.logger.error(`Failed to sync cancellation to Bluesky: ${error.message}`, error.stack);
      }
    }

    return updatedAttendee;
  }

  @Trace('event-attendee.showConfirmedEventAttendeesByEventId')
  async showConfirmedEventAttendeesByEventId(
    eventId: number,
    limit: number = 0,
  ): Promise<EventAttendeesEntity[]> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.find({
      where: { event: { id: eventId } },
      relations: ['user'],
      take: limit,
      select: {
        role: {
          name: true,
        },
        user: {
          name: true,
          slug: true,
          photo: {
            path: true,
          },
        },
      },
    });
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
    return await this.eventAttendeesRepository.count({
      where: { event: { id: eventId }, status: EventAttendeeStatus.Confirmed },
    });
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
   * Find event attendees by metadata field value
   * @param key The metadata key to search for
   * @param value The value to match
   * @param userSlug Optional user slug to filter by
   */
  @Trace('event-attendee.findByMetadata')
  async findByMetadata(
    key: string,
    value: any,
    userSlug?: string
  ): Promise<EventAttendeesEntity[]> {
    await this.getTenantSpecificEventRepository();
    
    // Create base query with jsonb path operator
    const query = this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .leftJoinAndSelect('eventAttendee.user', 'user')
      .where(`eventAttendee.metadata->>'${key}' = :value`, { value });
    
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
      .addSelect(['user.name', 'user.slug', 'photo.path'])

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
}
