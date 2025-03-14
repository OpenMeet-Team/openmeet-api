import { Injectable, Scope, Inject, Logger } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Repository, MoreThan, Brackets } from 'typeorm';
import { EventEntity } from '../infrastructure/persistence/relational/entities/event.entity';
import { EventAttendeesEntity } from '../../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { TenantConnectionService } from '../../tenant/tenant.service';
import { QueryEventDto } from '../dto/query-events.dto';
import { PaginationDto } from '../../utils/dto/pagination.dto';
import { HomeQuery } from '../../home/dto/home-query.dto';
import {
  EventVisibility,
  EventStatus,
  EventAttendeeStatus,
  PostgisSrid,
  DEFAULT_RADIUS,
} from '../../core/constants/constant';
import { paginate } from '../../utils/generic-pagination';
import { Trace } from '../../utils/trace.decorator';
import { trace } from '@opentelemetry/api';
import { EventAttendeeService } from '../../event-attendee/event-attendee.service';
import { GroupMemberService } from '../../group-member/group-member.service';

@Injectable({ scope: Scope.REQUEST })
export class EventQueryService {
  private readonly logger = new Logger(EventQueryService.name);
  private readonly tracer = trace.getTracer('event-query-service');
  private eventRepository: Repository<EventEntity>;
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly eventAttendeeService: EventAttendeeService,
    private readonly groupMemberService: GroupMemberService,
  ) {
    void this.initializeRepository();
  }

  @Trace('event-query.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  @Trace('event-query.findEventBySlug')
  async findEventBySlug(slug: string): Promise<EventEntity> {
    await this.initializeRepository();

    this.logger.debug(`[findEventBySlug] Finding event for slug: ${slug}`);
    const userId = this.request.user?.id;
    const authState = userId ? 'authenticated' : 'public access';
    this.logger.debug(`[findEventBySlug] Request type: ${authState}`);

    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .where('event.slug = :slug', { slug });

    if (userId) {
      queryBuilder
        .leftJoinAndSelect('event.attendees', 'attendee')
        .leftJoinAndSelect('attendee.user', 'user')
        .leftJoinAndSelect('attendee.role', 'role');
    }

    const event = await queryBuilder.getOne();

    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    if (userId) {
      this.logger.debug(
        `[findEventBySlug] Checking attendance for user: ${userId}`,
      );
      const attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );

      if (attendee) {
        this.logger.debug(
          `[findEventBySlug] Found attendee with status: ${attendee.status}`,
        );
        event.attendee = attendee;
      } else {
        this.logger.debug('[findEventBySlug] User has not attended this event');
      }
    }

    return event;
  }

  @Trace('event-query.showEvent')
  async showEvent(slug: string, userId?: number): Promise<EventEntity> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['user', 'group', 'categories'],
      select: {
        id: false,
        user: {
          name: true,
          slug: true,
          photo: {
            path: true,
          },
        },
      },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    event.attendees = (
      await this.eventAttendeeService.showEventAttendees(
        event.id,
        { page: 1, limit: 5 },
        EventAttendeeStatus.Confirmed,
      )
    ).data;

    if (event.group && userId) {
      event.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );
    }

    event.attendeesCount =
      await this.eventAttendeeService.showConfirmedEventAttendeesCount(
        event.id,
      );

    if (userId) {
      event.attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );
    }

    // Matrix-based discussions will be loaded from the frontend
    event.topics = [];
    event.messages = [];

    return event;
  }

  @Trace('event-query.editEvent')
  async editEvent(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'categories'],
    });
    return event;
  }

  @Trace('event-query.showEventBySlug')
  async showEventBySlug(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['user'],
    });

    if (!event) {
      throw new Error(`Event with slug ${slug} not found`);
    }

    return event;
  }

  @Trace('event-query.showAllEvents')
  async showAllEvents(
    pagination: PaginationDto,
    query: QueryEventDto,
    user?: any,
  ): Promise<any> {
    await this.initializeRepository();

    const { search, lat, lon, radius, type, fromDate, toDate, categories } =
      query;

    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .leftJoin('event.user', 'user')
      .leftJoin('user.photo', 'photo')
      .leftJoin('event.image', 'eventPhoto')
      .addSelect(['user.name', 'user.slug', 'photo.path', 'eventPhoto.path'])
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.group', 'group')
      .loadRelationCountAndMap(
        'event.attendeesCount',
        'event.attendees',
        'attendees',
        (qb) =>
          qb.where('attendees.status = :status', {
            status: EventAttendeeStatus.Confirmed,
          }),
      )
      .where('event.status = :status', { status: EventStatus.Published })
      .orderBy('event.startDate', 'ASC')
      .addOrderBy('event.id', 'ASC');

    if (!user) {
      eventQuery.andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      });
    } else if (user.roles?.includes('admin')) {
      // Admins can see all events
    } else {
      const attendedEventIds =
        await this.eventAttendeeService.findEventIdsByUserId(user.id);

      eventQuery.andWhere(
        new Brackets((qb) => {
          qb.where('event.visibility = :publicVisibility', {
            publicVisibility: EventVisibility.Public,
          });
          qb.orWhere('event.visibility = :authVisibility', {
            authVisibility: EventVisibility.Authenticated,
          });
          if (attendedEventIds.length > 0) {
            qb.orWhere(
              'event.visibility = :privateVisibility AND event.id IN (:...attendedEventIds)',
              {
                privateVisibility: EventVisibility.Private,
                attendedEventIds,
              },
            );
          }
        }),
      );
    }

    if (search) {
      eventQuery.andWhere('event.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (lat && lon) {
      if (isNaN(lon) || isNaN(lat)) {
        throw new Error('Invalid location format. Expected "lon,lat".');
      }

      const searchRadius = radius ?? DEFAULT_RADIUS;

      eventQuery.andWhere(
        `ST_DWithin(
          event.locationPoint,
          ST_SetSRID(ST_MakePoint(:lon, :lat), ${PostgisSrid.SRID}),
          :radius
        )`,
        { lon, lat, radius: searchRadius * 1609.34 }, // Convert Miles to meters
      );
    }

    if (type) {
      eventQuery.andWhere('event.type = :type', { type });
    }

    if (fromDate && toDate) {
      eventQuery.andWhere('event.startDate BETWEEN :fromDate AND :toDate', {
        fromDate,
        toDate,
      });
    } else if (fromDate) {
      eventQuery.andWhere('event.startDate >= :fromDate', { fromDate });
    } else if (toDate) {
      eventQuery.andWhere('event.startDate <= :toDate', { toDate });
    } else {
      eventQuery.andWhere('event.startDate > :now', { now: new Date() });
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

    return paginate(eventQuery, {
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Trace('event-query.searchAllEvents')
  async searchAllEvents(
    pagination: PaginationDto,
    query: HomeQuery,
  ): Promise<any> {
    await this.initializeRepository();
    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .where('event.status = :status', { status: EventStatus.Published })
      .select(['event.name', 'event.slug']);

    if (query.search) {
      eventQuery.andWhere('event.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    return paginate(eventQuery, {
      page: pagination.page,
      limit: pagination.limit,
    });
  }

  @Trace('event-query.getEventsByCreator')
  async getEventsByCreator(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository.find({
      where: { user: { id: userId } },
    });

    if (!events || events.length === 0) {
      return [];
    }

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

  @Trace('event-query.getEventsByAttendee')
  async getEventsByAttendee(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const attendees = await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .where('eventAttendee.user.id = :userId', { userId })
      .getMany();

    return attendees.map((attendee) => attendee.event);
  }

  @Trace('event-query.findEventsForGroup')
  async findEventsForGroup(
    groupId: number,
    limit: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository.find({
      where: {
        group: { id: groupId },
        status: EventStatus.Published,
      },
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

  @Trace('event-query.findUpcomingEventsForGroup')
  async findUpcomingEventsForGroup(
    groupId: number,
    limit: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository.find({
      where: {
        group: { id: groupId },
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      },
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

  @Trace('event-query.showDashboardEvents')
  async showDashboardEvents(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const createdEvents = await this.getEventsByCreator(userId);
    const attendingEvents = await this.getEventsByAttendee(userId);

    // Combine and deduplicate events
    const allEvents = [...createdEvents, ...attendingEvents];
    const uniqueEvents = Array.from(
      new Map(allEvents.map((event) => [event.id, event])).values(),
    );

    return Promise.all(
      uniqueEvents.map(async (event) => ({
        ...event,
        attendee: await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        ),
      })),
    ) as Promise<EventEntity[]>;
  }

  @Trace('event-query.getHomePageFeaturedEvents')
  async getHomePageFeaturedEvents(): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository
      .createQueryBuilder('event')
      .select(['event'])
      .leftJoinAndSelect('event.attendees', 'attendees')
      .leftJoinAndSelect('event.categories', 'categories')
      .leftJoinAndSelect('event.image', 'image')
      .where({
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      })
      .orderBy('RANDOM()')
      .limit(5)
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

  @Trace('event-query.getHomePageUserNextHostedEvent')
  async getHomePageUserNextHostedEvent(
    userId: number,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.user.id = :userId', { userId })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.status = :status', { status: EventStatus.Published })
      .orderBy('event.startDate', 'ASC')
      .getOne();

    if (!event) {
      return null;
    }

    event.attendeesCount =
      await this.eventAttendeeService.showConfirmedEventAttendeesCount(
        event.id,
      );

    return event;
  }

  @Trace('event-query.getHomePageUserRecentEventDrafts')
  async getHomePageUserRecentEventDrafts(
    userId: number,
  ): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository
      .createQueryBuilder('event')
      .where('event.user.id = :userId', { userId })
      .andWhere('event.status = :status', { status: EventStatus.Draft })
      .orderBy('event.updatedAt', 'DESC')
      .limit(3)
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

  @Trace('event-query.getHomePageUserUpcomingEvents')
  async getHomePageUserUpcomingEvents(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoin('event.attendees', 'attendee')
      .where('attendee.user.id = :userId', { userId })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.status = :status', { status: EventStatus.Published })
      .orderBy('event.startDate', 'ASC')
      .limit(5)
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

  @Trace('event-query.findEventTopicsByEventId')
  findEventTopicsByEventId(): Promise<any[]> {
    // Matrix-based discussions don't use Zulip topics
    return Promise.resolve([]);
  }

  @Trace('event-query.showEventAttendees')
  async showEventAttendees(
    slug: string,
    pagination: PaginationDto,
  ): Promise<any> {
    await this.initializeRepository();
    const event = await this.findEventBySlug(slug);
    return this.eventAttendeeService.showEventAttendees(event.id, pagination);
  }

  @Trace('event-query.findById')
  async findById(id: number, tenantId: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    return this.eventRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }
}
