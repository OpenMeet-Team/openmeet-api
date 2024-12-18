import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  UnprocessableEntityException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateEventDto, EventTopicCommentDto } from './dto/create-event.dto';
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

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
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
  ) {
    void this.initializeRepository();
  }

  private async initializeRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  async getTenantSpecificEventRepository() {
    const tenantId = this.request.tenantId;
    const dataSource =
      await this.tenantConnectionService.getTenantConnection(tenantId);
    this.eventRepository = dataSource.getRepository(EventEntity);
    this.eventAttendeesRepository =
      dataSource.getRepository(EventAttendeesEntity);
  }

  async findEventBySlug(slug: string): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException(`Event with slug ${slug} not found`);
    }
    return event;
  }

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
      group: createEventDto.group ? { id: createEventDto.group } : null,
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
    const hostRole = await this.eventRoleService.findByName(
      EventAttendeeRole.Host,
    );
    if (!hostRole) {
      throw new NotFoundException('Host role not found');
    }

    await this.eventAttendeeService.create({
      role: hostRole,
      status: EventAttendeeStatus.Confirmed,
      user: { id: userId } as UserEntity,
      event: createdEvent,
    });

    this.eventEmitter.emit('event.created', createdEvent);
    return createdEvent;
  }

  async postComment(
    eventUlid: string,
    userId: number,
    body: EventTopicCommentDto,
  ): Promise<{ id: number }> {
    await this.getTenantSpecificEventRepository();

    const { content, topic } = body;

    const event = await this.eventRepository.findOne({
      where: { ulid: eventUlid },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // First make sure the user has a zulip client
    await this.zulipService.getInitialisedClient(user);
    await user.reload();

    const eventChannelName = `tenant_${this.request.tenantId}__event_${event.ulid}`;

    // check if zulip channels exists
    const stream = await this.zulipService.getAdminStreamId(eventChannelName);

    if (!stream.id) {
      // create channel
      await this.zulipService.subscribeAdminToChannel({
        subscriptions: [
          {
            name: eventChannelName,
          },
        ],
      });
    }

    const params = {
      to: eventChannelName,
      type: 'channel' as const,
      topic: topic || `event_${event.ulid}`,
      content: content,
    };

    return await this.zulipService.sendUserMessage(user, params);
  }

  async showAllEvents(
    pagination: PaginationDto,
    query: QueryEventDto,
    user?: any,
  ): Promise<any> {
    await this.getTenantSpecificEventRepository();

    const {
      search,
      lat,
      lon,
      radius,
      type,
      location,
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

    if (!user) {
      eventQuery.andWhere('event.visibility = :visibility', {
        visibility: EventVisibility.Public,
      });
    } else if (user.roles?.includes('admin')) {
      // For admin users, we don't need any visibility filters
      // Remove any visibility conditions to show all events
    } else {
      // Get all event IDs this user is attending
      const attendedEventIds =
        await this.eventAttendeeService.findEventIdsByUserId(user.id);

      eventQuery.andWhere(
        new Brackets((qb) => {
          qb.where('event.visibility = :publicVisibility', {
            publicVisibility: EventVisibility.Public,
          })
            .orWhere('event.visibility = :authVisibility', {
              authVisibility: EventVisibility.Authenticated,
            })
            .orWhere(
              'event.visibility = :privateVisibility AND event.id IN (:...attendedEventIds)',
              {
                privateVisibility: EventVisibility.Private,
                attendedEventIds: attendedEventIds.length
                  ? attendedEventIds
                  : [0],
              },
            );
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

      // Default radius to 5 kilometers if not provided
      const searchRadius = radius ?? 5;

      // Find events within the radius using ST_DWithin
      eventQuery.andWhere(
        `ST_DWithin(
          event.locationPoint,
          ST_SetSRID(ST_MakePoint(:lon, :lat), ${PostgisSrid.SRID}),
          :radius
        )`,
        { lon, lat, radius: searchRadius * 1000 }, // Convert kilometers to meters
      );
    }

    if (type) {
      eventQuery.andWhere('event.type = :type', { type });
    }

    if (location) {
      eventQuery.andWhere('event.location ILIKE :location', {
        location: `%${location}%`,
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

    const paginatedEvents = await paginate(eventQuery, {
      page: pagination.page,
      limit: pagination.limit,
    });
    return paginatedEvents;
  }

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

  async findEventTopicsByEventId(
    zulipChannelId: number,
  ): Promise<ZulipTopic[]> {
    return await this.zulipService.getAdminStreamTopics(zulipChannelId);
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

  async showRandomEvents(limit: number): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { status: EventStatus.Published },
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

  async showRecommendedEventsByEventSlug(slug: string): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({
      where: { slug },
      relations: ['categories'],
    });

    if (!event) {
      return await this.showRandomEvents(4);
    } else {
      const categoryIds = event.categories?.map((c) => c.id);

      return await this.findRecommendedEventsForEvent(event.id, categoryIds, 4);
    }
  }

  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    limit: number,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const query = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.categories', 'categories')
      .where('event.status = :status', { status: EventStatus.Published })
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
      .where('event.status = :status', { status: EventStatus.Published })
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
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
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

    const updatedEvent = this.eventRepository.merge(event, mappedDto);
    return this.eventRepository.save(updatedEvent);
  }

  async remove(slug: string): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const eventCopy = { ...event };

    // Delete related event attendees first
    await this.eventAttendeeService.deleteEventAttendees(event.id);

    // Now delete the event
    await this.eventRepository.remove(event);
    this.eventEmitter.emit('event.deleted', eventCopy);
  }

  async deleteEventsByGroup(groupId: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    await this.eventRepository.delete({ group: { id: groupId } });
  }

  async getEventsByCreator(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events =
      (await this.eventRepository.find({
        where: { user: { id: userId } },
        relations: ['user', 'attendees'],
      })) || [];
    return events.map((event) => ({
      ...event,
      attendeesCount: event.attendees ? event.attendees.length : 0,
    }));
  }

  async getEventsByAttendee(userId: number) {
    await this.getTenantSpecificEventRepository();
    const events = await this.eventRepository.find({
      where: { attendees: { user: { id: userId } } },
      relations: ['user', 'attendees'],
    });
    return events.map((event) => ({
      ...event,
      attendeesCount: event.attendees ? event.attendees.length : 0,
    }));
  }

  async getHomePageFeaturedEvents(): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const events = await this.eventRepository
      .createQueryBuilder('event')
      .select(['event'])
      .leftJoinAndSelect('event.image', 'image')
      .where({
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
      })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object

    console.log('events', events);
    return events;
  }

  async getHomePageUserUpcomingEvents(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: EventStatus.Published },
      relations: ['user', 'attendees'],
    }); // TODO: check if this is correct. Should return list of user upcoming events (Home Page)
  }

  async getHomePageUserRecentEventDrafts(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { user: { id: userId }, status: EventStatus.Draft },
    }); // TODO: check if this is correct. Should return list of user recent event drafts (Home Page)
  }

  async getHomePageUserNextHostedEvent(userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.findOne({ where: { user: { id: userId } } });
  }

  async findEventDetailsAttendees(eventId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.findEventAttendees(eventId);
  }

  async findEventsForGroup(groupId: number, limit: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.find({
      where: { group: { id: groupId } },
      take: limit,
    });
  }

  async editEvent(slug: string) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.findOne({
      where: { slug },
      relations: ['group', 'categories'],
    });
  }

  async cancelAttendingEvent(slug: string, userId: number) {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.eventAttendeeService.cancelAttendingEvent(event.id, userId);
  }

  async attendEvent(
    slug: string,
    userId: number,
    createEventAttendeeDto: CreateEventAttendeeDto,
  ) {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const participantRole = await this.eventRoleService.findByName(
      EventAttendeeRole.Participant,
    );

    if (!participantRole) {
      throw new NotFoundException('Participant role not found');
    }

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
      user: { id: userId } as UserEntity,
      status: attendeeStatus,
      role: participantRole,
    });

    // Emit event for other parts of the system
    this.eventEmitter.emit('event.attendee.added', {
      eventId: event.id,
      userId,
      status: attendeeStatus,
    });

    return attendee;
  }

  async showEventAttendees(slug: string, pagination: PaginationDto) {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.eventAttendeeService.showEventAttendees(event.id, pagination); // TODO if admin role return all attendees otherwise only confirmed
  }

  async updateEventAttendee(
    slug: string,
    attendeeId: number,
    updateEventAttendeeDto: UpdateEventAttendeeDto,
  ) {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({ where: { slug } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.eventAttendeeService.updateEventAttendee(
      event.id,
      attendeeId,
      updateEventAttendeeDto,
    );
  }

  async sendEventDiscussionMessage(
    slug: string,
    userId: number,
    body: { message: string; topicName: string },
  ): Promise<{ id: number }> {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({
      where: { slug },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

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

  async updateEventDiscussionMessage(
    messageId: number,
    message: string,
    userId: number,
  ): Promise<{ id: number }> {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
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

  async getEventAttendeesCount(eventId: number): Promise<number> {
    await this.getTenantSpecificEventRepository();
    return await this.eventAttendeeService.showEventAttendeesCount(eventId);
  }
}
