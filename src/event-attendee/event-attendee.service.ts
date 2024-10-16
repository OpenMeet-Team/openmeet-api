import { PaginationDto } from './../utils/dto/pagination.dto';
import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';
import { Repository } from 'typeorm';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { EventAttendeesEntity } from './infrastructure/persistence/relational/entities/event-attendee.entity';
import { CreateEventAttendeeDto } from './dto/create-eventAttendee.dto';
import { DeepPartial } from 'typeorm';
import { QueryEventAttendeeDto } from './dto/query-eventAttendee.dto';
import { paginate } from '../utils/generic-pagination';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventAttendeeService {
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
  ) {}

  private async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  async attendEvent(
    createEventAttendeeDto: CreateEventAttendeeDto,
    userId: number,
  ): Promise<EventAttendeesEntity> {
    await this.getTenantSpecificEventRepository();

    const event = { id: createEventAttendeeDto.eventId };
    const user = { id: userId };

    const mappedDto: DeepPartial<EventAttendeesEntity> = {
      rsvpStatus: createEventAttendeeDto.rsvpStatus,
      isHost: createEventAttendeeDto.isHost,
      event, // Attach the event object
      user, // Attach the user object
    };

    try {
      const attendee = this.eventAttendeesRepository.create(mappedDto);
      return await this.eventAttendeesRepository.save(attendee);
    } catch (error) {
      // Handle database save errors
      throw new Error('Failed to save attendee: ' + error.message);
    }
  }

  async findAll(
    pagination: PaginationDto,
    query: QueryEventAttendeeDto,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { page, limit } = pagination;
    const { search, userId, fromDate, toDate } = query;

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

    if (fromDate && toDate) {
      eventAttendeeQuery.andWhere(
        'eventAttendee.createdAt BETWEEN :fromDate AND :toDate',
        {
          fromDate,
          toDate,
        },
      );
    } else if (fromDate) {
      eventAttendeeQuery.andWhere('eventAttendee.createdAt >= :fromDate', {
        fromDate,
      });
    } else if (toDate) {
      eventAttendeeQuery.andWhere('eventAttendee.createdAt <= :toDate', {
        toDate: new Date(),
      });
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

  async getEventAttendees(
    eventId: number,
    pagination: PaginationDto,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { limit, page } = pagination;
    const eventAttendee = await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.user', 'user')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .where('event.id = :eventId', { eventId });

    return paginate(eventAttendee, { page, limit });
  }
}
