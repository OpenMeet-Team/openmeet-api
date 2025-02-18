import { Injectable, Scope, Inject, Logger } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository, MoreThan } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { EventStatus, EventVisibility } from '../../core/constants/constant';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST })
export class EventRecommendationService {
  private readonly logger = new Logger(EventRecommendationService.name);
  private readonly tracer = trace.getTracer('event-recommendation-service');
  private eventRepository: Repository<EventEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventAttendeeService: EventAttendeeService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-recommendation.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);

    this.eventRepository = dataSource.getRepository(EventEntity);
  }

  @Trace('event-recommendation.findRandom')
  async findRandom(): Promise<EventEntity[]> {
    await this.initializeRepository();

    const events = await this.eventRepository.find();

    if (!events || events.length === 0) {
      throw new Error('Events not found');
    }

    const shuffledEvents = events.sort(() => 0.5 - Math.random());
    return shuffledEvents.slice(0, 5);
  }

  @Trace('event-recommendation.showRandomEvents')
  async showRandomEvents(limit: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository.find({
      where: {
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      },
      relations: ['categories'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    ) as Promise<EventEntity[]>;
  }

  @Trace('event-recommendation.showRecommendedEventsByEventSlug')
  async showRecommendedEventsByEventSlug(slug: string): Promise<EventEntity[]> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({
      where: {
        slug,
        startDate: MoreThan(new Date()),
      },
      relations: ['categories'],
    });

    if (!event) {
      return await this.showRandomEvents(4);
    }

    const categoryIds =
      event.categories?.map((c) => c?.id).filter(Boolean) || [];

    const recommendedEvents = await this.findRecommendedEventsForEvent(
      event.id,
      categoryIds,
      4,
    );
    return recommendedEvents;
  }

  @Trace('event-recommendation.findRecommendedEventsForEvent')
  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    limit: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();

    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      })
      .orderBy('RANDOM()')
      .limit(limit);

    if (categoryIds && categoryIds.length) {
      query.andWhere('categories.id IN (:...categoryIds)', {
        categoryIds: categoryIds || [],
      });
    }

    const events = await query.getMany();

    return Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    ) as Promise<EventEntity[]>;
  }

  @Trace('event-recommendation.findRecommendedEventsForGroup')
  async findRecommendedEventsForGroup(
    groupId: number,
    categories: number[],
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }

    await this.initializeRepository();

    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.group', 'group')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      })
      .andWhere('event.group.id != :groupId', { groupId })
      .orderBy('RANDOM()')
      .limit(maxEvents);

    if (categories && categories.length) {
      query.andWhere('categories.id IN (:...categoryIds)', {
        categoryIds: categories || [],
      });
    }

    const events = await query.getMany();

    return Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    ) as Promise<EventEntity[]>;
  }

  @Trace('event-recommendation.findRandomEventsForGroup')
  async findRandomEventsForGroup(
    groupId: number,
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }

    await this.initializeRepository();

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoin('event.group', 'group')
      .leftJoin('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      })
      .orderBy('RANDOM()')
      .limit(maxEvents)
      .getMany();

    return Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    ) as Promise<EventEntity[]>;
  }
}
