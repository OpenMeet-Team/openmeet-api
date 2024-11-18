import {
  Injectable,
  NotFoundException,
  Inject,
  Scope,
  InternalServerErrorException,
  UnprocessableEntityException,
  HttpStatus,
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
} from '../core/constants/constant';
import slugify from 'slugify';
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
import { generateShortCode } from '../utils/short-code';

@Injectable({ scope: Scope.REQUEST, durable: true })
export class EventService {
  private eventRepository: Repository<EventEntity>;

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

    const shortCode = await generateShortCode();
    const slugifiedName = `${slugify(createEventDto.name, {
      strict: true,
      lower: true,
    })}-${shortCode.toLowerCase()}`;

    const mappedDto = {
      ...createEventDto,
      user,
      slug: slugifiedName,
      group,
      categories,
    };
    const event = this.eventRepository.create(mappedDto as EventEntity);
    const createdEvent = await this.eventRepository.save(event);

    const hostRole = await this.eventRoleService.findByName(
      EventAttendeeRole.Host,
    );
    if (!hostRole) {
      throw new NotFoundException('Host role not found');
    }

    const eventAttendeeDto: CreateEventAttendeeDto = {
      role: hostRole,
      status: EventAttendeeStatus.Confirmed,
      user: user as UserEntity,
      event: createdEvent,
    };

    await this.eventAttendeeService.create(eventAttendeeDto);

    this.eventEmitter.emit('event.created', createdEvent);
    return createdEvent;
  }

  async postComment(
    eventUlid: string,
    userId: number,
    body: EventTopicCommentDto,
  ) {
    await this.getTenantSpecificEventRepository();
    console.log(body);
    const { content, topic } = body;

    const event = await this.eventRepository.findOneByOrFail({
      ulid: eventUlid,
    });

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // First make sure the user has a zulip client
    await this.zulipService.getInitialisedClient(user);

    const eventChannelName = `tenant_${this.request.tenantId}__event_${event.ulid}`;

    // check if zulip channels exists
    const streamResponse = await this.zulipService.getUserStreamId(
      user,
      eventChannelName,
    );

    if (streamResponse.result !== 'success') {
      // create channel
      await this.zulipService.subscribeUserToChannel(user, {
        subscriptions: [
          {
            name: eventChannelName,
            description: 'Test description for an event channel',
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

    const response = await this.zulipService.sendUserMessage(user, params);
    return response;
  }

  // async updateComment(body: CommentDto, messageId: number) {
  //   const { message } = body;

  //   try {
  //     const response = await this.zulipService.editZulipMessage(
  //       messageId,
  //       message,
  //     );
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to update Zulip comment');
  //   }
  // }

  // async deleteComment(messageId: number) {
  //   try {
  //     const response = await this.zulipService.deleteZulipMessage(messageId);
  //     console.log('Message sent successfully:', response);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to delete Zulip comment');
  //   }
  // }

  // async showTopics(eventId: number) {
  //   try {
  //     const tenantId = this.request.tenantId;
  //     const event = await this.findOne(eventId);
  //     const streamName = `${tenantId}_event_${event.ulid}`;

  //     // const response = await this.zulipService.getZulipTopics(streamName);

  //     // return response;
  //   } catch (error) {
  //     console.error('Error fetching topics and messages from Zulip:', error);
  //     throw new Error('Failed to fetch topics and messages');
  //   }
  // }

  // async postCommentOnTopic(
  //   body: CommentDto,
  //   topicName: string,
  //   eventId: number,
  // ) {
  //   const { message } = body;

  //   const event = await this.findOne(eventId);
  //   const tenantId = this.request.tenantId;
  //   const params = {
  //     to: `${tenantId}_event_${event.ulid}`,
  //     type: 'stream',
  //     topic: topicName,
  //     content: message,
  //   };

  //   try {
  //     const response = await this.zulipService.postZulipComment(params);
  //     console.log('Message sent successfully to topic:', topicName);
  //     return response;
  //   } catch (error) {
  //     console.error('Error sending message to Zulip:', error);
  //     throw new Error('Failed to send message to the topic');
  //   }
  // }

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
      .where('event.status = :status', { status: EventStatus.Published });

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

  async showEvent(id: number, userId?: number): Promise<EventEntity> {
    await this.getTenantSpecificEventRepository();
    const event = await this.eventRepository.findOne({
      where: { id },
      relations: ['user', 'group', 'categories'],
    });

    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }

    event.attendees =
      await this.eventAttendeeService.findEventAttendeesByEventId(id, 5);

    if (event.group && userId) {
      event.groupMember = await this.groupMemberService.findGroupMemberByUserId(
        event.group.id,
        userId,
      );
    }

    if (userId) {
      event.attendee =
        await this.eventAttendeeService.findEventAttendeeByUserId(
          event.id,
          userId,
        );
    }

    event.topics = event.zulipChannelId
      ? await this.findEventTopicsByEventId(event.zulipChannelId)
      : [];

    return event;
  }

  async findEventTopicsByEventId(zulipChannelId: number): Promise<any[]> {
    const topics = await this.zulipService.getAdminStreamTopics(zulipChannelId);

    if (topics.result === 'success') {
      return topics.topics;
    }

    return [];
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
    return this.eventRepository.find({
      where: { status: EventStatus.Published },
      relations: ['attendees'],
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getRecommendedEventsByEventId(eventId: number): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ['categories'],
    });

    if (!event) {
      return await this.showRandomEvents(4);
    } else {
      const categoryIds = event.categories?.map((c) => c.id);

      return await this.findRecommendedEventsForEvent(eventId, categoryIds, 4);
    }
  }

  async findRecommendedEventsForEvent(
    eventId: number,
    categoryIds: number[],
    limit: number,
  ): Promise<EventEntity[]> {
    await this.getTenantSpecificEventRepository();

    return this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.categories', 'categories')
      .where('event.status = :status', { status: EventStatus.Published })
      .andWhere('categories.id IN (:...categoryIds)', {
        categoryIds: categoryIds || [],
      })
      .orderBy('RANDOM()')
      .limit(limit)
      .getMany();
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

    try {
      const recommendedEvents = await this.eventRepository
        .createQueryBuilder('event')
        .leftJoinAndSelect('event.group', 'group')
        .leftJoinAndSelect('event.categories', 'categories')
        .leftJoinAndSelect('event.attendees', 'attendees')
        .where('event.status = :status', { status: EventStatus.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .andWhere('categories.id IN (:...categories)', { categories })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getMany();

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
        .where('event.status = :status', { status: EventStatus.Published })
        .andWhere('(group.id != :groupId OR group.id IS NULL)', { groupId })
        .orderBy('RANDOM()')
        .limit(maxEvents)
        .getRawMany();

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
    const shortCode = await generateShortCode();
    if (updateEventDto.name) {
      slugifiedName = `${slugify(updateEventDto.name, {
        strict: true,
        lower: true,
      })}-${shortCode.toLowerCase()}`;
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

  async remove(id: number): Promise<void> {
    await this.getTenantSpecificEventRepository();
    const event = await this.findOne(id);
    await this.eventRepository.remove(event);
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

    return this.eventRepository
      .createQueryBuilder('event')
      .where({
        visibility: EventVisibility.Public,
        status: EventStatus.Published,
      })
      .orderBy('RANDOM()')
      .limit(5)
      .getMany(); // TODO: later provide featured flag or configuration object
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

  async editEvent(id: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventRepository.findOne({
      where: { id },
      relations: ['group', 'categories'],
    });
  }

  async cancelAttendingEvent(id: number, userId: number) {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.cancelAttendingEvent(id, userId);
  }

  async attendEvent(
    id: number,
    createEventAttendeeDto: CreateEventAttendeeDto,
  ) {
    await this.getTenantSpecificEventRepository();

    const event = await this.findOne(id);
    const participantRole = await this.eventRoleService.findOne(
      EventAttendeeRole.Participant,
    );

    if (!participantRole) {
      throw new NotFoundException('Participant role not found');
    }

    if (event.allowWaitlist) {
      const count = await this.eventAttendeeService.getEventAttendeesCount(id);
      if (count >= event.maxAttendees) {
        return this.eventAttendeeService.create({
          ...createEventAttendeeDto,
          status: EventAttendeeStatus.Waitlist,
          role: participantRole,
        });
      }
    }

    if (event.requireApproval) {
      return this.eventAttendeeService.create({
        ...createEventAttendeeDto,
        status: EventAttendeeStatus.Pending,
        role: participantRole,
      });
    }

    return this.eventAttendeeService.create({
      ...createEventAttendeeDto,
      status: EventAttendeeStatus.Confirmed,
      role: participantRole,
    });
  }

  async getEventAttendees(eventId: number, pagination: PaginationDto) {
    await this.getTenantSpecificEventRepository();
    return this.eventAttendeeService.getEventAttendees(eventId, pagination);
  }
}
