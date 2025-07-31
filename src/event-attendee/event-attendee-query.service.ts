import { Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { EventAttendeeStatus } from '../core/constants/constant';
import { Trace } from '../utils/trace.decorator';

@Injectable()
export class EventAttendeeQueryService {
  private readonly logger = new Logger(EventAttendeeQueryService.name);

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    this.logger.log('EventAttendeeQueryService Constructed');
  }

  @Trace('event-attendee-query.getTenantSpecificEventRepository')
  private async getTenantSpecificEventRepository(
    tenantId: string,
  ): Promise<Repository<EventAttendeesEntity>> {
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    return dataSource.getRepository(EventAttendeesEntity);
  }

  @Trace('event-attendee-query.showConfirmedEventAttendeesByEventId')
  async showConfirmedEventAttendeesByEventId(
    eventId: number,
    tenantId: string,
    limit: number = 0,
  ): Promise<EventAttendeesEntity[]> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);
    return await eventAttendeesRepository.find({
      where: { event: { id: eventId } },
      relations: ['user', 'role'],
      take: limit,
      select: {
        role: {
          name: true,
        },
        user: {
          id: true,
          name: true,
          slug: true,
          photo: {
            path: true,
          },
        },
      },
    });
  }

  @Trace('event-attendee-query.findEventAttendeeByUserId')
  async findEventAttendeeByUserId(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<EventAttendeesEntity | null> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);

    this.logger.debug(
      `[findEventAttendeeByUserId] Finding attendance for event ID ${eventId}, user ID ${userId}`,
    );

    // Get the most recent attendance record with a single query
    const attendee = await eventAttendeesRepository
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

  @Trace('event-attendee-query.findEventAttendeeByUserSlug')
  async findEventAttendeeByUserSlug(
    eventSlug: string,
    userSlug: string,
    tenantId: string,
  ): Promise<EventAttendeesEntity | null> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);

    this.logger.debug(
      `[findEventAttendeeByUserSlug] Finding attendance for event ${eventSlug}, user ${userSlug}`,
    );

    // Get the most recent attendance record with a single query
    const attendee = await eventAttendeesRepository
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

  @Trace('event-attendee-query.findEventAttendees')
  async findEventAttendees(
    eventId: number,
    tenantId: string,
  ): Promise<EventAttendeesEntity[]> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);
    return await eventAttendeesRepository.find({
      where: { event: { id: eventId } },
      relations: ['user'],
    });
  }

  @Trace('event-attendee-query.showEventAttendeesCount')
  async showEventAttendeesCount(
    eventId: number,
    tenantId: string,
    status?: EventAttendeeStatus,
  ): Promise<number> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);
    return await eventAttendeesRepository.count({
      where: {
        event: { id: eventId },
        status: status || EventAttendeeStatus.Confirmed,
      },
    });
  }

  @Trace('event-attendee-query.showConfirmedEventAttendeesCount')
  async showConfirmedEventAttendeesCount(
    eventId: number,
    tenantId: string,
  ): Promise<number> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);

    // Use query builder with a 5-second cache to reduce database load
    return eventAttendeesRepository
      .createQueryBuilder('attendee')
      .where('attendee.event.id = :eventId', { eventId })
      .andWhere('attendee.status = :status', {
        status: EventAttendeeStatus.Confirmed,
      })
      .cache(5000) // Cache for 5 seconds
      .getCount();
  }

  @Trace('event-attendee-query.findBySourceId')
  async findBySourceId(
    sourceId: string,
    tenantId: string,
    userSlug?: string,
  ): Promise<EventAttendeesEntity[]> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);

    // Create base query with source id operator
    const query = eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .leftJoinAndSelect('eventAttendee.user', 'user')
      .where(`eventAttendee.sourceId = :sourceId`, { sourceId });

    // Add user slug filter if provided
    if (userSlug) {
      query.andWhere('user.slug = :userSlug', { userSlug });
    }

    return query.getMany();
  }

  @Trace('event-attendee-query.findByUserSlug')
  async findByUserSlug(
    userSlug: string,
    tenantId: string,
  ): Promise<EventAttendeesEntity[]> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);

    return eventAttendeesRepository.find({
      where: { user: { slug: userSlug } },
      relations: ['event'],
    });
  }

  @Trace('event-attendee-query.findOne')
  async findOne(
    options: any,
    tenantId: string,
  ): Promise<EventAttendeesEntity | null> {
    const eventAttendeesRepository =
      await this.getTenantSpecificEventRepository(tenantId);
    return eventAttendeesRepository.findOne(options);
  }

  /**
   * Check if a user is allowed to chat in an event room
   * Users with Confirmed, Cancelled, or Rejected status are allowed to chat
   * @param eventId - The event ID
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @returns Promise<boolean> - True if user is allowed to chat
   */
  @Trace('event-attendee-query.isUserAllowedToChat')
  async isUserAllowedToChat(
    eventId: number,
    userId: number,
    tenantId: string,
  ): Promise<boolean> {
    try {
      const attendee = await this.findEventAttendeeByUserId(
        eventId,
        userId,
        tenantId,
      );
      if (!attendee) {
        return false;
      }

      // Allow confirmed attendees and those who cancelled/rejected (they can still chat)
      const allowedStatuses = [
        EventAttendeeStatus.Confirmed,
        EventAttendeeStatus.Cancelled,
        EventAttendeeStatus.Rejected,
      ];

      return allowedStatuses.includes(attendee.status);
    } catch {
      this.logger.debug(
        `User ${userId} is not an attendee of event ${eventId}`,
      );
      return false;
    }
  }
}
