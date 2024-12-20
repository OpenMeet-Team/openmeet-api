import { PaginationDto } from '../utils/dto/pagination.dto';
import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
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

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventAttendeeService {
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventRoleService: EventRoleService,
  ) {}

  private async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  async create(
    createEventAttendeeDto: CreateEventAttendeeDto,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    try {
      const attendee = this.eventAttendeesRepository.create(
        createEventAttendeeDto,
      );

      return await this.eventAttendeesRepository.save(attendee);
    } catch (error) {
      // Handle database save errors
      throw new Error(
        'EventAttendeeService: Failed to save attendee: ' + error.message,
      );
    }
  }

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

  async findEventAttendeeByUserId(
    eventId: number,
    userId: number,
  ): Promise<EventAttendeesEntity | null> {
    await this.getTenantSpecificEventRepository();

    const attendee = await this.eventAttendeesRepository.findOne({
      where: { event: { id: eventId }, user: { id: userId } },
      relations: ['user', 'role', 'role.permissions'],
    });
    return attendee;
  }

  async updateEventAttendee(
    attendeeId: number,
    body: UpdateEventAttendeeDto,
  ): Promise<UpdateResult> {
    await this.getTenantSpecificEventRepository();

    await this.getAttendeeById(attendeeId);
    const attendeeRole = await this.eventRoleService.getRoleByName(body.role);

    return await this.eventAttendeesRepository.update(attendeeId, {
      status: body.status,
      role: attendeeRole,
    });
  }

  async findEventAttendees(eventId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.find({
      where: { event: { id: eventId } },
      relations: ['user'],
    });
  }

  async getEventAttendeePermissions(id: number) {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.find({
      where: { id },
      relations: ['role', 'role.permissions'],
    });
  }

  async cancelAttendingEvent(id: number, userId: number) {
    await this.getTenantSpecificEventRepository();
    const attendee = await this.eventAttendeesRepository.findOne({
      where: { user: { id: userId }, event: { id } },
      relations: ['user', 'role.permissions'],
    });
    if (!attendee) {
      throw new NotFoundException(`Attendee with ID ${userId} not found`);
    }
    attendee.status = EventAttendeeStatus.Cancelled;

    return this.eventAttendeesRepository.save(attendee);
  }

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

  async deleteEventAttendees(eventId: number): Promise<any> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.delete({
      event: { id: eventId },
    });
  }

  async showConfirmedEventAttendeesCount(eventId: number): Promise<number> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.count({
      where: { event: { id: eventId }, status: EventAttendeeStatus.Confirmed },
    });
  }

  async findEventIdsByUserId(userId: number): Promise<number[]> {
    await this.getTenantSpecificEventRepository();
    const attendees = await this.eventAttendeesRepository.find({
      where: { user: { id: userId } },
      select: ['event'],
    });
    return attendees.map((a) => a.id);
  }

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

  async deleteEventAttendee(attendeeId: number) {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeesRepository.delete({
      id: attendeeId,
    });
  }

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
}
