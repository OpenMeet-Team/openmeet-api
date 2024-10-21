import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  InternalServerErrorException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventEntity } from './infrastructure/persistence/relational/entities/event.entity';
import { REQUEST } from '@nestjs/core';
import { TenantConnectionService } from '../tenant/tenant.service';
import { CategoryService } from '../category/category.service';
import { QueryEventDto } from './dto/query-events.dto';
import { PaginationDto } from '../utils/dto/pagination.dto';
import { paginate } from '../utils/generic-pagination';
import {
  EventAttendeeRole,
  EventAttendeeStatus,
  Status,
} from '../core/constants/constant';
import slugify from 'slugify';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {
    void this.initializeRepository();
  }

  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  async create(
    createEventDto: CreateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const user = { id: userId };
    const group = createEventDto.group ? { id: createEventDto.group } : null;

    let categories: CategoryEntity[] = [];
    try {
      categories = await this.categoryService.findByIds(
        createEventDto.categories,
      );
    } catch (error) {
      console.error('Error finding categories:', error);
      throw new NotFoundException(`Error finding categories: ${error.message}`);
    }

    const slugifiedName = slugify(createEventDto.name, {
      strict: true,
      lower: true,
    });

    const mappedDto = {
      ...createEventDto,
      user,
      slug: slugifiedName,
      group,
      categories,
    };
    const event = this.eventRepository.create(mappedDto);
    const createdEvent = await this.eventRepository.save(event);

    const eventAttendeeDto = {
      eventId: createdEvent.id,
      role: EventAttendeeRole.Host,
      status: EventAttendeeStatus.Confirmed,
    };
    await this.eventAttendeeService.attendEvent(eventAttendeeDto, userId);
    return createdEvent;
  }

  async findAll(pagination: PaginationDto, query: QueryEventDto): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const { page, limit } = pagination;
    const { search, userId, fromDate, toDate, categories, location, type } =
      query;

    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('event.attendees', 'attendees')
      .where('event.status = :status', { status: Status.Published });

    if (userId) {
      eventQuery.andWhere('event.user = :userId', { userId });
    }

    if (search) {
      eventQuery.andWhere(
        `(event.name LIKE :search OR 
          event.description LIKE :search OR 
          event.location LIKE :search OR 
          CAST(event.lat AS TEXT) LIKE :search OR 
          CAST(event.lon AS TEXT) LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    if (location) {
      eventQuery.andWhere('event.location LIKE :location', {
        location: `%${location}%`,
      });
    }

    if (type) {
      eventQuery.andWhere('event.type LIKE :type', {
        type: `%${type}%`,
      });
    }

    if (fromDate && toDate) {
      eventQuery.andWhere('event.createdAt BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      eventQuery.andWhere('event.createdAt >= :fromDate', { fromDate });
    } else if (toDate) {
      eventQuery.andWhere('event.createdAt <= :toDate', { toDate: new Date() });
    }

    if (categories && categories.length > 0) {
      const likeConditions = categories
        .map((_, index) => `categories.name LIKE :category${index}`)
        .join(' OR ');

      const likeParameters = categories.reduce((acc, category, index) => {
        acc[`category${index}`] = `%${category}%`;
        return acc;
      }, {});

      eventQuery.andWhere(`(${likeConditions})`, likeParameters);
    }

    return paginate(eventQuery, { page, limit });
  }

  async findOne(id: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: [
        'user',
        'attendees',
        'group',
        'group.groupMembers',
        'categories',
      ],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    event.attendees = event.attendees.slice(0, 5);
    event.categories = event.categories.slice(0, 5);

    return event;
  }

  async findRandom(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const events = await this.eventRepository.find();

    if (!events || events.length === 0) {
      throw new NotFoundException(`Events not found`);
    }

    const shuffledEvents = events.sort(() => 0.5 - Math.random());

    const randomEvents = shuffledEvents.slice(0, 5);

    return randomEvents;
  }

  async getRecommendedEvents(
    eventId: number,
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({
      where: { id: Number(eventId) },
      relations: ['categories'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${eventId} not found`);
    }

    const categoryIds = event.categories.map((c) => c.id);

    let recommendedEvents: EventEntity[] = [];
    try {
      recommendedEvents = await this.findRecommendedEventsForEvent(
        eventId,
        categoryIds,
        minEvents,
        maxEvents,
      );
    } catch (error) {
      recommendedEvents = [];
      console.error('Error fetching recommended events:', error);
    }

    const remainingEventsToFetch = maxEvents - recommendedEvents.length;

    if (remainingEventsToFetch > 0) {
      let randomEvents: EventEntity[] = [];
      try {
        randomEvents = await this.findRandomEventsForEvent(
          eventId,
          recommendedEvents.map((e) => e.id),
          remainingEventsToFetch,
          remainingEventsToFetch,
        );
      } catch (error) {
        console.error('Error fetching random events:', error);
      }

      recommendedEvents = [...recommendedEvents, ...(randomEvents || [])];
    }

    // Deduplicate events
    const uniqueEvents = recommendedEvents.filter(
      (event, index, self) =>
        index === self.findIndex((t) => t.id === event.id),
    );

    if (uniqueEvents.length < minEvents) {
      throw new NotFoundException(
        `Not enough events found for event ${eventId}`,
      );
    }

    if (uniqueEvents.length > maxEvents) {
      return uniqueEvents.slice(0, maxEvents);
    }

    return uniqueEvents;
  }

  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }

    try {
      const recommendedEvents = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.categories', 'category')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('event.id != :eventId', { eventId })
        .andWhere('category.id IN (:...categoryIds)', { categoryIds })
        .orderBy('RANDOM()')
        .take(maxEvents)
        .getMany();

      if (recommendedEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough recommended events found for event ${eventId}. Found ${recommendedEvents.length}, expected at least ${minEvents}.`,
        );
      }

      if (recommendedEvents.length > maxEvents) {
        return recommendedEvents.slice(0, maxEvents);
      }

      return recommendedEvents;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding recommended events for event ${eventId}: ${error.message}`,
      );
    }
  }

  async findRandomEventsForEvent(
    eventId: number,
    excludeEventIds: number[] = [],
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }

    try {
      const randomEvents = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('event.id != :eventId', { eventId })
        .andWhere('event.id NOT IN (:...excludeEventIds)', { excludeEventIds })
        .orderBy('RANDOM()')
        .take(maxEvents)
        .getMany();

      if (randomEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough random events found for event ${eventId}. Found ${randomEvents.length}, expected at least ${minEvents}.`,
        );
      }

      if (randomEvents.length > maxEvents) {
        return randomEvents.slice(0, maxEvents);
      }

      return randomEvents;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding random events for event ${eventId}: ${error.message}`,
      );
    }
  }

  async findRecommendedEventsForGroup(
    groupId: number,
    categoryIds: number[],
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    try {
      const recommendedEvents = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.categories', 'category')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('event.groupId != :groupId', { groupId })
        .andWhere('category.id IN (:...categoryIds)', { categoryIds })
        .orderBy('RANDOM()')
        .take(maxEvents)
        .getMany();

      if (recommendedEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough recommended events found for group ${groupId}. Found ${recommendedEvents.length}, expected at least ${minEvents}.`,
        );
      }

      if (recommendedEvents.length > maxEvents) {
        return recommendedEvents.slice(0, maxEvents);
      }

      return recommendedEvents;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding recommended events for group ${groupId}: ${error.message}`,
      );
    }
  }

  async findRandomEventsForGroup(
    groupId: number,
    excludeEventIds: number[] = [],
    minEvents: number = 3,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    try {
      const randomEvents = await this.eventRepository
        .createQueryBuilder('event')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('event.groupId != :groupId', { groupId })
        .andWhere('event.id NOT IN (:...excludeEventIds)', { excludeEventIds })
        .orderBy('RANDOM()')
        .take(maxEvents)
        .getMany();

      if (randomEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough random events found for group ${groupId}. Found ${randomEvents.length}, expected at least ${minEvents}.`,
        );
      }

      if (randomEvents.length > maxEvents) {
        return randomEvents.slice(0, maxEvents);
      }

      return randomEvents;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error finding random events for group ${groupId}: ${error.message}`,
      );
    }
  }
  async update(
    id: number,
    updateEventDto: UpdateEventDto,
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    const group = updateEventDto.group ? { id: updateEventDto.group } : null;
    const user = { id: userId };

    let slugifiedName = '';

    if (updateEventDto.name) {
      slugifiedName = slugify(updateEventDto.name, {
        strict: true,
        lower: true,
      });
    }

    const mappedDto: any = {
      ...updateEventDto,
      slug: slugifiedName,
      user,
      group,
    };

    if (updateEventDto.categories && updateEventDto.categories.length) {
      const categories = await this.categoryService.findByIds(
        updateEventDto.categories,
      );
      mappedDto.categories = categories;
    }
    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    return this.eventRepository.save(updatedEvent);
  }

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
  }
  async getEventsByCreator(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { user: { id: userId } },
      relations: ['user', 'attendees'],
    });
    return events.map((event) => ({
      ...event,
      attendeesCount: event.attendees ? event.attendees.length : 0,
    }));
  }

  async getEventsByAttendee(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { attendees: { userId } },
      relations: ['user'],
    });
  }
}
