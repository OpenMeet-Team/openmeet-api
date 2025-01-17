import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  UnprocessableEntityException,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { MoreThan, Repository } from 'typeorm';
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
  EventAttendeeStatus,
  EventStatus,
  EventVisibility,
  EventAttendeeRole,
  PostgisSrid,
  ZULIP_DEFAULT_CHANNEL_TOPIC,
  DEFAULT_RADIUS,
} from '../core/constants/constant';
import { EventAttendeeService } from '../event-attendee/event-attendee.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CategoryEntity } from '../category/infrastructure/persistence/relational/entities/categories.entity';
import { GroupMemberService } from '../group-member/group-member.service';
import { FilesS3PresignedService } from '../file/infrastructure/uploader/s3-presigned/file.service';
import { ZulipService } from '../zulip/zulip.service';
import { CreateEventAttendeeDto } from '../event-attendee/dto/create-eventAttendee.dto';
import { EventRoleService } from '../event-role/event-role.service';
import { UserEntity } from '../user/infrastructure/persistence/relational/entities/user.entity';
import { UserService } from '../user/user.service';
import { UpdateEventAttendeeDto } from 'src/event-attendee/dto/update-eventAttendee.dto';
import { ZulipTopic } from 'zulip-js';
import { HomeQuery } from '../home/dto/home-query.dto';
import { EventAttendeesEntity } from '../event-attendee/infrastructure/persistence/relational/entities/event-attendee.entity';
import { Brackets } from 'typeorm';
import { EventMailService } from '../event-mail/event-mail.service';
import { AuditLoggerService } from '../logger/audit-logger.provider';
import { Trace } from '../utils/trace.decorator';
import { trace } from '@opentelemetry/api';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private readonly auditLogger = AuditLoggerService.getInstance();
  private readonly logger = new Logger(EventService.name);
  private readonly tracer = trace.getTracer('event-service');

  private eventRepository: Repository<EventEntity>;
  private eventAttendeesRepository: Repository<EventAttendeesEntity>;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly tenantConnectionService: TenantConnectionService,
    private readonly categoryService: CategoryService,
    private readonly eventAttendeeService: EventAttendeeService,
    private eventEmitter: EventEmitter2,
    private readonly groupMemberService: GroupMemberService,
    private readonly fileService: FilesS3PresignedService,
    private readonly zulipService: ZulipService,
    private readonly eventRoleService: EventRoleService,
    private readonly userService: UserService,
    private readonly eventMailService: EventMailService,
  ) {
    void this.initializeRepository();
    this.logger.log('EventService Constructed');
  }

  @Trace('event.initializeRepository')
  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  @Trace('event.getTenantSpecificEventRepository')
  async getTenantSpecificEventRepository() {
    const span = this.tracer.startSpan('getTenantSpecificEventRepository');
    try {
      const tenantId = this.request.tenantId;
      span.setAttribute('tenantId', tenantId);

      const dataSource =
        await this.tenantConnectionService.getTenantConnection(tenantId);
      this.eventRepository = dataSource.getRepository(EventEntity);
      this.eventAttendeesRepository =
        dataSource.getRepository(EventAttendeesEntity);
    } catch (error) {
      span.recordException(error);
      this.logger.error('Failed to get tenant connection', error);
      throw error;
    } finally {
      span.end();
    }
  }

  @Trace('event.findEventBySlug')
  async findEventBySlug(slug: string): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();

    this.logger.debug(`[findEventBySlug] Finding event for slug: ${slug}`);
    this.logger.debug(
      `[findEventBySlug] Current user: ${this.request.user?.id}`,
    );

    const event = await this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.attendees', 'attendee')
      .leftJoinAndSelect('attendee.user', 'user')
      .leftJoinAndSelect('attendee.role', 'role')
      .where('event.slug = :slug', { slug })
      .getOne();

    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }

    // If there's a user in the request context, find their attendance
    if (this.request.user) {
      this.logger.debug(
        `[findEventBySlug] Finding attendance for user: ${this.request.user.id}`,
      );
      const attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          this.request.user.id,
        );
      this.logger.debug(
        `[findEventBySlug] Found attendee: ${JSON.stringify(attendee)}`,
      );
      this.logger.debug(
        `[findEventBySlug] Attendee status: ${attendee?.status}`,
      );
      event.attendee = attendee;
    }

    return event;
  }

  @Trace('event.create')
  async create(
    createEventDto: CreateEventDto,
    userId: number,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    // Set default values and prepare base event data
    const eventData = {
      ...createEventDto,
      status: createEventDto.status || EventStatus.Published,
      visibility: createEventDto.visibility || EventVisibility.Public,
      user: { id: userId },
      group: createEventDto.group ? { id: createEventDto.group.id } : null,
    };

    // Handle categories
    let categories: CategoryEntity[] = [];
    try {
      categories = await this.categoryService.findByIds(
        createEventDto.categories,
      );
    } catch (error) {
      throw new NotFoundException(`Error finding categories: ${error.message}`);
    }

    // Handle location
    let locationPoint;
    if (createEventDto.lat && createEventDto.lon) {
      const { lat, lon } = createEventDto;
      if (isNaN(lat) || isNaN(lon)) {
        throw new BadRequestException('Invalid latitude or longitude');
      }
      locationPoint = {
        type: 'Point',
        coordinates: [lon, lat],
      };
    }

    // Create and save the event
    const event = this.eventRepository.create({
      ...eventData,
      categories,
      locationPoint,
    } as EventEntity);

    const createdEvent = await this.eventRepository.save(event);

    // Add host as first attendee
    const hostRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Host,
    );

    await this.eventAttendeeService.create({
      role: hostRole,
      status: EventAttendeeStatus.Confirmed,
      user: { id: userId } as UserEntity,
      event: createdEvent,
    });

    this.auditLogger.log('event created', {
      createdEvent,
    });
    this.eventEmitter.emit('event.created', createdEvent);
    return createdEvent;
  }

  @Trace('event.showAllEvents')
  async showAllEvents(
    pagination: PaginationDto,
    query: QueryEventDto,
    user?: any,
  ): Promise<any> {
    const span = this.tracer.startSpan('showAllEvents');
    try {
      span.setAttribute('pagination', JSON.stringify(pagination));
      span.setAttribute('query', JSON.stringify(query));
      span.setAttribute('user', JSON.stringify(user));

      const repoSpan = this.tracer.startSpan('initRepository');
      await this.getTenantSpecificEventRepository();
      repoSpan.end();

      const querySpan = this.tracer.startSpan('executeQuery');
      const {
        search,
        lat,
        lon,
        radius,
        type,
        // location,
        fromDate,
        toDate,
        categories,
      } = query;

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
        .where('event.status = :status', { status: EventStatus.Published });

      // Visibility filters based on authentication status
      if (!user) {
        // Unauthenticated users can only see public events
        eventQuery.andWhere('event.visibility = :visibility', {
          visibility: EventVisibility.Public,
        });
      } else if (user.roles?.includes('admin')) {
        // Admins can see all events
      } else {
        // Get all event IDs this user is attending
        const attendedEventIds =
          await this.eventAttendeeService.findEventIdsByUserId(user.id);

        eventQuery.andWhere(
          new Brackets((qb) => {
            // Public events
            qb.where('event.visibility = :publicVisibility', {
              publicVisibility: EventVisibility.Public,
            });
            // Authenticated events (only for logged-in users)
            qb.orWhere('event.visibility = :authVisibility', {
              authVisibility: EventVisibility.Authenticated,
            });
            // Private events only if attending
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
          throw new BadRequestException(
            'Invalid location format. Expected "lon,lat".',
          );
        }

        const searchRadius = radius ?? DEFAULT_RADIUS;

        // Find events within the radius using ST_DWithin
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

      // if (location) {
      //   eventQuery.andWhere('event.location ILIKE :location', {
      //     location: `%${location}%`,
      //   });
      // }

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

      const paginatedEvents = await paginate(eventQuery, {
        page: pagination.page,
        limit: pagination.limit,
      });
      querySpan.end();

      span.setAttribute('events.count', paginatedEvents.data.length);
      return paginatedEvents;
    } finally {
      span.end();
    }
  }

  @Trace('event.searchAllEvents')
  async searchAllEvents(
    pagination: PaginationDto,
    query: HomeQuery,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();
    const { page, limit } = pagination;
    const { search } = query;
    const eventQuery = this.eventRepository
      .createQueryBuilder('event')
      .where('event.status = :status', { status: EventStatus.Published })
      .select(['event.name', 'event.slug']);

    if (search) {
      eventQuery.andWhere('event.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    return paginate(eventQuery, { page, limit });
  }

  @Trace('event.showEvent')
  async showEvent(slug: string, userId?: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
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

    event.topics = event.zulipChannelId
      ? (
          await this.zulipService.getAdminStreamTopics(event.zulipChannelId)
        ).filter((topic) => topic.name !== ZULIP_DEFAULT_CHANNEL_TOPIC)
      : [];
    event.messages = event.zulipChannelId
      ? await this.zulipService.getAdminMessages({
          anchor: 'oldest',
          num_before: 0,
          num_after: 100,
          narrow: [{ operator: 'stream', operand: event.zulipChannelId }],
        })
      : [];

    return event;
  }

  @Trace('event.findEventTopicsByEventId')
  async findEventTopicsByEventId(
    zulipChannelId: number,
  ): Promise<ZulipTopic[]> {
    return await this.zulipService.getAdminStreamTopics(zulipChannelId);
  }

  @Trace('event.findRandom')
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

  @Trace('event.showRandomEvents')
  async showRandomEvents(limit: number): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: {
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      },
      relations: ['categories'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }

  @Trace('event.showRecommendedEventsByEventSlug')
  async showRecommendedEventsByEventSlug(slug: string): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({
      where: {
        slug,
        startDate: MoreThan(new Date()),
      },
      relations: ['categories'],
    });

    if (!event) {
      return await this.showRandomEvents(4);
    } else {
      const categoryIds = event.categories?.map((c) => c.id);

      return await this.findRecommendedEventsForEvent(event.id, categoryIds, 4);
    }
  }

  @Trace('event.findRecommendedEventsForEvent')
  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    limit: number,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

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

    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }

  @Trace('event.findRecommendedEventsForGroup')
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

    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }

  @Trace('event.findRandomEventsForGroup')
  async findRandomEventsForGroup(
    groupId: number,
    minEvents: number = 0,
    maxEvents: number = 5,
  ): Promise<EventEntity[]> {
    if (maxEvents < minEvents || minEvents < 0 || maxEvents < 0) {
      return [];
    }
    await this.getTenantSpecificEventRepository();

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

    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }

  @Trace('event.update')
  async update(
    slug: string,
    updateEventDto: UpdateEventDto,
    userId: number | undefined,
  ): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOneOrFail({
      where: { slug },
    });
    const group = updateEventDto.group ? { id: updateEventDto.group } : null;
    const user = { id: userId };

    const mappedDto: any = {
      ...updateEventDto,
      user,
      group,
    };

    if (updateEventDto.categories && updateEventDto.categories.length) {
      const categories = await this.categoryService.findByIds(
        updateEventDto.categories,
      );
      mappedDto.categories = categories;
    }

    if (mappedDto.image?.id === 0) {
      if (mappedDto.image) {
        await this.fileService.delete(mappedDto.image.id);
        mappedDto.image = null;
      }
    } else if (mappedDto.image?.id) {
      const fileObject = await this.fileService.findById(mappedDto.image.id);

      if (!fileObject) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            photo: 'imageNotExists',
          },
        });
      }

      mappedDto.image = fileObject;
    }

    this.auditLogger.log('event updated', {
      event,
      mappedDto,
    });
    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    return this.eventRepository.save(updatedEvent);
  }

  @Trace('event.remove')
  async remove(slug: string): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findEventBySlug(slug);
    const eventCopy = { ...event };

    // Delete related event attendees first
    await this.eventAttendeeService.deleteEventAttendees(event.id);

    // Now delete the event
    await this.eventRepository.remove(event);
    this.eventEmitter.emit('event.deleted', eventCopy);
    this.auditLogger.log('event deleted', {
      event,
    });
  }

  @Trace('event.deleteEventsByGroup')
  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    await this.eventRepository.delete({ group: { id: groupId } });
    this.auditLogger.log('events deleted by group', {
      groupId,
    });
  }

  @Trace('event.getEventsByCreator')
  async getEventsByCreator(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events =
      (await this.eventRepository.find({
        where: { user: { id: userId } },
      })) || [];
    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];
  }

  @Trace('event.getEventsByAttendee')
  async getEventsByAttendee(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { attendees: { user: { id: userId } } },
    });
    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount:
          await this.eventAttendeeService.showConfirmedEventAttendeesCount(
            event.id,
          ),
      })),
    )) as EventEntity[];
  }

  @Trace('event.getHomePageFeaturedEvents')
  async getHomePageFeaturedEvents(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .select(['event'])
      .leftJoinAndSelect('event.image', 'image')
      .where({
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object

    return events;
  }

  @Trace('event.getHomePageUserUpcomingEvents')
  async getHomePageUserUpcomingEvents(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: EventStatus.Published },
      relations: ['user', 'attendees'],
    }); // TODO: check if this is correct. Should return list of user upcoming events (Home Page)
  }

  @Trace('event.getHomePageUserRecentEventDrafts')
  async getHomePageUserRecentEventDrafts(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: EventStatus.Draft },
    }); // TODO: check if this is correct. Should return list of user recent event drafts (Home Page)
  }

  @Trace('event.getHomePageUserNextHostedEvent')
  async getHomePageUserNextHostedEvent(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.findOne({ where: { user: { id: userId } } });
  }

  @Trace('event.findEventDetailsAttendees')
  async findEventDetailsAttendees(eventId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.findEventAttendees(eventId);
  }

  @Trace('event.findEventsForGroup')
  async findEventsForGroup(groupId: number, limit: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { group: { id: groupId }, status: EventStatus.Published },
      take: limit,
    });
    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }

  @Trace('event.editEvent')
  async editEvent(slug: string) {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'categories'],
    });
    this.auditLogger.log('event edited', {
      event,
    });
    return event;
  }

  @Trace('event.cancelAttendingEvent')
  async cancelAttendingEvent(slug: string, userId: number) {
    await this.getTenantSpecificEventRepository();
    const event = await this.findEventBySlug(slug);

    const eventAttendee = await this.eventAttendeeService.cancelEventAttendance(
      event.id,
      userId,
    );

    return eventAttendee;
  }

  @Trace('event.attendEvent')
  async attendEvent(
    slug: string,
    userId: number,
    createEventAttendeeDto: CreateEventAttendeeDto,
  ) {
    await this.getTenantSpecificEventRepository();

    const event = await this.findEventBySlug(slug);
    const user = await this.userService.getUserById(userId);
    const eventAttendee =
      await this.eventAttendeeService.findEventAttendeeByUserId(
        event.id,
        user.id,
      );

    if (
      eventAttendee &&
      eventAttendee.status !== EventAttendeeStatus.Cancelled
    ) {
      return eventAttendee;
    }

    const participantRole = await this.eventRoleService.getRoleByName(
      EventAttendeeRole.Participant,
    );

    // Create the attendee with appropriate status based on event settings
    let attendeeStatus = EventAttendeeStatus.Confirmed;
    if (event.allowWaitlist) {
      const count = await this.eventAttendeeService.showEventAttendeesCount(
        event.id,
      );
      if (count >= event.maxAttendees) {
        attendeeStatus = EventAttendeeStatus.Waitlist;
      }
    }
    if (event.requireApproval) {
      attendeeStatus = EventAttendeeStatus.Pending;
    }

    // Create the attendee
    const attendee = await this.eventAttendeeService.create({
      ...createEventAttendeeDto,
      event,
      user: user,
      status: attendeeStatus,
      role: participantRole,
    });

    await this.eventMailService.sendMailAttendeeGuestJoined(attendee);

    // Emit event for other parts of the system
    this.eventEmitter.emit('event.attendee.added', {
      eventId: event.id,
      userId: user.id,
      status: attendeeStatus,
    });

    return attendee;
  }

  @Trace('event.showEventAttendees')
  async showEventAttendees(slug: string, pagination: PaginationDto) {
    await this.getTenantSpecificEventRepository();
    const event = await this.findEventBySlug(slug);
    return this.eventAttendeeService.showEventAttendees(event.id, pagination); // TODO if admin role return all attendees otherwise only confirmed
  }

  @Trace('event.updateEventAttendee')
  async updateEventAttendee(
    slug: string,
    attendeeId: number,
    updateEventAttendeeDto: UpdateEventAttendeeDto,
  ) {
    await this.getTenantSpecificEventRepository();

    await this.findEventBySlug(slug);

    await this.eventAttendeeService.updateEventAttendee(
      attendeeId,
      updateEventAttendeeDto,
    );

    // TODO enable this
    await this.eventMailService.sendMailAttendeeStatusChanged(attendeeId);

    return await this.eventAttendeeService.showEventAttendee(attendeeId);
  }

  @Trace('event.sendEventDiscussionMessage')
  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    await this.getTenantSpecificEventRepository();

    const event = await this.findEventBySlug(slug);

    const user = await this.userService.getUserById(userId);

    const eventChannelName = `tenant_${this.request.tenantId}__event_${event.ulid}`;

    if (!event.zulipChannelId) {
      // create channel
      await this.zulipService.subscribeAdminToChannel({
        subscriptions: [
          {
            name: eventChannelName,
          },
        ],
      });
      const stream = await this.zulipService.getAdminStreamId(eventChannelName);

      event.zulipChannelId = stream.id;
      await this.eventRepository.save(event);
    }

    await this.zulipService.getInitialisedClient(user);
    await user.reload();

    const params = {
      to: event.zulipChannelId,
      type: 'channel' as const,
      topic: body.topicName,
      content: body.message,
    };

    return await this.zulipService.sendUserMessage(user, params);
  }

  @Trace('event.updateEventDiscussionMessage')
  async updateEventDiscussionMessage(
    messageId: number,
    message: string,
    userId: number,
  ): Promise<{ id: number }> {
    const user = await this.userService.getUserById(userId);
    return await this.zulipService.updateUserMessage(user, messageId, message);
    // return await this.zulipService.updateAdminMessage(messageId, message);
  }

  async deleteEventDiscussionMessage(
    messageId: number,
  ): Promise<{ id: number }> {
    return await this.zulipService.deleteAdminMessage(messageId);
  }

  async showDashboardEvents(userId: number): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();
    const createdEvents = await this.getEventsByCreator(userId);

    const attendingEvents = await this.getEventsByAttendee(userId);

    // Combine and deduplicate events
    const allEvents = [...createdEvents, ...attendingEvents];

    const uniqueEvents = Array.from(
      new Map(allEvents.map((event) => [event.id, event])).values(),
    );

    return (await Promise.all(
      uniqueEvents.map(async (event) => ({
        ...event,
        attendee: await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        ),
      })),
    )) as EventEntity[];
  }

  @Trace('event.getEventAttendeesCount')
  async getEventAttendeesCount(eventId: number): Promise<number> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeeService.showEventAttendeesCount(eventId);
  }

  @Trace('event.findUpcomingEventsForGroup')
  async findUpcomingEventsForGroup(groupId: number, limit: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: {
        group: { id: groupId },
        status: EventStatus.Published,
        startDate: MoreThan(new Date()),
      },
      take: limit,
    });
    return (await Promise.all(
      events.map(async (event) => ({
        ...event,
        attendeesCount: await this.getEventAttendeesCount(event.id),
      })),
    )) as EventEntity[];
  }
}
