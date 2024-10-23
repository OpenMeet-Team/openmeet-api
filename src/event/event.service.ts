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
import { Status } from '../core/constants/constant';
import slugify from 'slugify';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
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
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const user = { id: userId };
    const group = createEventDto.group ? { id: createEventDto.group } : null;
    const categories = await this.categoryService.findByIds(
      createEventDto.categories,
    );

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
    return this.eventRepository.save(event);
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

  async findRecommendedEventsForGroup(
    groupId: number,
    categories: number[],
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    console.log('🚀 ~ categories:', categories);
    try {
      const recommendedEvents = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.attendees', 'attendees')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .andWhere('categories.id IN (:...categories)', { categories })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getMany();

      console.log('🚀 ~ recommendedEvents:', recommendedEvents);

      if (recommendedEvents.length < minEvents) {
        throw new NotFoundException(
          `Not enough recommended events found for group ${groupId}. Found ${recommendedEvents.length}, expected at least ${minEvents}.`,
        );
      }

      return recommendedEvents.slice(0, maxEvents);
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
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

    try {
      const randomEventIds = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoin('event.group', 'group')
        .select('event.id')
        .where('event.status = :status', { status: Status.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getRawMany();

      console.log('🚀 ~ randomEventIds found:', randomEventIds);

      if (randomEventIds.length < minEvents) {
        throw new NotFoundException(
          `Not enough random events found for group ${groupId}. Found ${randomEventIds.length}, expected at least ${minEvents}.`,
        );
      }

      // Then fetch full event details for these IDs
      const events = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.attendees', 'attendees')
        .where('event.id IN (:...ids)', {
          ids: randomEventIds.map((e) => e.event_id),
        })
        .getMany();

      return events;
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
