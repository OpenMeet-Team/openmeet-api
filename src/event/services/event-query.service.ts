import {
  Injectable,
  Scope,
  Inject,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
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
import { RecurrenceService } from '../../recurrence/recurrence.service';

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
    @Inject(forwardRef(() => RecurrenceService))
    private readonly recurrenceService: RecurrenceService,
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
      throw new NotFoundException(`Event with slug ${slug} not found`);
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

    // Add recurrence information like human-readable description
    return this.addRecurrenceInformation(event);
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
      throw new NotFoundException('Event not found');
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

    // Matrix-based discussions will be loaded from the frontend directly
    // No need to set messages or topics in the event entity

    // Add recurrence information like human-readable description
    return this.addRecurrenceInformation(event);
  }

  @Trace('event-query.editEvent')
  async editEvent(slug: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'categories'],
    });
    if (event) {
      return this.addRecurrenceInformation(event);
    }
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

    return this.addRecurrenceInformation(event);
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

    // We need to make sure to fetch the event images properly
    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.user', 'user')
      .leftJoinAndSelect('user.photo', 'photo')
      .leftJoinAndSelect('event.image', 'image') // Use consistent naming to match the entity property
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

    // Get the paginated results
    const paginatedResults = await paginate(eventQuery, {
      page: pagination.page,
      limit: pagination.limit,
    });

    // Add recurrence descriptions to all events in the result without losing fields
    if (paginatedResults.data && paginatedResults.data.length > 0) {
      // Check first event to ensure image is present for debugging
      if (paginatedResults.data[0]) {
        const firstEvent = paginatedResults.data[0];
        this.logger.debug(
          `Event image before: ${firstEvent.image ? 'present' : 'missing'}`,
        );

        // If the event has an image, let's log some details about it
        if (firstEvent.image) {
          this.logger.debug(
            `Image details: id=${firstEvent.image.id}, path=${firstEvent.image.path}`,
          );
        }
      }

      // Process each event to add the recurrence description
      // Without losing fields, especially the image
      paginatedResults.data = paginatedResults.data.map((event) => {
        // Just modify the event directly, avoiding creating a new object
        // that would lose the EntityEntity class methods
        if (
          event.isRecurring &&
          event.recurrenceRule &&
          event.recurrenceRule.freq
        ) {
          const rule = event.recurrenceRule as any;
          const recurrenceDescription =
            this.recurrenceService.getRecurrenceDescription(
              {
                freq: rule.freq,
                interval: rule.interval,
                count: rule.count,
                until: rule.until,
                byday: rule.byday,
                bymonth: rule.bymonth,
                bymonthday: rule.bymonthday,
                wkst: rule.wkst,
              },
              event.timeZone,
            );

          // Debug what description is being generated
          this.logger.debug(
            `Generated recurrence description: "${recurrenceDescription}" for event id: ${event.id}`,
          );

          event.recurrenceDescription = recurrenceDescription;
        }

        return event;
      });

      // Check again after processing
      if (paginatedResults.data[0]) {
        const firstEvent = paginatedResults.data[0];
        this.logger.debug(
          `Event image after: ${firstEvent.image ? 'present' : 'missing'}`,
        );

        // Log image details again
        if (firstEvent.image) {
          this.logger.debug(
            `Image details after: id=${firstEvent.image.id}, path=${firstEvent.image.path}`,
          );
        }
      }
    }

    return paginatedResults;
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

    const paginatedResults = await paginate(eventQuery, {
      page: pagination.page,
      limit: pagination.limit,
    });

    // Add recurrence descriptions to all events in the result
    if (paginatedResults.data && paginatedResults.data.length > 0) {
      paginatedResults.data = paginatedResults.data.map((event) =>
        this.addRecurrenceInformation(event),
      );
    }

    return paginatedResults;
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

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
  }

  @Trace('event-query.getEventsByAttendee')
  async getEventsByAttendee(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const attendees = await this.eventAttendeesRepository
      .createQueryBuilder('eventAttendee')
      .leftJoinAndSelect('eventAttendee.event', 'event')
      .where('eventAttendee.user.id = :userId', { userId })
      .getMany();

    const events = attendees.map((attendee) => attendee.event);

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
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

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
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

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
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

    const eventsWithAttendees = (await Promise.all(
      uniqueEvents.map(async (event) => ({
        ...event,
        attendee: await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithAttendees.map((event) =>
      this.addRecurrenceInformation(event),
    );
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

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
  }

  @Trace('event-query.getHomePageUserNextHostedEvent')
  async getHomePageUserNextHostedEvent(
    userId: number,
  ): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.image', 'image')
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

    return this.addRecurrenceInformation(event);
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

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
  }

  @Trace('event-query.getHomePageUserUpcomingEvents')
  async getHomePageUserUpcomingEvents(userId: number): Promise<EventEntity[]> {
    await this.initializeRepository();
    const events = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoin('event.attendees', 'attendee')
      .leftJoinAndSelect('event.image', 'image')
      .where('attendee.user.id = :userId', { userId })
      .andWhere('event.startDate > :now', { now: new Date() })
      .andWhere('event.status = :status', { status: EventStatus.Published })
      .orderBy('event.startDate', 'ASC')
      .limit(5)
      .getMany();

    const eventsWithCounts = (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];

    // Add recurrence descriptions
    return eventsWithCounts.map((event) =>
      this.addRecurrenceInformation(event),
    );
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
  async findById(id: number, _tenantId: string): Promise<EventEntity | null> {
    await this.initializeRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (event) {
      return this.addRecurrenceInformation(event);
    }

    return event;
  }

  /**
   * Tenant-aware version of showEventBySlug that doesn't rely on the request context
   * This is useful for background processing where the request context is not available
   */
  @Trace('event-query.showEventBySlugWithTenant')
  async showEventBySlugWithTenant(
    slug: string,
    tenantId?: string,
  ): Promise<EventEntity | null> {
    // If tenantId is not provided, try to use the one from the request
    const effectiveTenantId = tenantId || this.request?.tenantId;

    if (!effectiveTenantId) {
      this.logger.error(
        'Neither explicit tenantId nor request.tenantId is available',
      );
      throw new Error('Tenant ID is required');
    }

    // Get a connection for the tenant
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(effectiveTenantId);
    const eventRepo = dataSource.getRepository(EventEntity);

    // Find the event using the provided tenant connection
    const event = await eventRepo.findOne({
      where: { slug },
      relations: ['user'],
    });

    if (!event) {
      this.logger.warn(
        `Event with slug ${slug} not found in tenant ${effectiveTenantId}`,
      );
      return null;
    }

    return this.addRecurrenceInformation(event);
  }

  /**
   * Find all events that have a specific parent event ID
   * Useful for finding split points and occurrences of a parent event
   */
  @Trace('event-query.findEventsByParentId')
  async findEventsByParentId(parentId: number): Promise<EventEntity[]> {
    await this.initializeRepository();

    const events = await this.eventRepository.find({
      where: { parentEventId: parentId },
      order: {
        originalDate: 'ASC',
      },
    });

    // Add recurrence descriptions
    return events.map((event) => this.addRecurrenceInformation(event));
  }

  /**
   * Enhance event entity with recurrence information
   * This adds a human-readable description of the recurrence pattern and other helpful properties
   */
  @Trace('event-query.addRecurrenceInformation')
  private addRecurrenceInformation(event: EventEntity): EventEntity {
    if (!event) {
      return event;
    }

    // Don't modify the original object, just add the description
    if (event.isRecurring && event.recurrenceRule) {
      // Add a human-readable description of the recurrence pattern
      // Convert the record to a RecurrenceRule with the required freq property
      if (event.recurrenceRule.freq) {
        const rule = event.recurrenceRule as any;

        // Debug what's in the recurrence rule
        this.logger.debug(
          `Adding recurrence description for event ${event.id}, rule: ${JSON.stringify(rule)}`,
        );

        // Just add the description field without modifying anything else
        const recurrenceDescription =
          this.recurrenceService.getRecurrenceDescription(
            {
              freq: rule.freq,
              interval: rule.interval,
              count: rule.count,
              until: rule.until,
              byday: rule.byday,
              bymonth: rule.bymonth,
              bymonthday: rule.bymonthday,
              wkst: rule.wkst,
            },
            event.timeZone,
          );

        this.logger.debug(
          `Generated description: "${recurrenceDescription}" for event ${event.id}`,
        );

        event.recurrenceDescription = recurrenceDescription;
      } else {
        this.logger.debug(
          `Event ${event.id} is recurring but has no freq in recurrenceRule: ${JSON.stringify(event.recurrenceRule)}`,
        );
      }
    } else if (event.id) {
      this.logger.debug(
        `Event ${event.id} is not recurring or has no recurrenceRule`,
      );
    }

    // Log if image is missing to help debug
    if (!event.image && event.id) {
      this.logger.debug(
        `Event ${event.id} is missing an image after recurrence processing`,
      );
    }

    return event;
  }
}
